import type { Basket } from "./basket.ts";
import { CURRENCY, MAX_QUANTITY, MENU, euros } from "./menu.ts";
import type { CheckoutStatus } from "./rootline.ts";

export type Mode = "preview" | "staging";

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

function layout(mode: Mode, title: string, main: string, head = ""): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · Rootline Cafe</title>
${head}
<style>
  body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 0 auto; padding: 1.5rem 1rem; color: #111; line-height: 1.5; }
  .banner { background: #fff4d6; border: 1px solid #e8c766; padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.9rem; }
  table { width: 100%; border-collapse: collapse; }
  td, th { text-align: left; padding: 0.4rem 0; border-bottom: 1px solid #e5e5e5; }
  td.price, th.price { text-align: right; }
  button { font: inherit; padding: 0.6rem 1.2rem; border: 0; border-radius: 6px; background: #111; color: #fff; cursor: pointer; }
  code { background: #f2f2f2; padding: 0.1rem 0.3rem; border-radius: 4px; overflow-wrap: anywhere; }
  .error { color: #a40000; }
  footer { margin-top: 2.5rem; font-size: 0.9rem; color: #444; }
</style>
</head>
<body>
${mode === "preview" ? '<p class="banner">Preview mode: payments are simulated and nothing is sent to Rootline.</p>' : ""}
<main>
${main}
</main>
${orderLinkHelp()}
</body>
</html>`;
}

// The link format, documented on every page so agents that land anywhere in
// the shop can find it.
function orderLinkHelp(): string {
  return `<footer id="order-links">
<h2>Order links</h2>
<p>Assistants and agents can send a customer straight to checkout with a filled basket:</p>
<p><code>/checkout?item=&lt;item&gt;:&lt;quantity&gt;&amp;ref=&lt;your-name&gt;</code></p>
<ul>
  <li><code>item</code>: an item ID from the menu and a quantity from 1 to ${MAX_QUANTITY}. Repeat it for each item.</li>
  <li><code>ref</code> (optional): lowercase letters, digits, and hyphens, to identify who sent the customer.</li>
</ul>
<p>Example: <a href="/checkout?item=cappuccino:2&amp;item=croissant:1&amp;ref=concierge-bot"><code>/checkout?item=cappuccino:2&amp;item=croissant:1&amp;ref=concierge-bot</code></a></p>
<p>The customer reviews the basket and pays. Prices are always the menu prices.</p>
</footer>`;
}

export function menuPage(mode: Mode, origin: string): string {
  // Structured data with prices and an order link per item, so agents can
  // read the menu without scraping the layout.
  const data = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Rootline Cafe menu",
    itemListElement: MENU.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Product",
        sku: item.id,
        name: item.name,
        description: item.description,
        offers: {
          "@type": "Offer",
          price: euros(item.price),
          priceCurrency: CURRENCY,
          url: `${origin}/checkout?item=${item.id}:1`,
        },
      },
    })),
  };
  const rows = MENU.map(
    (item) => `<tr>
  <td><strong>${escape(item.name)}</strong><br>${escape(item.description)}<br><small>ID: <code>${item.id}</code></small></td>
  <td class="price">€${euros(item.price)}</td>
  <td class="price"><a href="/checkout?item=${item.id}:1">Order</a></td>
</tr>`,
  ).join("\n");
  return layout(
    mode,
    "Menu",
    `<h1>Rootline Cafe</h1>
<table>
<thead><tr><th>Item</th><th class="price">Price</th><th></th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`,
    `<script type="application/ld+json">${JSON.stringify(data).replaceAll("<", "\\u003c")}</script>`,
  );
}

export function basketPage(mode: Mode, basket: Basket): string {
  const rows = basket.lines
    .map(
      (line) =>
        `<tr><td>${line.quantity} × ${escape(line.item.name)}</td><td class="price">€${euros(line.item.price * line.quantity)}</td></tr>`,
    )
    .join("\n");
  const fields = basket.lines
    .map(
      (line) =>
        `<input type="hidden" name="item" value="${line.item.id}:${line.quantity}">`,
    )
    .join("\n");
  return layout(
    mode,
    "Checkout",
    `<h1>Your order</h1>
<table>
${rows}
<tr><th>Total</th><th class="price">€${euros(basket.total)}</th></tr>
</table>
<form method="post" action="/checkout">
${fields}
${basket.ref !== "direct" ? `<input type="hidden" name="ref" value="${basket.ref}">` : ""}
<p><button type="submit">Pay €${euros(basket.total)}</button></p>
</form>
<p><a href="/">Back to the menu</a></p>`,
  );
}

export function wrongHostPage(mode: Mode, origin: string): string {
  return layout(
    mode,
    "Wrong address",
    `<h1>Open the shop at its configured address</h1>
<p>This server answers at <a href="${escape(origin)}"><code>${escape(origin)}</code></a>. Change <code>APP_ORIGIN</code> in <code>.env</code> to use another address.</p>`,
  );
}

export function errorPage(mode: Mode, message: string): string {
  return layout(
    mode,
    "Order link not valid",
    `<h1>This order link is not valid</h1>
<p class="error">${escape(message)}</p>
<p><a href="/">See the menu</a></p>`,
  );
}

const outcomes: Record<CheckoutStatus, [string, string]> = {
  succeeded: ["Payment received", "Your order is confirmed."],
  open: [
    "Payment not completed",
    "Checkout is still open. Return to the payment page to finish paying.",
  ],
  failed: [
    "Payment failed",
    "The payment did not go through. Start a new order to try again.",
  ],
};

export function resultPage(
  mode: Mode,
  reference: string,
  status: CheckoutStatus,
  checkoutUrl = "",
): string {
  const [title, text] = outcomes[status];
  const resume =
    status === "open" && checkoutUrl
      ? `<p><a href="${escape(checkoutUrl)}">Return to the payment page</a></p>`
      : "";
  return layout(
    mode,
    title,
    `<h1>${title}</h1>
<p>${text}</p>
<p>Order reference: <code>${escape(reference)}</code></p>
${resume}<p><a href="/">Back to the menu</a></p>`,
  );
}

export function previewCheckoutPage(paymentId: string, amount: string): string {
  return layout(
    "preview",
    "Simulated checkout",
    `<h1>Simulated hosted checkout</h1>
<p>In staging, the customer pays €${escape(amount)} here in Rootline's hosted checkout. Choose an outcome:</p>
<form method="post" action="/preview/checkout">
<input type="hidden" name="payment" value="${escape(paymentId)}">
<p><button name="status" value="succeeded">Pay successfully</button>
<button name="status" value="failed">Decline payment</button>
<button name="status" value="open">Leave without paying</button></p>
</form>`,
  );
}

export function notFoundPage(mode: Mode): string {
  return layout(
    mode,
    "Not found",
    `<h1>Page not found</h1><p><a href="/">See the menu</a></p>`,
  );
}
