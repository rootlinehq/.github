import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApi } from "../server/api";
import { createHmac } from "node:crypto";
import { CheckoutStore } from "../server/checkout";
import { parsePaymentEvent, verifySignature } from "../server/webhooks";
import {
  API_URL,
  API_VERSION,
  DemoError,
  stagingGateway,
  type PaymentGateway,
  type RootlinePayment,
} from "../server/rootline";

function payment(
  reference: string,
  status: RootlinePayment["checkout_status"] = "open",
): RootlinePayment {
  return {
    id: "pmt_test123",
    reference,
    checkout_status: status,
    payment_session_secret: "pss_test_only",
  };
}
function mockGateway() {
  let status: RootlinePayment["checkout_status"] = "open";
  const gateway = {
    create: vi.fn(async (reference: string) => payment(reference)),
    get: vi.fn(async (_id: string, reference: string) =>
      payment(reference, status),
    ),
  };
  return {
    gateway,
    setStatus: (value: typeof status) => {
      status = value;
    },
  };
}

describe("staging requests", () => {
  it("uses server-owned price, staging headers, session-secret flag, and a fixed return URL", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(payment("order-1")));
    const gateway = stagingGateway(
      "secret_key",
      "acc_platform",
      "http://localhost:5173",
      request,
    );
    await gateway.create("order-1");
    const [url, init] = request.mock.calls[0];
    expect(url).toBe(`${API_URL}/payments`);
    expect(init?.headers).toEqual({
      "x-api-key": "secret_key",
      "rootline-version": API_VERSION,
      "content-type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      account_id: "acc_platform",
      reference: "order-1",
      amount: { currency: "EUR", quantity: "6.25" },
      create_payment_session_secret: true,
      return_url: "http://localhost:5173/result",
    });
    expect(init?.redirect).toBe("error");
  });
  it("retrieves the known payment using server credentials", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(payment("order-1", "succeeded")));
    await stagingGateway(
      "key",
      "account",
      "http://localhost:5173",
      request,
    ).get("pmt_test123", "order-1");
    expect(request.mock.calls[0][0]).toBe(`${API_URL}/payments/pmt_test123`);
    expect(request.mock.calls[0][1]?.method).toBe("GET");
  });
  it.each([400, 401, 403, 404, 422])(
    "sanitizes definitive rejection %s",
    async (status) => {
      const request = vi.fn<typeof fetch>().mockResolvedValue(
        new Response("private upstream details: sk_secret pss_secret", {
          status,
        }),
      );
      await expect(
        stagingGateway(
          "key",
          "account",
          "http://localhost:5173",
          request,
        ).create("order-1"),
      ).rejects.toMatchObject({
        code: "creation_rejected",
        message: expect.not.stringMatching(
          /private upstream|sk_secret|pss_secret/,
        ),
      });
    },
  );
  it.each([429, 500, 503])(
    "does not retry uncertain HTTP %s creation",
    async (status) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("upstream", { status }));
      await expect(
        stagingGateway(
          "key",
          "account",
          "http://localhost:5173",
          request,
        ).create("order-1"),
      ).rejects.toMatchObject({ code: "creation_uncertain" });
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
  it("treats lost responses as uncertain", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("socket closed sk_secret"));
    await expect(
      stagingGateway("key", "account", "http://localhost:5173", request).create(
        "order-1",
      ),
    ).rejects.toMatchObject({ code: "creation_uncertain" });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...payment("other-order") },
    { ...payment("order-1"), id: "unexpected" },
    { ...payment("order-1"), checkout_status: "unknown" },
    { ...payment("order-1"), payment_session_secret: undefined },
  ])("rejects malformed creation responses", async (value) => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(value));
    await expect(
      stagingGateway("key", "account", "http://localhost:5173", request).create(
        "order-1",
      ),
    ).rejects.toMatchObject({ code: "creation_uncertain" });
  });
  it("rejects a status response for another order/payment", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(payment("another-order")));
    await expect(
      stagingGateway("key", "account", "http://localhost:5173", request).get(
        "pmt_test123",
        "order-1",
      ),
    ).rejects.toMatchObject({ code: "status_unavailable" });
  });
});

describe("order lifecycle", () => {
  it("serializes concurrent creation and reuses one open payment", async () => {
    const { gateway } = mockGateway();
    const store = new CheckoutStore("staging", gateway);
    const [first, second] = await Promise.all([
      store.checkout("browser-1"),
      store.checkout("browser-1"),
    ]);
    expect(first).toEqual(second);
    expect(gateway.create).toHaveBeenCalledTimes(1);
    expect(await store.checkout("browser-1")).toEqual(first);
    expect(gateway.create).toHaveBeenCalledTimes(1);
    expect(await store.status("browser-1")).not.toHaveProperty(
      "paymentSessionSecret",
    );
  });
  it("isolates browser sessions", async () => {
    const { gateway } = mockGateway();
    const store = new CheckoutStore("staging", gateway);
    const first = await store.checkout("browser-1");
    await expect(store.status("browser-2")).rejects.toMatchObject({
      code: "order_missing",
    });
    expect((await store.checkout("browser-2")).orderId).not.toBe(first.orderId);
  });
  it("keeps uncertain creation blocked until the order is restarted", async () => {
    const gateway: PaymentGateway = {
      create: vi
        .fn()
        .mockRejectedValue(new DemoError("creation_uncertain", "unknown")),
      get: vi.fn(),
    };
    const store = new CheckoutStore("staging", gateway);
    const results = await Promise.allSettled([
      store.checkout("browser"),
      store.checkout("browser"),
    ]);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(gateway.create).toHaveBeenCalledTimes(1);
    await expect(store.status("browser")).rejects.toMatchObject({
      code: "creation_uncertain",
    });
    await store.restart("browser");
    await expect(store.status("browser")).rejects.toMatchObject({
      code: "order_missing",
    });
    await expect(store.checkout("browser")).rejects.toMatchObject({
      code: "creation_uncertain",
    });
    expect(gateway.create).toHaveBeenCalledTimes(2);
  });
  it("allows correcting a definitive rejection", async () => {
    const { gateway } = mockGateway();
    gateway.create.mockRejectedValueOnce(
      new DemoError("creation_rejected", "rejected"),
    );
    const store = new CheckoutStore("staging", gateway);
    await expect(store.checkout("browser")).rejects.toMatchObject({
      code: "creation_rejected",
    });
    expect((await store.checkout("browser")).status).toBe("open");
  });
  it.each(["open", "failed", "succeeded"] as const)(
    "starts anew while the payment is %s",
    async (status) => {
      const { gateway, setStatus } = mockGateway();
      const store = new CheckoutStore("staging", gateway);
      const first = await store.checkout("browser");
      setStatus(status);
      expect((await store.status("browser")).status).toBe(status);
      await store.restart("browser");
      expect((await store.checkout("browser")).orderId).not.toBe(first.orderId);
      expect(gateway.create).toHaveBeenCalledTimes(2);
    },
  );
  it("restarts without contacting Rootline", async () => {
    const { gateway } = mockGateway();
    const store = new CheckoutStore("staging", gateway);
    await store.checkout("browser");
    gateway.get.mockRejectedValue(
      new DemoError("status_unavailable", "unknown"),
    );
    await store.restart("browser");
    expect(gateway.get).not.toHaveBeenCalled();
    await expect(store.restart("browser")).rejects.toMatchObject({
      code: "order_missing",
    });
  });
  it("requires staging setup and rejects staging simulation", async () => {
    const store = new CheckoutStore("staging");
    await expect(store.checkout("browser")).rejects.toMatchObject({
      code: "setup_required",
    });
    await expect(store.simulate("browser", "succeeded")).rejects.toMatchObject({
      code: "not_available",
    });
  });
  it("simulates preview without invoking a supplied gateway", async () => {
    const { gateway } = mockGateway();
    const store = new CheckoutStore("preview", gateway);
    await store.checkout("browser");
    expect((await store.simulate("browser", "succeeded")).status).toBe(
      "succeeded",
    );
    expect(gateway.create).not.toHaveBeenCalled();
    expect(gateway.get).not.toHaveBeenCalled();
  });
});

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});
async function localApi(
  mode: "preview" | "staging" = "preview",
  gateway?: PaymentGateway,
) {
  const origin = "http://localhost:5173";
  const handler = createApi(
    {
      mode,
      origin,
      apiKey: "sk_secret",
      accountId: "acc_test",
      webhookSecret: "whsec_test",
    },
    gateway,
  );
  const server = createServer((request, response) => {
    void handler(request, response);
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing address");
  const base = `http://127.0.0.1:${address.port}`;
  const config = await fetch(`${base}/api/config`);
  const cookie = config.headers.get("set-cookie")!.split(";")[0];
  return {
    base,
    cookie,
    config,
    post: (
      path: string,
      body: object = {},
      headers: Record<string, string> = {},
    ) =>
      fetch(`${base}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin,
          cookie,
          ...headers,
        },
        body: JSON.stringify(body),
      }),
  };
}

describe("local HTTP boundary", () => {
  it("sets a protected cookie and exposes public config only", async () => {
    const { config } = await localApi();
    expect(config.headers.get("set-cookie")).toMatch(
      /HttpOnly; SameSite=Lax; Path=\//,
    );
    const body = await config.text();
    const publicConfig = JSON.parse(body);
    expect(publicConfig.product.name).toBe("Cappuccino & croissant");
    expect(publicConfig.product.amount).toEqual({
      currency: "EUR",
      quantity: "6.25",
    });
    expect(publicConfig.product.items).toEqual([
      {
        name: "Cappuccino",
        image: "/cafe/cappuccino.jpg",
        quantity: 1,
        amount: { currency: "EUR", quantity: "3.50" },
      },
      {
        name: "Croissant",
        image: "/cafe/croissant.jpg",
        quantity: 1,
        amount: { currency: "EUR", quantity: "2.75" },
      },
    ]);
    expect(body).not.toMatch(/sk_secret|acc_test/);
    expect(config.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects foreign and missing origins", async () => {
    const { post } = await localApi();
    expect(
      (await post("/api/checkout", {}, { origin: "https://attacker.example" }))
        .status,
    ).toBe(403);
    expect((await post("/api/checkout", {}, { origin: "" })).status).toBe(403);
  });
  it("rejects browser-supplied payment settings", async () => {
    const { post } = await localApi();
    expect(
      (
        await post("/api/checkout", {
          amount: "0.01",
          account_id: "other",
          return_url: "https://other.example",
        })
      ).status,
    ).toBe(400);
  });
  it("does not permit reading arbitrary payment IDs or another session", async () => {
    const { post, base } = await localApi();
    await post("/api/checkout");
    expect(
      (await fetch(`${base}/api/checkout?paymentId=pmt_other`)).status,
    ).toBe(404);
  });
  it("sanitizes unexpected errors", async () => {
    const gateway: PaymentGateway = {
      create: vi.fn().mockRejectedValue(new Error("sk_secret pss_private")),
      get: vi.fn(),
    };
    const { post } = await localApi("staging", gateway);
    const response = await post("/api/checkout");
    expect(response.status).toBe(409);
    expect(await response.text()).not.toMatch(/sk_secret|pss_private/);
  });
  it("limits bodies", async () => {
    const { post } = await localApi();
    expect(
      (await post("/api/checkout", { data: "x".repeat(2048) })).status,
    ).toBe(413);
  });
});

describe("webhooks", () => {
  const event = (reference: string, status = "succeeded") =>
    JSON.stringify({
      object: "event",
      event_type: `payment.${status}`,
      payment: { id: "pmt_test123", reference, checkout_status: status },
    });
  const sign = (body: string, encoding: "hex" | "base64" = "hex") =>
    createHmac("sha256", "whsec_test").update(body).digest(encoding);

  it("verifies hex and base64 HMAC-SHA256 signatures over the raw body", () => {
    const body = Buffer.from(event("order-1"));
    expect(verifySignature(body, sign(String(body)), "whsec_test")).toBe(true);
    expect(
      verifySignature(body, sign(String(body), "base64"), "whsec_test"),
    ).toBe(true);
    expect(verifySignature(body, sign("tampered"), "whsec_test")).toBe(false);
    expect(verifySignature(body, undefined, "whsec_test")).toBe(false);
    expect(verifySignature(body, sign(String(body)), "")).toBe(false);
  });
  it("parses payment events and ignores other events", () => {
    expect(parsePaymentEvent(Buffer.from(event("order-1")))).toEqual({
      eventType: "payment.succeeded",
      paymentId: "pmt_test123",
      reference: "order-1",
      status: "succeeded",
    });
    expect(
      parsePaymentEvent(Buffer.from('{"event_type":"payout.created"}')),
    ).toBeUndefined();
  });
  it("updates only the order matching both payment ID and reference", async () => {
    const { gateway } = mockGateway();
    const store = new CheckoutStore("staging", gateway);
    const { orderId } = await store.checkout("session-1");
    const update = (reference: string) => ({
      eventType: "payment.failed",
      paymentId: "pmt_test123",
      reference,
      status: "failed" as const,
    });
    expect(await store.applyWebhook(update("other-order"))).toBe(false);
    expect(await store.applyWebhook(update(orderId))).toBe(true);
    expect(await store.applyWebhook(update(orderId))).toBe(true);
  });
  it("accepts signed events without browser cookies or origin", async () => {
    const { base } = await localApi("staging", mockGateway().gateway);
    const body = event("unknown-order");
    const response = await fetch(`${base}/api/webhooks`, {
      method: "POST",
      headers: { "rootline-signature": sign(body) },
      body,
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("accepted");
  });
  it("rejects unsigned events and is disabled in preview", async () => {
    const { base } = await localApi("staging", mockGateway().gateway);
    const body = event("order-1");
    const unsigned = await fetch(`${base}/api/webhooks`, {
      method: "POST",
      headers: { "rootline-signature": sign("other") },
      body,
    });
    expect(unsigned.status).toBe(401);
    const preview = await localApi();
    const disabled = await fetch(`${preview.base}/api/webhooks`, {
      method: "POST",
      headers: { "rootline-signature": sign(body) },
      body,
    });
    expect(disabled.status).toBe(404);
  });
});
