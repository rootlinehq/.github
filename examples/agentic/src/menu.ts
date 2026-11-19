// The café's menu. Prices are in cents and are the only prices the server
// charges; a link can choose items and quantities, never prices.
export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
}

export const CURRENCY = "EUR";
export const MAX_QUANTITY = 10;

export const MENU: readonly MenuItem[] = [
  {
    id: "cappuccino",
    name: "Cappuccino",
    description: "Double espresso with steamed milk.",
    price: 350,
  },
  {
    id: "croissant",
    name: "Croissant",
    description: "Butter croissant, baked this morning.",
    price: 275,
  },
];

export function euros(cents: number): string {
  return (cents / 100).toFixed(2);
}
