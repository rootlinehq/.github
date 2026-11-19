import { useState } from "react";
import { api, message } from "./api";
import type { CheckoutStatus } from "./types";

export function PreviewCheckout({
  amount,
  onComplete,
}: {
  amount: string;
  onComplete(): void;
}) {
  const [method, setMethod] = useState("card");
  const [outcome, setOutcome] = useState<CheckoutStatus>("succeeded");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function simulate() {
    setBusy(true);
    setError("");
    try {
      await api("/api/preview/complete", { status: outcome });
      onComplete();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <fieldset className="method-options">
        <legend>Explore a payment method</legend>
        {[
          ["card", "Card"],
          ["ideal", "iDEAL"],
        ].map(([value, label]) => (
          <label
            className={method === value ? "method selected" : "method"}
            key={value}
          >
            <input
              type="radio"
              name="method"
              value={value}
              checked={method === value}
              onChange={() => setMethod(value)}
            />
            <span className="method-icon" aria-hidden="true">
              <img
                src={`/payment-methods/${value}.svg`}
                alt=""
                width="28"
                height="28"
              />
            </span>
            {label}
            <span className="method-note">Simulated</span>
          </label>
        ))}
      </fieldset>
      <div className="preview-note">
        No payment details needed. Choose an outcome to explore the result page.
      </div>
      <label className="outcome-label" htmlFor="outcome">
        Preview outcome
      </label>
      <select
        id="outcome"
        value={outcome}
        onChange={(event) => setOutcome(event.target.value as CheckoutStatus)}
      >
        <option value="succeeded">Authorized</option>
        <option value="open">Pending</option>
        <option value="failed">Declined</option>
      </select>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary"
        disabled={busy}
        onClick={() => void simulate()}
      >
        {busy ? "Opening result…" : `Simulate ${amount} payment`}
      </button>
      <p className="fine-print">
        This preview illustrates the page flow. It does not load Checkout
        Components.
      </p>
    </>
  );
}
