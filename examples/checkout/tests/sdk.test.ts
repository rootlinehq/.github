import { describe, expect, it, vi } from "vitest";
import {
  submitPayment,
  type CheckoutComponents,
  type RootlineSdk,
  type SdkResult,
} from "../src/sdk";

function harness(submitted: SdkResult = {}, confirmed: SdkResult = {}) {
  const components: CheckoutComponents = {
    create: vi.fn(),
    submit: vi.fn().mockResolvedValue(submitted),
  };
  const sdk: RootlineSdk = {
    components: vi.fn(),
    confirmPayment: vi.fn().mockResolvedValue(confirmed),
  };
  return { sdk, components };
}

describe("SDK submission", () => {
  it("validates first and confirms with the same components", async () => {
    const { sdk, components } = harness();
    expect(await submitPayment(sdk, components)).toEqual({});
    expect(sdk.confirmPayment).toHaveBeenCalledWith({ components });
  });
  it.each([
    "validation_error",
    "network_error",
    "sdk_error",
    "payment_failed",
  ] as const)("returns %s without confirming", async (code) => {
    const result = { error: { code, message: "Customer-safe message" } };
    const { sdk, components } = harness(result);
    expect(await submitPayment(sdk, components)).toEqual(result);
    expect(sdk.confirmPayment).not.toHaveBeenCalled();
  });
  it("treats submission cancellation as a neutral result", async () => {
    const { sdk, components } = harness({ cancelled: true });
    expect(await submitPayment(sdk, components)).toEqual({ cancelled: true });
    expect(sdk.confirmPayment).not.toHaveBeenCalled();
  });
  it.each([
    { cancelled: true },
    { redirect: "https://bank.example/approve" },
    { error: { code: "payment_failed" as const, message: "Declined" } },
  ])("preserves the confirmation result", async (result) => {
    const { sdk, components } = harness({}, result);
    expect(await submitPayment(sdk, components)).toEqual(result);
  });
});
