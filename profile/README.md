<p align="center">
  <a href="https://rootline.com/?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=profile">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/rootlinehq/.github/main/assets/rootline-logo-dark.svg">
      <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/rootlinehq/.github/main/assets/rootline-logo-light.svg">
      <img src="https://raw.githubusercontent.com/rootlinehq/.github/main/assets/rootline-logo-light.svg" alt="Rootline" width="240" height="39">
    </picture>
  </a>
</p>

<h1 align="center">Embedded payments for modern commerce</h1>

<p align="center">Online and in-person payments, splits, fees, and automatic reconciliation through one API.</p>

<p align="center">
  <a href="https://docs.rootline.com/guides/get-started/introduction?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=profile">Documentation</a> &nbsp; · &nbsp;
  <a href="https://rootline.com/?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=profile">Website</a> &nbsp; · &nbsp;
  <a href="https://rootline.com/contact/sales?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=profile">Request a demo</a>
</p>

---

Rootline is a payments API for SaaS platforms and marketplaces. It accepts online and in-person payments, routes funds to merchants with split payments, collects platform fees, and automates payouts. Payments, fees, refunds, chargebacks, and payouts share one data model, so every transaction is reconciled automatically.

Rootline supports payments for single merchants, multi-brand businesses, platforms, and multi-entity structures across online, in-person (POS), and agentic channels. See how businesses use Rootline in our [case studies](https://rootline.com/case-studies?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=profile).

## Quick start

Create a payment in Rootline's staging environment with a single request. Replace `YOUR_API_KEY` with your staging API key and `YOUR_ACCOUNT_ID` with your platform account ID:

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

The response contains `next_action.checkout_url`. Open it in a browser to pay in hosted checkout. [Create your first payment](https://github.com/rootlinehq/.github/tree/main/examples/api/) covers the full flow, including a Node.js version and status retrieval.

## Capabilities

| Capability              | Description                                                                                                             | Learn more                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Online payments**     | Cards, wallets, and 30+ local payment methods across Europe, through hosted checkout, Checkout Components, or the API.  | [Website](https://rootline.com/online-payments?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=profile) · [Docs](https://docs.rootline.com/guides/payments/payment-api?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=profile) · [Example](https://github.com/rootlinehq/.github/tree/main/examples/checkout/)              |
| **In-person payments**  | Payment terminals and POS integrations on the same API as online payments.                                              | [Website](https://rootline.com/in-person-payments?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=profile) · [Docs](https://docs.rootline.com/guides/in-person-payments/accept-in-person-payments?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=profile)                     |
| **Money management**    | Split payments across parties in real time, apply platform fees, settle balances to sub-accounts, and schedule payouts. | [Website](https://rootline.com/money-management?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=profile) · [Docs](https://docs.rootline.com/guides/payments/split-a-payment-to-a-seller?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=profile) · [Example](https://github.com/rootlinehq/.github/tree/main/examples/saas/) |
| **Merchant onboarding** | Onboard merchants with company details, locations, bank account, and agreements captured in one flow.                   | [Docs](https://docs.rootline.com/guides/onboarding/onboard-a-company?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=profile) · [Example](https://github.com/rootlinehq/.github/tree/main/examples/onboarding/)                                                                                                                                  |
| **Ops and insights**    | Transaction-level matching, settlement views, and visibility into interchange, scheme fees, and margins.                | [Website](https://rootline.com/ops?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=profile) · [Docs](https://docs.rootline.com/guides/reconciliation/introduction-to-reconciliation?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=profile)                                   |
| **Agentic commerce**    | Agent-initiated payments as part of the standard transaction flow.                                                      | [Website](https://rootline.com/agentic-commerce?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=profile) · [Docs](https://docs.rootline.com/guides/agentic-commerce/mcp?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=profile) · [Example](https://github.com/rootlinehq/.github/tree/main/examples/agentic/)              |

## Examples

Five examples, from a first payment to agentic commerce:

| Example                                                      | Description                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| [**Create your first payment →**](https://github.com/rootlinehq/.github/tree/main/examples/api/)           | Create a payment with the Payment API and complete it in hosted checkout.                  |
| [**Embed checkout in your app →**](https://github.com/rootlinehq/.github/tree/main/examples/checkout/)     | A React + TypeScript app that integrates Checkout Components.                              |
| [**Onboard a merchant →**](https://github.com/rootlinehq/.github/tree/main/examples/onboarding/)           | Create the merchant's company, send the merchant to hosted onboarding, get the account ID. |
| [**Collect platform fees in your SaaS →**](https://github.com/rootlinehq/.github/tree/main/examples/saas/) | Route a payment to a merchant on your platform and collect a platform fee.                 |
| [**Make your checkout agent-ready →**](https://github.com/rootlinehq/.github/tree/main/examples/agentic/)  | Let AI assistants send customers to your checkout with a filled basket.                    |

The checkout and agentic examples include a preview mode that runs locally without credentials. The API, onboarding, and SaaS platform examples are step-by-step guides.

All examples use Rootline's staging environment. To request staging access, [contact Rootline](https://rootline.com/contact/sales?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=profile).

For AI coding assistants, the documentation is indexed for language models at [docs.rootline.com/llms.txt](https://docs.rootline.com/llms.txt).

---

[Documentation](https://docs.rootline.com/guides/get-started/introduction?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=profile) · [API reference](https://docs.rootline.com/api/?api=payment&utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=profile) · [Request a demo](https://rootline.com/contact/sales?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=profile)
