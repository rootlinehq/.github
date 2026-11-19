import { randomUUID } from "node:crypto";

export const API_URL = "https://payment-api.staging.rootline.com/v1";
export const API_VERSION = "2024-04-23";

export type CheckoutStatus = "open" | "succeeded" | "failed";

export interface Payment {
  id: string;
  reference: string;
  checkout_status: CheckoutStatus;
  checkoutUrl: string;
}

export interface CreatePayment {
  reference: string;
  // Decimal string in euros, for example "9.75".
  amount: string;
  returnUrl: string;
}

export interface Gateway {
  create(payment: CreatePayment): Promise<Payment>;
  get(paymentId: string): Promise<Payment>;
}

// Rootline's Payment API in the staging environment. The customer pays in
// hosted checkout, which shows the payment methods enabled for the account.
export function stagingGateway(
  apiKey: string,
  accountId: string,
  request: typeof fetch = fetch,
): Gateway {
  async function call(path: string, body?: object): Promise<Payment> {
    const response = await request(`${API_URL}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "rootline-version": API_VERSION,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      throw new Error(`Rootline responded with HTTP ${response.status}.`);
    const payment = (await response.json()) as {
      id: string;
      reference: string;
      checkout_status: CheckoutStatus;
      next_action?: { checkout_url?: string };
    };
    if (body && !payment.next_action?.checkout_url)
      throw new Error("Rootline's response has no checkout URL.");
    return {
      id: payment.id,
      reference: payment.reference,
      checkout_status: payment.checkout_status,
      checkoutUrl: payment.next_action?.checkout_url ?? "",
    };
  }
  return {
    create: ({ reference, amount, returnUrl }) =>
      call("/payments", {
        account_id: accountId,
        reference,
        amount: { currency: "EUR", quantity: amount },
        return_url: returnUrl,
      }),
    get: (paymentId) => call(`/payments/${encodeURIComponent(paymentId)}`),
  };
}

// Preview mode: a local stand-in for the Payment API and hosted checkout, so
// the example runs without credentials. It sends nothing to Rootline.
export interface PreviewGateway extends Gateway {
  // Ends the simulated checkout with the given status and returns the URL to
  // send the customer to. "open" leaves the payment unpaid, as when the
  // customer closes hosted checkout.
  complete(paymentId: string, status: CheckoutStatus): string | undefined;
  find(paymentId: string): (Payment & { amount: string }) | undefined;
}

export function previewGateway(origin: string): PreviewGateway {
  const payments = new Map<
    string,
    Payment & { amount: string; returnUrl: string }
  >();
  return {
    async create({ reference, amount, returnUrl }) {
      const id = `pmt_preview${randomUUID().replaceAll("-", "").slice(0, 12)}`;
      const payment = {
        id,
        reference,
        amount,
        returnUrl,
        checkout_status: "open" as const,
        checkoutUrl: `${origin}/preview/checkout?payment=${id}`,
      };
      payments.set(id, payment);
      return payment;
    },
    async get(paymentId) {
      const payment = payments.get(paymentId);
      if (!payment) throw new Error("Unknown payment.");
      return payment;
    },
    complete(paymentId, status) {
      const payment = payments.get(paymentId);
      if (!payment || payment.checkout_status !== "open") return undefined;
      payment.checkout_status = status;
      return payment.returnUrl;
    },
    find: (paymentId) => payments.get(paymentId),
  };
}
