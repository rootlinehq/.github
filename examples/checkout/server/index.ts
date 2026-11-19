import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import { createApi } from "./api";

const origin = process.env.APP_ORIGIN || "http://localhost:5173";
const url = new URL(origin);
if (
  url.protocol !== "http:" ||
  url.hostname !== "localhost" ||
  url.pathname !== "/" ||
  url.search ||
  url.hash ||
  url.username ||
  url.password
) {
  throw new Error(
    "APP_ORIGIN must be an HTTP localhost origin, for example http://localhost:5173.",
  );
}
const mode = process.argv.includes("--preview") ? "preview" : "staging";
const api = createApi({
  mode,
  origin: url.origin,
  apiKey: process.env.ROOTLINE_API_KEY?.trim() ?? "",
  accountId: process.env.ROOTLINE_ACCOUNT_ID?.trim() ?? "",
  webhookSecret: process.env.ROOTLINE_WEBHOOK_SECRET?.trim() ?? "",
});
const server = createServer((request, response) => {
  // Webhooks arrive through a tunnel with its own host name; their HMAC
  // signature authenticates them instead.
  const webhook = request.method === "POST" && request.url === "/api/webhooks";
  if (!webhook && request.headers.host !== url.host) {
    response.writeHead(403).end("Use the configured localhost address.");
    return;
  }
  if (request.url?.startsWith("/api/")) void api(request, response);
  else vite.middlewares(request, response, () => response.writeHead(404).end());
});
const vite = await createViteServer({
  server: { middlewareMode: true, hmr: { server } },
  appType: "spa",
});
// Binding to localhost keeps this credential-bearing teaching app off the LAN.
server.listen(Number(url.port || 80), "localhost", () => {
  console.info(`Rootline checkout: ${url.origin} (${mode})`);
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void vite.close().then(() => server.close(() => process.exit(0)));
  });
}
