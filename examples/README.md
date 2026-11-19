# Rootline examples

[← Rootline overview](../README.md)

Example integrations for the [Rootline](https://rootline.com/?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=examples) payments API: create a payment, embed checkout in your app, onboard a merchant, collect platform fees on your merchants' payments, and let AI assistants send customers to checkout with a filled basket. All five use the same café.

| Example                                             | Description                                                                                             | Format                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------- |
| [**Create your first payment →**](./api/)           | Create a payment with the Payment API and complete it in hosted checkout.                               | Guide (curl and Node.js)     |
| [**Embed checkout in your app →**](./checkout/)     | Embedded payments with Checkout Components: cards with 3D Secure, iDEAL, and webhooks.                  | React + TypeScript app       |
| [**Onboard a merchant →**](./onboarding/)           | Create the merchant's company, send the merchant to hosted onboarding, and receive the account ID.      | Guide (curl)                 |
| [**Collect platform fees in your SaaS →**](./saas/) | Route a payment to a merchant on your platform and collect a platform fee on it.                        | Guide                        |
| [**Make your checkout agent-ready →**](./agentic/)  | Agentic commerce with pre-fill links: an assistant sends the customer to checkout with a filled basket. | Node.js app, no dependencies |

## Run an example

The agentic and checkout examples have a preview mode that runs locally without credentials. Both require Node 24.

Agent-ready checkout, with nothing to install:

```bash
cd agentic
npm run preview
```

Open [http://localhost:3000/checkout?item=cappuccino:2&item=croissant:1&ref=concierge-bot](http://localhost:3000/checkout?item=cappuccino:2&item=croissant:1&ref=concierge-bot) and select **Pay €9.75**.

Embedded checkout with React:

```bash
cd checkout
npm ci
npm run preview
```

Open [http://localhost:5173](http://localhost:5173) and select **Start checkout**.

## Staging access

All examples use Rootline's staging environment, a test environment that processes no real funds. To request staging access, [contact Rootline](https://rootline.com/contact/sales?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=examples).

## Questions

For questions about the examples or the API, [contact Rootline](https://rootline.com/contact/sales?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=examples) or see the [documentation](https://docs.rootline.com/guides/get-started/introduction?utm_source=github&utm_medium=readme&utm_campaign=github&utm_content=examples).
