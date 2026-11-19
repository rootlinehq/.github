import { test, expect, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/fonts.googleapis.com/**", (route) => route.abort());
  await page.route("**/fonts.gstatic.com/**", (route) => route.abort());
});

test("preview is labeled, keyboard accessible, and makes no Rootline requests", async ({
  page,
}) => {
  const rootlineRequests: string[] = [];
  page.on("request", (request) => {
    if (/https:\/\/[^/]*rootline\.(?:com|cafe)\//.test(request.url()))
      rootlineRequests.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByText("Simulated preview — no payment is processed", {
      exact: true,
    }),
  ).toBeVisible();
  const start = page.getByRole("button", { name: "Start checkout" });
  await start.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("radio", { name: "Card" })).toBeChecked();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Your café order" }),
  ).toBeVisible();
  for (const name of ["Cappuccino", "Croissant"]) {
    const photo = page.getByRole("img", { name, exact: true });
    await expect(photo).toBeVisible();
    await expect
      .poll(() =>
        photo.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      )
      .toBe(true);
  }
  await expect(page.getByText("1 × €3.50", { exact: true })).toBeVisible();
  await expect(page.getByText("1 × €2.75", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Simulate €6.25 payment" }).click();
  await expect(
    page.getByRole("heading", { name: "Payment authorized" }),
  ).toBeVisible();
  await expect(
    page.getByText("Simulated preview — no payment is processed", {
      exact: true,
    }),
  ).toBeVisible();
  expect(rootlineRequests).toEqual([]);
});

test("iDEAL preview decline can start a new attempt", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start checkout" }).click();
  await page.getByRole("radio", { name: "iDEAL" }).check();
  await page.getByLabel("Preview outcome").selectOption("failed");
  await page.getByRole("button", { name: "Simulate €6.25 payment" }).click();
  await expect(
    page.getByRole("heading", { name: "Payment declined" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try a new payment" }).click();
  await page.getByRole("button", { name: "Start checkout" }).click();
  await expect(
    page.getByRole("button", { name: "Simulate €6.25 payment" }),
  ).toBeEnabled();
});

test("pending preview survives refresh and can return to checkout", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start checkout" }).click();
  await page.getByLabel("Preview outcome").selectOption("open");
  await page.getByRole("button", { name: "Simulate €6.25 payment" }).click();
  await expect(
    page.getByText("The payment is still open.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Return to checkout" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Check status again" }).click();
  await expect(
    page.getByRole("button", { name: "Return to checkout" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Return to checkout" }).click();
  await page.getByRole("button", { name: "Start checkout" }).click();
  await expect(page.getByRole("radio", { name: "Card" })).toBeVisible();
});

test("missing order after a server restart is a recoverable display state", async ({
  page,
}) => {
  await page.goto("/result");
  await expect(page.getByRole("alert")).toContainText("No demo order");
  await page.getByRole("button", { name: "Back to example" }).click();
  await expect(
    page.getByRole("button", { name: "Start checkout" }),
  ).toBeEnabled();
});

interface Scenario {
  submit?: object;
  confirm?: object;
  initializationError?: boolean;
  cdnFailure?: boolean;
  neverReady?: boolean;
  hold?: boolean;
  configured?: boolean;
}

async function mockStaging(page: Page, scenario: Scenario = {}) {
  const state = {
    creates: 0,
    restarts: 0,
    status: "open",
    orderId: "cafe_test1",
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config") {
      await route.fulfill({
        json: {
          mode: "staging",
          configured: scenario.configured !== false,
          product: {
            name: "Cappuccino & croissant",
            description: "One cappuccino and one croissant, freshly paired.",
            items: [
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
            ],
            amount: { currency: "EUR", quantity: "6.25" },
          },
        },
      });
    } else if (path === "/api/checkout/restart") {
      state.restarts++;
      state.orderId = "cafe_test2";
      state.status = "open";
      await route.fulfill({ json: { restarted: true } });
    } else if (path === "/api/checkout") {
      if (route.request().method() === "POST") state.creates++;
      await route.fulfill({
        json: {
          orderId: state.orderId,
          status: state.status,
          ...(route.request().method() === "POST" && state.status === "open"
            ? { paymentSessionSecret: "pss_browser_test_only" }
            : {}),
        },
      });
    } else
      await route.fulfill({
        status: 404,
        json: { code: "not_found", message: "Test endpoint unavailable" },
      });
  });
  await page.route("https://js.rootline.com/js/rootline.js", async (route) => {
    if (scenario.cdnFailure) {
      await route.abort();
      return;
    }
    await route.fulfill({
      contentType: "application/javascript",
      body: `
      window.__sdkCalls = { submit: 0, confirm: 0, mounts: 0, unmounts: 0 };
      window.Rootline = class {
        constructor() { if (${Boolean(scenario.initializationError)}) throw new Error('Invalid staging configuration'); }
        components(kind, options) {
          if (kind !== 'checkout' || options.paymentSessionSecret !== 'pss_browser_test_only') throw new Error('Unexpected checkout options');
          return {
            create(name, options) {
              if (name !== 'payment-methods-list' || JSON.stringify(options.only) !== '["visa","mastercard","amex","ideal"]') throw new Error('Unexpected payment method options');
              let ready;
              return {
                on(event, handler) { ready = handler; },
                off() { ready = undefined; },
                mount(selector) { window.__sdkCalls.mounts++; document.querySelector(selector).textContent = 'SDK payment methods test double'; if (!${Boolean(scenario.neverReady)}) queueMicrotask(() => ready?.()); },
                unmount() { window.__sdkCalls.unmounts++; document.querySelector('#payment-methods')?.replaceChildren(); }
              };
            },
            async submit() {
              window.__sdkCalls.submit++;
              if (${Boolean(scenario.hold)}) await new Promise(resolve => { window.__releaseSubmit = resolve; });
              return ${JSON.stringify(scenario.submit ?? {})};
            }
          };
        }
        async confirmPayment() { window.__sdkCalls.confirm++; return ${JSON.stringify(scenario.confirm ?? {})}; }
      };
    `,
    });
  });
  return state;
}

test("staging without credentials shows setup, not simulation", async ({
  page,
}) => {
  await mockStaging(page, { configured: false });
  await page.goto("/");
  await expect(
    page.getByText("Add your staging API key", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Simulated preview — no payment is processed", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Start checkout" }),
  ).toHaveCount(0);
});

for (const code of ["validation_error", "network_error", "sdk_error"]) {
  test(`SDK ${code} restores the pay button without confirming`, async ({
    page,
  }) => {
    await mockStaging(page, {
      submit: {
        error: { code, message: "Please try again", reason: "diagnostic_only" },
      },
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Start checkout" }).click();
    const pay = page.getByRole("button", { name: "Pay €6.25", exact: true });
    await pay.click();
    await expect(page.getByRole("alert")).toHaveText("Please try again");
    await expect(pay).toBeEnabled();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __sdkCalls: { confirm: number } }).__sdkCalls
            .confirm,
      ),
    ).toBe(0);
    await expect(page.getByText("diagnostic_only")).toHaveCount(0);
  });
}

test("SDK cancellation is neutral and does not confirm", async ({ page }) => {
  await mockStaging(page, { submit: { cancelled: true } });
  await page.goto("/");
  await page.getByRole("button", { name: "Start checkout" }).click();
  const pay = page.getByRole("button", { name: "Pay €6.25", exact: true });
  await pay.click();
  await expect(pay).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __sdkCalls: { confirm: number } }).__sdkCalls
          .confirm,
    ),
  ).toBe(0);
});

test("SDK final decline requires a new payment", async ({ page }) => {
  const state = await mockStaging(page, {
    confirm: { error: { code: "payment_failed", message: "Payment declined" } },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start checkout" }).click();
  await page.getByRole("button", { name: "Pay €6.25", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Payment declined");
  await expect(
    page.getByRole("button", { name: "Pay €6.25", exact: true }),
  ).toBeDisabled();
  state.status = "failed";
  await page.getByRole("button", { name: "Try a new payment" }).click();
  await page.getByRole("button", { name: "Start checkout" }).click();
  await expect(
    page.getByRole("button", { name: "Pay €6.25", exact: true }),
  ).toBeEnabled();
  expect(state.restarts).toBe(1);
  expect(state.creates).toBe(2);
});

test("SDK initialization and CDN failures show recoverable errors", async ({
  page,
}) => {
  await mockStaging(page, { initializationError: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Start checkout" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Invalid staging configuration",
  );
  await expect(
    page.getByRole("button", { name: "Retry loading checkout" }),
  ).toBeVisible();
});

test("CDN failure does not switch to preview", async ({ page }) => {
  await mockStaging(page, { cdnFailure: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Start checkout" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Checkout Components could not load",
  );
  await expect(
    page.getByRole("button", { name: "Retry loading checkout" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Simulate €6.25 payment" }),
  ).toHaveCount(0);
});

test("payment form that never becomes ready shows a recoverable error", async ({
  page,
}) => {
  await page.clock.install();
  await mockStaging(page, { neverReady: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Start checkout" }).click();
  await expect(page.getByText("Loading secure payment methods…")).toBeVisible();
  await page.clock.fastForward(15_000);
  await expect(page.getByRole("alert")).toContainText("allowed domain");
  await expect(
    page.getByRole("button", { name: "Retry loading checkout" }),
  ).toBeVisible();
});

test("duplicate submission is blocked and inline success retrieves server status", async ({
  page,
}) => {
  const state = await mockStaging(page, { hold: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Start checkout" }).click();
  await page.getByRole("button", { name: "Pay €6.25", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Processing…" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __sdkCalls: { submit: number } }).__sdkCalls
          .submit,
    ),
  ).toBe(1);
  state.status = "succeeded";
  await page.evaluate(() =>
    (window as unknown as { __releaseSubmit(): void }).__releaseSubmit(),
  );
  await expect(
    page.getByRole("heading", { name: "Payment authorized" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Payment authorized" }),
  ).toBeVisible();
});

test("SDK redirect returns to the server-verified result page", async ({
  page,
}) => {
  const state = await mockStaging(page, {
    confirm: { redirect: "http://localhost:5173/result" },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start checkout" }).click();
  state.status = "succeeded";
  await page.getByRole("button", { name: "Pay €6.25", exact: true }).click();
  await expect(page).toHaveURL(/\/result$/);
  await expect(
    page.getByRole("heading", { name: "Payment authorized" }),
  ).toBeVisible();
});
