import { useEffect, useState } from "react";
import { CheckoutRequestError, api, message } from "./api";
import { LiveCheckout } from "./LiveCheckout";
import { PreviewCheckout } from "./PreviewCheckout";
import type { Checkout, PublicConfig } from "./types";

function price(quantity: string) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
  }).format(Number(quantity));
}

export function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [result, setResult] = useState(window.location.pathname === "/result");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Payment creation timed out or returned an unexpected response. The order
  // is kept until the user starts over, so its reference can be checked.
  const [uncertain, setUncertain] = useState(false);

  useEffect(() => {
    void api<PublicConfig>("/api/config")
      .then(setConfig)
      .catch((cause) => setError(message(cause)));
  }, []);
  useEffect(() => {
    if (result) void readStatus();
  }, [result]);

  async function begin() {
    setBusy(true);
    setError("");
    try {
      const payment = await api<Checkout>("/api/checkout", {});
      setCheckout(payment);
      if (payment.status !== "open") complete();
    } catch (cause) {
      setError(message(cause));
      if (
        cause instanceof CheckoutRequestError &&
        cause.code === "creation_uncertain"
      )
        setUncertain(true);
    } finally {
      setBusy(false);
    }
  }
  function complete() {
    window.history.replaceState({}, "", "/result");
    setResult(true);
  }
  async function readStatus() {
    setBusy(true);
    setError("");
    try {
      setCheckout(await api<Checkout>("/api/checkout"));
    } catch (cause) {
      setCheckout(null);
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  async function restart() {
    setBusy(true);
    setError("");
    try {
      await api("/api/checkout/restart", {});
      setCheckout(null);
      setFailed(false);
      setUncertain(false);
      setResult(false);
      window.history.replaceState({}, "", "/");
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  function resume() {
    setCheckout(null);
    setResult(false);
    window.history.replaceState({}, "", "/");
  }

  const preview = config?.mode === "preview";
  const status = checkout?.status;
  const total = config ? price(config.product.amount.quantity) : "…";
  return (
    <>
      <header className="site-header">
        <a
          className="brand"
          href="https://rootline.cafe"
          aria-label="Rootline Cafe"
        >
          <img
            src="/rootline-logo.svg"
            alt="Rootline"
            width="145"
            height="24"
          />
          <span>Cafe</span>
          <span className="example-tag">Example</span>
        </a>
        <a href="https://docs.rootline.com/guides/payments/components/standard-flow">
          Read the integration guide <span aria-hidden="true">↗</span>
        </a>
      </header>
      {preview && (
        <div className="mode-banner">
          Simulated preview — no payment is processed
        </div>
      )}
      {config?.mode === "staging" && (
        <div className="mode-banner staging">
          Staging checkout — use test payment details only
        </div>
      )}
      <main>
        <div className="intro">
          <p className="eyebrow">ROOTLINE CAFE · CHECKOUT COMPONENTS EXAMPLE</p>
          <h1>{result ? "Your payment result" : "Your café checkout"}</h1>
          <p className="muted">
            {preview
              ? "A cappuccino and a croissant. Explore the flow, then connect your staging account."
              : "A cappuccino and a croissant. One payment, embedded with Rootline."}
          </p>
        </div>
        <div className="checkout-layout">
          <section className="order-panel" aria-labelledby="order-heading">
            <div className="order-total">
              <p className="eyebrow">TOTAL</p>
              <strong className="display-total">{total}</strong>
            </div>
            <h2 id="order-heading" className="section-label">
              Your café order
            </h2>
            <div className="order-items">
              {config?.product.items.map((item) => (
                <div className="order-item" key={item.name}>
                  <img
                    src={item.image}
                    alt={item.name}
                    width="56"
                    height="56"
                  />
                  <div className="item-description">
                    <strong>{item.name}</strong>
                    <span>
                      {item.quantity} × {price(item.amount.quantity)}
                    </span>
                  </div>
                  <strong className="item-price">
                    {price(item.amount.quantity)}
                  </strong>
                </div>
              ))}
              {!config && <p className="muted">Loading your order…</p>}
            </div>
            <p className="order-description">{config?.product.description}</p>
            <h3 className="section-label">Overview</h3>
            <div className="order-overview">
              <div className="subtotal">
                <span>Subtotal</span>
                <span>{total}</span>
              </div>
              <div className="total">
                <strong>Total</strong>
                <strong>{total}</strong>
              </div>
            </div>
            <p className="fine-print">
              Fixed demo order · EUR · No food is ordered or delivered
            </p>
            <p className="powered-by">
              Powered by{" "}
              <img
                src="/rootline-logo.svg"
                alt="Rootline"
                width="83"
                height="14"
              />
            </p>
          </section>
          <section className="payment-panel" aria-labelledby="payment-heading">
            <p className="eyebrow">{result ? "CHECKOUT OUTCOME" : "PAYMENT"}</p>
            <h2 id="payment-heading">
              {result
                ? status === "succeeded"
                  ? "Payment authorized"
                  : status === "failed"
                    ? "Payment declined"
                    : "Payment status"
                : "Complete your purchase"}
            </h2>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {!config && !error && <p role="status">Loading the example…</p>}
            {result ? (
              <>
                {busy && <p role="status">Checking payment status…</p>}
                {!busy && checkout && (
                  <>
                    <div
                      className={`result-symbol ${status}`}
                      aria-hidden="true"
                    >
                      {status === "succeeded"
                        ? "✓"
                        : status === "failed"
                          ? "×"
                          : "…"}
                    </div>
                    <p role="status">
                      {status === "succeeded"
                        ? "The payment was authorized. This result does not mean funds have settled or been paid out."
                        : status === "failed"
                          ? "This payment was declined. Start a new attempt to try again."
                          : "The payment is still open. Further action may be needed; check its status or return to checkout."}
                    </p>
                    <p className="order-reference">
                      Order reference
                      <br />
                      <code>{checkout.orderId}</code>
                    </p>
                    {status === "open" ? (
                      <>
                        <button className="secondary" onClick={resume}>
                          Return to checkout
                        </button>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => void restart()}
                        >
                          Start a new order instead
                        </button>
                      </>
                    ) : (
                      <button
                        className="primary"
                        onClick={() => void restart()}
                      >
                        {" "}
                        {status === "failed"
                          ? "Try a new payment"
                          : "Start another demo purchase"}
                      </button>
                    )}
                  </>
                )}
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void readStatus()}
                >
                  Check status again
                </button>
                <p className="fine-print">
                  {preview
                    ? "This is a simulated result."
                    : "Status is retrieved from Rootline by the server."}{" "}
                  This example does not fulfill orders.
                </p>
                {!busy && !checkout && (
                  <button className="secondary" onClick={resume}>
                    Back to example
                  </button>
                )}
              </>
            ) : !config?.configured && config ? (
              <>
                <div className="preview-note">
                  Add your staging API key and account ID to <code>.env</code>,
                  enable card/iDEAL, and allow localhost. Restart the server
                  when ready.
                </div>
                <a
                  className="button-link"
                  href="https://rootline.com/contact/sales"
                >
                  Request staging access ↗
                </a>
                <p className="fine-print">
                  To explore without credentials, stop the server and run{" "}
                  <code>npm run preview</code>.
                </p>
              </>
            ) : !checkout ? (
              <>
                <p className="muted">
                  {preview
                    ? "See what your customers could experience. No credentials or card details needed."
                    : `Start checkout to create a ${total} staging payment using the server-side API.`}
                </p>
                {uncertain ? (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void restart()}
                  >
                    Start over
                  </button>
                ) : (
                  <button
                    className="primary"
                    disabled={!config || busy}
                    onClick={() => void begin()}
                  >
                    {busy ? "Preparing checkout…" : "Start checkout"}
                  </button>
                )}
              </>
            ) : preview ? (
              <PreviewCheckout amount={total} onComplete={complete} />
            ) : checkout.paymentSessionSecret ? (
              <>
                <LiveCheckout
                  key={checkout.orderId}
                  secret={checkout.paymentSessionSecret}
                  amount={total}
                  onComplete={complete}
                  onFailed={() => setFailed(true)}
                />
                {failed && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void restart()}
                  >
                    Try a new payment
                  </button>
                )}
                <button className="text-button" onClick={complete}>
                  Check payment status
                </button>
              </>
            ) : (
              <p className="error" role="alert">
                No checkout session is available. Check the payment status
                before trying again.
              </p>
            )}
          </section>
        </div>
        <aside className="how-it-works">
          <div>
            <span>01</span>
            <strong>Create a payment</strong>
            <p>Your server owns the order and amount.</p>
          </div>
          <div>
            <span>02</span>
            <strong>Embed checkout</strong>
            <p>Checkout Components collect payment details securely.</p>
          </div>
          <div>
            <span>03</span>
            <strong>Display the result</strong>
            <p>Your server checks the payment status.</p>
          </div>
        </aside>
      </main>
      <footer>
        <span>Built with Rootline · An integration example</span>
        <a href="https://docs.rootline.com">Documentation ↗</a>
      </footer>
    </>
  );
}
