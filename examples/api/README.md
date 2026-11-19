# Create your first payment

[← Rootline overview](../../README.md) · [Embed checkout](../checkout/) · [Onboard a merchant](../onboarding/) · [Collect platform fees](../saas/) · [Agent-ready checkout](../agentic/)

This guide creates a payment with the [Payment API](https://docs.rootline.com/guides/payments/payment-api?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=api) and completes it in Rootline's hosted checkout. You run it from the command line; no application is needed.

## Prerequisites

- Access to the [staging dashboard](https://dashboard.staging.rootline.com). Staging is Rootline's test environment and processes no real funds.
- An API key for an API user with the `PaymentApi` role, created under **Developers → API users**. See [API keys](https://docs.rootline.com/guides/get-started/api-keys?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=api).
- Your platform account ID, listed under **Accounts**.
- `curl`, or Node.js 18 or later.

## Create the payment

In the examples below, replace:

- `YOUR_API_KEY` with your staging API key.
- `YOUR_ACCOUNT_ID` with your platform account ID.
- `https://example.com/result` with the page the customer returns to after checkout.

The `reference` is your own unique ID for the order; change it for every new payment.

With curl:

```bash
curl https://payment-api.staging.rootline.com/v1/payments \
  --request POST \
  --header 'content-type: application/json' \
  --header 'x-api-key: YOUR_API_KEY' \
  --header 'rootline-version: 2024-04-23' \
  --data '{
    "account_id": "YOUR_ACCOUNT_ID",
    "reference": "cafe-demo-001",
    "amount": { "currency": "EUR", "quantity": "6.25" },
    "return_url": "https://example.com/result"
  }'
```

Or with Node.js. Save this as `create-payment.mjs` and run `node create-payment.mjs`:

```javascript
const response = await fetch(
  "https://payment-api.staging.rootline.com/v1/payments",
  {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": "YOUR_API_KEY",
      "rootline-version": "2024-04-23",
    },
    body: JSON.stringify({
      account_id: "YOUR_ACCOUNT_ID",
      reference: "cafe-demo-001",
      amount: { currency: "EUR", quantity: "6.25" },
      return_url: "https://example.com/result",
    }),
  },
);
console.log(response.status, await response.json());
```

The API key is a secret. Keep it out of version control, and use it only on a server, never in browser code.

- `amount.quantity` is a decimal string in the currency's main unit: `"6.25"` is €6.25.
- Every request requires the `x-api-key` and `rootline-version` headers.
- In production, the server determines the amount; it is never taken from client input.

Example response (abbreviated):

```json
{
  "id": "pmt_example",
  "reference": "cafe-demo-001",
  "amount": { "currency": "EUR", "quantity": "6.25" },
  "checkout_status": "open",
  "next_action": {
    "checkout_url": "https://checkout.staging.rootline.com/payments/pmt_example/checkout"
  }
}
```

## Complete the payment

Open `next_action.checkout_url` from the response in a browser to load hosted checkout. Use the [test card details](https://docs.rootline.com/guides/payment-methods/cards/cards?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=api) from the documentation.

## Retrieve the status

Store the payment `id` with the order. When the customer returns to your return URL, retrieve the payment from your server. Replace `PAYMENT_ID` with the `id` from the response:

```bash
curl https://payment-api.staging.rootline.com/v1/payments/PAYMENT_ID \
  --header 'x-api-key: YOUR_API_KEY' \
  --header 'rootline-version: 2024-04-23'
```

`checkout_status` in the response has one of three values:

| `checkout_status` | Meaning                                                 |
| ----------------- | ------------------------------------------------------- |
| `open`            | Checkout is not yet complete.                           |
| `succeeded`       | The payment is authorized.                              |
| `failed`          | The payment failed. A new payment is required to retry. |

Retrieve the status server-side; a redirect to the return URL does not confirm payment. For order fulfillment, use [webhooks](https://docs.rootline.com/guides/webhooks/configure-webhooks?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=api), which notify your server of every payment status change.

## Next steps

- [Embed checkout in your app](../checkout/): render the payment form in your own application.
- [Collect platform fees](../saas/): route the payment to a merchant on your platform and collect a platform fee.
- Documentation: [Quick start](https://docs.rootline.com/guides/get-started/quick-start?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=api) · [Payment API](https://docs.rootline.com/guides/payments/payment-api?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=api) · [Payment statuses](https://docs.rootline.com/guides/payments/payment-statuses?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=api)

Questions about this example or Rootline? [Contact Rootline](https://rootline.com/contact/sales?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=api).
