import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DemoMode } from "../src/types";
import { CheckoutStore } from "./checkout";
import { DemoError, stagingGateway, type PaymentGateway } from "./rootline";

import { PRODUCT } from "./product";
import { parsePaymentEvent, verifySignature } from "./webhooks";

export interface ServerConfig {
  mode: DemoMode;
  origin: string;
  apiKey: string;
  accountId: string;
  webhookSecret?: string;
}

async function jsonBody(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > 1024)
      throw new DemoError("invalid_request", "Request is too large.", 413);
  }
  if (!body) return {};
  try {
    const value: unknown = JSON.parse(body);
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new DemoError("invalid_request", "Expected a JSON object.", 400);
  }
}

async function rawBody(request: IncomingMessage, limit: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit)
      throw new DemoError("invalid_request", "Request is too large.", 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function createApi(config: ServerConfig, gateway?: PaymentGateway) {
  const configured =
    config.mode === "preview" || Boolean(config.apiKey && config.accountId);
  const store = new CheckoutStore(
    config.mode,
    gateway ??
      (config.mode === "staging" && configured
        ? stagingGateway(config.apiKey, config.accountId, config.origin)
        : undefined),
  );
  return async (request: IncomingMessage, response: ServerResponse) => {
    const send = (status: number, value: unknown) => {
      response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(JSON.stringify(value));
    };
    try {
      const path = new URL(request.url ?? "/", config.origin).pathname;
      // Rootline calls this endpoint directly, so it is authenticated by its
      // signature instead of the browser cookie and origin checks below.
      if (request.method === "POST" && path === "/api/webhooks") {
        if (config.mode !== "staging" || !config.webhookSecret)
          throw new DemoError(
            "webhooks_disabled",
            "Set ROOTLINE_WEBHOOK_SECRET to receive webhooks.",
            404,
          );
        const body = await rawBody(request, 64 * 1024);
        const signature = request.headers["rootline-signature"];
        if (
          !verifySignature(
            body,
            Array.isArray(signature) ? signature[0] : signature,
            config.webhookSecret,
          )
        )
          throw new DemoError("invalid_signature", "Invalid signature.", 401);
        let event;
        try {
          event = parsePaymentEvent(body);
        } catch {
          throw new DemoError("invalid_request", "Expected JSON.", 400);
        }
        // Production code would persist the event here, acknowledge it, and
        // fulfil the order in a background job.
        if (event && (await store.applyWebhook(event)))
          console.info(
            `Webhook ${event.eventType}: order ${event.reference} is ${event.status}.`,
          );
        response.writeHead(200, { "Content-Type": "text/plain" });
        response.end("accepted");
        return;
      }
      const cookie = /(?:^|;\s*)rootline_demo=([a-f0-9-]{36})(?:;|$)/.exec(
        request.headers.cookie ?? "",
      );
      const session = cookie?.[1] ?? randomUUID();
      if (request.method === "GET" && path === "/api/config") {
        if (!cookie)
          response.setHeader(
            "Set-Cookie",
            `rootline_demo=${session}; HttpOnly; SameSite=Lax; Path=/`,
          );
        send(200, { mode: config.mode, configured, product: PRODUCT });
        return;
      }
      if (!["GET", "POST"].includes(request.method ?? ""))
        throw new DemoError("method_not_allowed", "Method not allowed.", 405);
      if (
        request.method === "POST" &&
        request.headers.origin !== config.origin
      ) {
        throw new DemoError(
          "origin_rejected",
          "Open the demo at its configured localhost address.",
          403,
        );
      }
      if (!cookie && request.method === "GET")
        throw new DemoError(
          "order_missing",
          "No demo order found in this browser.",
          404,
        );
      if (!cookie) {
        response.setHeader(
          "Set-Cookie",
          `rootline_demo=${session}; HttpOnly; SameSite=Lax; Path=/`,
        );
      }
      if (request.method === "GET" && path === "/api/checkout") {
        send(200, await store.status(session));
        return;
      }
      const body = request.method === "POST" ? await jsonBody(request) : {};
      const simulation = path === "/api/preview/complete";
      if (Object.keys(body).some((key) => !simulation || key !== "status")) {
        throw new DemoError(
          "invalid_request",
          "Payment settings are owned by the server.",
          400,
        );
      }
      if (request.method === "POST" && path === "/api/checkout") {
        send(200, await store.checkout(session));
      } else if (
        request.method === "POST" &&
        path === "/api/checkout/restart"
      ) {
        await store.restart(session);
        send(200, { restarted: true });
      } else if (
        request.method === "POST" &&
        simulation &&
        ["open", "succeeded", "failed"].includes(String(body.status))
      ) {
        send(
          200,
          await store.simulate(
            session,
            body.status as "open" | "succeeded" | "failed",
          ),
        );
      } else {
        throw new DemoError("not_found", "Endpoint not found.", 404);
      }
    } catch (error) {
      const safe =
        error instanceof DemoError
          ? error
          : new DemoError(
              "unexpected_error",
              "The demo could not complete this request.",
              500,
            );
      send(safe.status, { code: safe.code, message: safe.message });
    }
  };
}
