export type CheckoutStatus = "open" | "succeeded" | "failed";
export type DemoMode = "preview" | "staging";

export interface Product {
  name: string;
  description: string;
  items: {
    name: string;
    image: string;
    quantity: 1;
    amount: { currency: "EUR"; quantity: string };
  }[];
  amount: { currency: "EUR"; quantity: string };
}

export interface PublicConfig {
  mode: DemoMode;
  configured: boolean;
  product: Product;
}

export interface Checkout {
  orderId: string;
  status: CheckoutStatus;
  paymentSessionSecret?: string;
}

export interface ApiError {
  code: string;
  message: string;
}
