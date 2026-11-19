import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { API_URL, previewGateway, stagingGateway } from "../src/rootline.ts";
import type { CreatePayment, Gateway } from "../src/rootline.ts";
import { createApp } from "../src/server.ts";

// Starts the app on a free port with the given gateway.
async function start(make: (origin: string) => Gateway, mode = "preview") {
  let app: ReturnType<typeof createApp>;
  const server = createServer((request, response) => app(request, response));
  await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
  const origin = `http://localhost:${(server.address() as AddressInfo).port}`;
  const gateway = make(origin);
  app = createApp({ mode: mode as "preview" | "staging", origin }, gateway);
  return { server, origin, gateway };
}

// A gateway that records what the server asks Rootline to create.
function recordingGateway() {
  const created: CreatePayment[] = [];
  const gateway: Gateway = {
    async create(payment) {
      created.push(payment);
      return {
        id: "pmt_test",
        reference: payment.reference,
        checkout_status: "open",
        checkoutUrl:
          "https://checkout.staging.rootline.com/payments/pmt_test/checkout",
      };
    },
    async get() {
      return {
        id: "pmt_test",
        reference: created.at(-1)!.reference,
        checkout_status: "succeeded",
        checkoutUrl: "",
      };
    },
  };
  return { gateway, created };
}

const recorder = recordingGateway();
let app: Awaited<ReturnType<typeof start>>;
before(async () => {
  app = await start(() => recorder.gateway, "staging");
});
after(() => app.server.close());

const post = (path: string, body: string, origin = app.origin) =>
  fetch(`${app.origin}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      origin,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

test("the menu publishes prices as structured data and documents order links", async () => {
  const response = await fetch(`${app.origin}/`);
  const html = await response.text();
  assert.equal(response.status, 200);
  const data = JSON.parse(
    /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)![1],
  );
  assert.deepEqual(
    data.itemListElement.map(
      (entry: { item: { sku: string; offers: { price: string } } }) => [
        entry.item.sku,
        entry.item.offers.price,
      ],
    ),
    [
      ["cappuccino", "3.50"],
      ["croissant", "2.75"],
    ],
  );
  assert.match(html, /id="order-links"/);
});

test("opening a pre-fill link shows the basket without creating a payment", async () => {
  const before = recorder.created.length;
  const response = await fetch(
    `${app.origin}/checkout?item=cappuccino:2&item=croissant:1&ref=concierge-bot`,
  );
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /2 × Cappuccino/);
  assert.match(html, /Pay €9\.75/);
  assert.match(html, /id="order-links"/);
  assert.equal(recorder.created.length, before);
});

test("an invalid link explains what is wrong", async () => {
  const response = await fetch(`${app.origin}/checkout?item=latte:1`);
  assert.equal(response.status, 400);
  assert.match(await response.text(), /Unknown item &quot;latte&quot;/);
});

test("confirming creates the payment from menu prices and redirects to checkout", async () => {
  const response = await post(
    "/checkout",
    "item=cappuccino:2&item=croissant:1&ref=concierge-bot&amount=0.01",
  );
  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    "https://checkout.staging.rootline.com/payments/pmt_test/checkout",
  );
  const payment = recorder.created.at(-1)!;
  assert.equal(payment.amount, "9.75");
  assert.match(payment.reference, /^cafe-concierge-bot-[0-9a-f]{8}$/);
  assert.equal(
    payment.returnUrl,
    `${app.origin}/result?order=${payment.reference}`,
  );

  const result = await fetch(payment.returnUrl);
  assert.match(await result.text(), /Payment received/);
});

test("rejects orders submitted from another site", async () => {
  const response = await post(
    "/checkout",
    "item=cappuccino:1",
    "https://attacker.example",
  );
  assert.equal(response.status, 403);
});

test("rejects requests for another host name", async () => {
  // fetch does not allow a custom Host header, so use node:http.
  const status = await new Promise<number | undefined>((resolve, reject) =>
    request(
      `${app.origin}/`,
      { headers: { host: "rootline.example" } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    )
      .on("error", reject)
      .end(),
  );
  assert.equal(status, 403);
});

test("preview mode completes a simulated checkout", async () => {
  const preview = await start(previewGateway);
  try {
    const order = await fetch(`${preview.origin}/checkout`, {
      method: "POST",
      redirect: "manual",
      headers: {
        origin: preview.origin,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "item=croissant:2",
    });
    const checkoutUrl = order.headers.get("location")!;
    assert.match(checkoutUrl, /\/preview\/checkout\?payment=pmt_preview/);
    assert.match(await (await fetch(checkoutUrl)).text(), /€5\.50/);

    const paid = await fetch(`${preview.origin}/preview/checkout`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `payment=${new URL(checkoutUrl).searchParams.get("payment")}&status=succeeded`,
    });
    const result = await fetch(paid.headers.get("location")!);
    assert.match(await result.text(), /Payment received/);
  } finally {
    preview.server.close();
  }
});

test("the staging gateway sends the Payment API request", async () => {
  let sent: { url: string; init: RequestInit } | undefined;
  const gateway = stagingGateway("YOUR_API_KEY", "YOUR_ACCOUNT_ID", (async (
    url: string,
    init: RequestInit,
  ) => {
    sent = { url, init };
    return Response.json({
      id: "pmt_abc",
      reference: "cafe-direct-12345678",
      checkout_status: "open",
      next_action: { checkout_url: "https://checkout.example/pmt_abc" },
    });
  }) as typeof fetch);

  const payment = await gateway.create({
    reference: "cafe-direct-12345678",
    amount: "9.75",
    returnUrl: "http://localhost:3000/result?order=cafe-direct-12345678",
  });
  assert.equal(sent!.url, `${API_URL}/payments`);
  assert.deepEqual(sent!.init.headers, {
    "content-type": "application/json",
    "x-api-key": "YOUR_API_KEY",
    "rootline-version": "2024-04-23",
  });
  assert.deepEqual(JSON.parse(sent!.init.body as string), {
    account_id: "YOUR_ACCOUNT_ID",
    reference: "cafe-direct-12345678",
    amount: { currency: "EUR", quantity: "9.75" },
    return_url: "http://localhost:3000/result?order=cafe-direct-12345678",
  });
  assert.equal(payment.checkoutUrl, "https://checkout.example/pmt_abc");
});

test("preview mode can leave the checkout open and return to it", async () => {
  const preview = await start(previewGateway);
  try {
    const order = await fetch(`${preview.origin}/checkout`, {
      method: "POST",
      redirect: "manual",
      headers: {
        origin: preview.origin,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "item=cappuccino:1",
    });
    const checkoutUrl = order.headers.get("location")!;
    const left = await fetch(`${preview.origin}/preview/checkout`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `payment=${new URL(checkoutUrl).searchParams.get("payment")}&status=open`,
    });
    const result = await (await fetch(left.headers.get("location")!)).text();
    assert.match(result, /Payment not completed/);
    assert.ok(
      result.includes(`href="${checkoutUrl.replaceAll("&", "&amp;")}"`),
    );
  } finally {
    preview.server.close();
  }
});

test("a failed status retrieval says so", async () => {
  let returnUrl = "";
  const failing = await start((origin) => {
    const gateway = previewGateway(origin);
    return {
      create(payment) {
        returnUrl = payment.returnUrl;
        return gateway.create(payment);
      },
      async get() {
        throw new Error("Rootline responded with HTTP 503.");
      },
    };
  });
  const errors = console.error;
  console.error = () => {};
  try {
    await fetch(`${failing.origin}/checkout`, {
      method: "POST",
      redirect: "manual",
      headers: {
        origin: failing.origin,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "item=croissant:1",
    });
    const result = await fetch(returnUrl);
    assert.equal(result.status, 502);
    assert.match(await result.text(), /status could not be retrieved/);
  } finally {
    console.error = errors;
    failing.server.close();
  }
});
