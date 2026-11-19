import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { parseBasket } from "./basket.ts";
import { euros } from "./menu.ts";
import {
  basketPage,
  errorPage,
  menuPage,
  notFoundPage,
  previewCheckoutPage,
  resultPage,
  wrongHostPage,
} from "./pages.ts";
import type { Mode } from "./pages.ts";
import type { Gateway, PreviewGateway } from "./rootline.ts";

export interface AppConfig {
  mode: Mode;
  origin: string;
}

async function formBody(request: IncomingMessage): Promise<URLSearchParams> {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString();
    if (body.length > 2048) throw new Error("Request is too large.");
  }
  return new URLSearchParams(body);
}

export function createApp(config: AppConfig, gateway: Gateway) {
  // Order reference → Rootline payment ID. A real shop stores this with the
  // order in its database.
  const orders = new Map<string, string>();

  return async (request: IncomingMessage, response: ServerResponse) => {
    const html = (status: number, body: string) => {
      response.writeHead(status, {
        "content-type": "text/html; charset=utf-8",
        "x-content-type-options": "nosniff",
      });
      response.end(body);
    };
    const redirect = (location: string) => {
      response.writeHead(303, { location }).end();
    };
    const url = new URL(request.url ?? "/", config.origin);
    const { mode } = config;
    // What the customer sees if a request to Rootline fails.
    let failure = "The payment could not be created. Please try again.";

    try {
      if (request.headers.host !== url.host)
        return html(403, wrongHostPage(mode, config.origin));

      if (request.method === "GET" && url.pathname === "/")
        return html(200, menuPage(mode, config.origin));

      // Opening a pre-fill link only shows the basket. Link previews,
      // crawlers, and agents fetch links too, so a GET never creates a payment.
      if (request.method === "GET" && url.pathname === "/checkout") {
        const result = parseBasket(url.searchParams);
        return result.ok
          ? html(200, basketPage(mode, result.basket))
          : html(400, errorPage(mode, result.error));
      }

      // The customer confirms the basket: validate it again, create the
      // payment from menu prices, and send the customer to hosted checkout.
      if (request.method === "POST" && url.pathname === "/checkout") {
        if (request.headers.origin !== config.origin)
          return html(403, errorPage(mode, "Submit the order from this shop."));
        const result = parseBasket(await formBody(request));
        if (!result.ok) return html(400, errorPage(mode, result.error));
        const { basket } = result;
        const reference = `cafe-${basket.ref}-${randomUUID().slice(0, 8)}`;
        const payment = await gateway.create({
          reference,
          amount: euros(basket.total),
          returnUrl: `${config.origin}/result?order=${reference}`,
        });
        orders.set(reference, payment.id);
        return redirect(payment.checkoutUrl);
      }

      // The redirect back is not proof of payment: retrieve the status.
      if (request.method === "GET" && url.pathname === "/result") {
        const reference = url.searchParams.get("order") ?? "";
        const paymentId = orders.get(reference);
        if (!paymentId) return html(404, notFoundPage(mode));
        failure =
          "The payment status could not be retrieved. Please try again.";
        const payment = await gateway.get(paymentId);
        return html(
          200,
          resultPage(
            mode,
            reference,
            payment.checkout_status,
            payment.checkoutUrl,
          ),
        );
      }

      if (mode === "preview" && url.pathname === "/preview/checkout") {
        const preview = gateway as PreviewGateway;
        if (request.method === "GET") {
          const payment = preview.find(url.searchParams.get("payment") ?? "");
          if (!payment) return html(404, notFoundPage(mode));
          return html(200, previewCheckoutPage(payment.id, payment.amount));
        }
        if (request.method === "POST") {
          const form = await formBody(request);
          const status = form.get("status");
          const returnUrl =
            status === "open" || status === "succeeded" || status === "failed"
              ? preview.complete(form.get("payment") ?? "", status)
              : undefined;
          return returnUrl
            ? redirect(returnUrl)
            : html(404, notFoundPage(mode));
        }
      }

      return html(404, notFoundPage(mode));
    } catch (error) {
      console.error(error);
      return html(502, errorPage(mode, failure));
    }
  };
}
