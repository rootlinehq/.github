import { createServer } from "node:http";
import { previewGateway, stagingGateway } from "./rootline.ts";
import { createApp } from "./server.ts";

// The address customers and agents use. Set APP_ORIGIN to a tunnel URL to
// let an assistant reach the shop.
const origin = process.env.APP_ORIGIN?.trim() || "http://localhost:3000";
const mode = process.argv.includes("--preview") ? "preview" : "staging";
const apiKey = process.env.ROOTLINE_API_KEY?.trim() ?? "";
const accountId = process.env.ROOTLINE_ACCOUNT_ID?.trim() ?? "";

if (mode === "staging" && !(apiKey && accountId)) {
  console.error(
    "Set ROOTLINE_API_KEY and ROOTLINE_ACCOUNT_ID in .env, or run npm run preview.",
  );
  process.exit(1);
}

// A localhost origin sets the port. Behind a tunnel, the tunnel forwards to
// PORT, 3000 by default.
const url = new URL(origin);
const port =
  url.hostname === "localhost"
    ? Number(url.port || 80)
    : Number(process.env.PORT || 3000);

const gateway =
  mode === "preview"
    ? previewGateway(origin)
    : stagingGateway(apiKey, accountId);

// Binding to localhost keeps this example off the local network.
createServer(createApp({ mode, origin }, gateway))
  .on("error", (error: NodeJS.ErrnoException) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `Port ${port} is in use. Stop the other program, or set APP_ORIGIN to another port, for example http://localhost:${port + 1}.`
        : error.message,
    );
    process.exit(1);
  })
  .listen(port, "localhost", () =>
    console.info(`Rootline Cafe: ${origin} (${mode})`),
  );
