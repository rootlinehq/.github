import { createHmac, timingSafeEqual } from "node:crypto";
import type { CheckoutStatus } from "../src/types";

export interface PaymentEvent {
  eventType: string;
  paymentId: string;
  reference: string;
  status: CheckoutStatus;
}

// Rootline signs the raw request body with HMAC-SHA256 and the endpoint's
// secret. The docs do not state the digest encoding, so both hex and base64
// are accepted; each can only be produced with the secret.
export function verifySignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!secret || !signature) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(signature.trim());
  return [digest.toString("hex"), digest.toString("base64")].some(
    (expected) =>
      received.length === expected.length &&
      timingSafeEqual(received, Buffer.from(expected)),
  );
}

// Returns the payment from a payment.* event, or undefined for other events.
export function parsePaymentEvent(rawBody: Buffer): PaymentEvent | undefined {
  const event: unknown = JSON.parse(rawBody.toString("utf8"));
  if (typeof event !== "object" || event === null) return undefined;
  const { event_type: eventType, payment } = event as {
    event_type?: unknown;
    payment?: {
      id?: unknown;
      reference?: unknown;
      checkout_status?: unknown;
    };
  };
  if (
    typeof eventType !== "string" ||
    !eventType.startsWith("payment.") ||
    typeof payment?.id !== "string" ||
    typeof payment.reference !== "string" ||
    !["open", "succeeded", "failed"].includes(String(payment.checkout_status))
  )
    return undefined;
  return {
    eventType,
    paymentId: payment.id,
    reference: payment.reference,
    status: payment.checkout_status as CheckoutStatus,
  };
}
