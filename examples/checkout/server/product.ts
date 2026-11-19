import type { Product } from "../src/types";

// Fixed demo order. The browser cannot change it.
export const PRODUCT: Product = {
  name: "Cappuccino & croissant",
  description: "One cappuccino and one croissant, freshly paired.",
  amount: { currency: "EUR", quantity: "6.25" },
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
};
