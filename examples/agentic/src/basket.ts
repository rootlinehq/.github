import { MAX_QUANTITY, MENU } from "./menu.ts";
import type { MenuItem } from "./menu.ts";

export interface BasketLine {
  item: MenuItem;
  quantity: number;
}

export interface Basket {
  lines: BasketLine[];
  total: number;
  // Who sent the customer, for example an assistant's name. Used in the
  // payment reference so agent sales can be told apart.
  ref: string;
}

export type BasketResult =
  { ok: true; basket: Basket } | { ok: false; error: string };

const available = MENU.map((item) => item.id).join(", ");

// Builds a basket from a pre-fill link such as
// /checkout?item=cappuccino:2&item=croissant:1&ref=concierge-bot
//
// Agents, link previews, and anyone with the URL can write these parameters,
// so they are untrusted: only known items and sensible quantities pass, and
// prices always come from the menu.
export function parseBasket(params: URLSearchParams): BasketResult {
  const quantities = new Map<string, number>();
  for (const value of params.getAll("item")) {
    const match = /^([a-z-]{1,32}):(\d{1,2})$/.exec(value);
    if (!match)
      return {
        ok: false,
        error: `"${value}" is not in the form <item>:<quantity>, for example cappuccino:2.`,
      };
    const [, id, count] = match;
    if (!MENU.some((item) => item.id === id))
      return {
        ok: false,
        error: `Unknown item "${id}". Available items: ${available}.`,
      };
    quantities.set(id, (quantities.get(id) ?? 0) + Number(count));
  }
  if (quantities.size === 0)
    return {
      ok: false,
      error:
        "The basket is empty. Add items with item=<item>:<quantity>, for example item=cappuccino:2.",
    };

  const lines: BasketLine[] = [];
  for (const item of MENU) {
    const quantity = quantities.get(item.id);
    if (quantity === undefined) continue;
    if (quantity < 1 || quantity > MAX_QUANTITY)
      return {
        ok: false,
        error: `The quantity for ${item.id} must be between 1 and ${MAX_QUANTITY}.`,
      };
    lines.push({ item, quantity });
  }

  const ref = params.get("ref") ?? "";
  return {
    ok: true,
    basket: {
      lines,
      total: lines.reduce(
        (sum, line) => sum + line.item.price * line.quantity,
        0,
      ),
      ref: /^[a-z0-9-]{1,32}$/.test(ref) ? ref : "direct",
    },
  };
}
