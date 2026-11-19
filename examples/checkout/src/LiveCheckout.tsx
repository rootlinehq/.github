import { useEffect, useRef, useState } from "react";
import {
  loadRootline,
  submitPayment,
  type CheckoutComponents,
  type RootlineSdk,
} from "./sdk";

const LOAD_TIMEOUT_MS = 15_000;

interface Props {
  secret: string;
  amount: string;
  onComplete(): void;
  onFailed(): void;
}

export function LiveCheckout({ secret, amount, onComplete, onFailed }: Props) {
  const sdk = useRef<RootlineSdk | null>(null);
  const components = useRef<CheckoutComponents | null>(null);
  const submitting = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [terminal, setTerminal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    setReady(false);
    setError("");
    // The SDK reports load failures, such as a domain that is not allowed,
    // only inside its own frame, so stop waiting after a while.
    const timeout = setTimeout(() => {
      if (!cancelled)
        setError(
          "The payment form did not load. Check that this domain is an allowed domain on your account.",
        );
    }, LOAD_TIMEOUT_MS);
    void loadRootline()
      .then((Rootline) => {
        if (cancelled) return;
        const rootline = new Rootline({ locale: "en" });
        const checkout = rootline.components("checkout", {
          paymentSessionSecret: secret,
        });
        const methods = checkout.create("payment-methods-list", {
          only: ["visa", "mastercard", "amex", "ideal"],
        });
        sdk.current = rootline;
        components.current = checkout;
        const onReady = () => {
          clearTimeout(timeout);
          if (!cancelled) {
            setError("");
            setReady(true);
          }
        };
        methods.on("ready", onReady);
        cleanup = () => {
          methods.off("ready", onReady);
          methods.unmount();
        };
        methods.mount("#payment-methods");
      })
      .catch((cause: unknown) => {
        clearTimeout(timeout);
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "Checkout could not initialize. Check your staging account and allowed domains.",
          );
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      cleanup();
      sdk.current = null;
      components.current = null;
    };
  }, [secret, attempt]);

  async function pay() {
    if (submitting.current || !ready || !sdk.current || !components.current)
      return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await submitPayment(sdk.current, components.current);
      if (result.cancelled) return;
      if (result.error) {
        setError(result.error.message);
        if (result.error.code === "payment_failed") {
          setTerminal(true);
          onFailed();
        }
        return;
      }
      if (result.redirect) {
        const url = new URL(result.redirect, window.location.origin);
        if (
          url.protocol !== "https:" &&
          url.origin !== window.location.origin
        ) {
          throw new Error(
            "Unexpected payment redirect. Please check the payment status.",
          );
        }
        window.location.assign(url.href);
        return;
      }
      onComplete();
    } catch {
      setError(
        "Checkout could not complete. Check the payment status before trying again.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <div id="payment-methods" />
      {!ready && !error && (
        <p role="status" className="muted">
          Loading secure payment methods…
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!ready && error && (
        <button className="secondary" onClick={() => setAttempt(attempt + 1)}>
          Retry loading checkout
        </button>
      )}
      <button
        className="primary"
        disabled={!ready || busy || terminal}
        onClick={() => void pay()}
      >
        {busy ? "Processing…" : `Pay ${amount}`}
      </button>
      <p className="fine-print">
        Payment details are collected by Rootline. This application does not
        receive card details.
      </p>
    </>
  );
}
