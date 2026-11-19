import type { CheckoutStatus } from "../src/types";
import { PRODUCT } from "./product";

export const API_URL = "https://payment-api.staging.rootline.com/v1";
export const API_VERSION = "2024-04-23";

export class DemoError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 502,
  ) {
    super(message);
  }
}

export interface RootlinePayment {
  id: string;
  reference: string;
  checkout_status: CheckoutStatus;
  payment_session_secret?: string;
}

export interface PaymentGateway {
  create(reference: string): Promise<RootlinePayment>;
  get(paymentId: string, reference: string): Promise<RootlinePayment>;
}

export function stagingGateway(
  apiKey: string,
  accountId: string,
  origin: string,
  request: typeof fetch = fetch,
): PaymentGateway {
  async function call(path: string, reference: string, create: boolean) {
    let response: Response;
    try {
      response = await request(`${API_URL}${path}`, {
        method: create ? "POST" : "GET",
        headers: {
          "x-api-key": apiKey,
          "rootline-version": API_VERSION,
          "content-type": "application/json",
        },
        body: create
          ? JSON.stringify({
              account_id: accountId,
              reference,
              amount: PRODUCT.amount,
              create_payment_session_secret: true,
              return_url: `${origin}/result`,
            })
          : undefined,
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
      });
    } catch {
      throw new DemoError(
        create ? "creation_uncertain" : "status_unavailable",
        create
          ? "The payment creation outcome is unknown. Check this order reference in the staging dashboard before trying again."
          : "We could not retrieve the payment status. Please check again.",
      );
    }
    if (!response.ok) {
      const rejected =
        create && [400, 401, 403, 404, 422].includes(response.status);
      throw new DemoError(
        rejected
          ? "creation_rejected"
          : create
            ? "creation_uncertain"
            : "status_unavailable",
        rejected
          ? "Rootline rejected the request. Check your staging credentials, account access, and configuration."
          : create
            ? "The payment creation outcome is unknown. Check this order reference in the staging dashboard before trying again."
            : "We could not retrieve the payment status. Please check again.",
      );
    }
    let payment: RootlinePayment;
    try {
      const value: unknown = await response.json();
      if (typeof value !== "object" || value === null) throw new Error();
      payment = value as RootlinePayment;
      if (
        typeof payment.id !== "string" ||
        !/^pmt_[A-Za-z0-9]+$/.test(payment.id) ||
        payment.reference !== reference ||
        !["open", "succeeded", "failed"].includes(payment.checkout_status) ||
        (create && typeof payment.payment_session_secret !== "string") ||
        (!create && payment.id !== path.slice("/payments/".length))
      )
        throw new Error();
    } catch {
      throw new DemoError(
        create ? "creation_uncertain" : "status_unavailable",
        "We could not verify Rootline's response. Check this order in the staging dashboard.",
      );
    }
    return payment;
  }
  return {
    create: (reference) => call("/payments", reference, true),
    get: (paymentId, reference) =>
      call(`/payments/${encodeURIComponent(paymentId)}`, reference, false),
  };
}
