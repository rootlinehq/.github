// The small public surface used here; no private SDK package is required.
// Canonical contract: https://docs.rootline.com/guides/payments/components/standard-flow
export interface SdkError {
  code: "validation_error" | "sdk_error" | "network_error" | "payment_failed";
  message: string;
  reason?: string;
}
export interface SdkResult {
  error?: SdkError;
  cancelled?: boolean;
  redirect?: string;
}
export interface PaymentMethods {
  mount(selector: string): void;
  unmount(): void;
  on(event: "ready", handler: () => void): void;
  off(event: "ready", handler: () => void): void;
}
export interface CheckoutComponents {
  create(
    name: "payment-methods-list",
    options: { only: string[] },
  ): PaymentMethods;
  submit(): Promise<SdkResult>;
}
export interface RootlineSdk {
  components(
    kind: "checkout",
    options: { paymentSessionSecret: string },
  ): CheckoutComponents;
  confirmPayment(options: {
    components: CheckoutComponents;
  }): Promise<SdkResult>;
}
export interface RootlineConstructor {
  new (options?: { locale: "en" }): RootlineSdk;
}
declare global {
  interface Window {
    Rootline?: RootlineConstructor;
  }
}

let loading: Promise<RootlineConstructor> | undefined;
export function loadRootline(): Promise<RootlineConstructor> {
  if (window.Rootline) return Promise.resolve(window.Rootline);
  if (loading) return loading;
  loading = new Promise<RootlineConstructor>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.rootline.com/js/rootline.js";
    script.async = true;
    script.referrerPolicy = "no-referrer";
    const fail = () => {
      clearTimeout(timeout);
      script.remove();
      reject(
        new Error(
          "Checkout Components could not load. Check your connection and retry.",
        ),
      );
    };
    const timeout = window.setTimeout(fail, 15_000);
    script.onerror = fail;
    script.onload = () => {
      if (!window.Rootline) {
        fail();
        return;
      }
      clearTimeout(timeout);
      resolve(window.Rootline);
    };
    document.head.append(script);
  });
  void loading.catch(() => {
    loading = undefined;
  });
  return loading;
}

export async function submitPayment(
  sdk: RootlineSdk,
  components: CheckoutComponents,
): Promise<SdkResult> {
  const submitted = await components.submit();
  if (submitted.error || submitted.cancelled) return submitted;
  return sdk.confirmPayment({ components });
}
