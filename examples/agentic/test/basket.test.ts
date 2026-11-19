import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBasket } from "../src/basket.ts";

const parse = (query: string) => parseBasket(new URLSearchParams(query));

test("builds a basket from menu prices", () => {
  const result = parse("item=cappuccino:2&item=croissant:1&ref=concierge-bot");
  assert.ok(result.ok);
  assert.deepEqual(
    result.basket.lines.map((line) => [line.item.id, line.quantity]),
    [
      ["cappuccino", 2],
      ["croissant", 1],
    ],
  );
  assert.equal(result.basket.total, 975);
  assert.equal(result.basket.ref, "concierge-bot");
});

test("ignores prices and other unknown parameters in the link", () => {
  const result = parse("item=cappuccino:1&price=0.01&amount=0.01");
  assert.ok(result.ok);
  assert.equal(result.basket.total, 350);
});

test("adds up repeated items", () => {
  const result = parse("item=croissant:1&item=croissant:2");
  assert.ok(result.ok);
  assert.equal(result.basket.lines[0].quantity, 3);
});

test("rejects unknown items and lists the available ones", () => {
  const result = parse("item=latte:1");
  assert.ok(!result.ok);
  assert.match(result.error, /Unknown item "latte".*cappuccino, croissant/);
});

for (const [query, pattern] of [
  ["", /empty/],
  ["item=cappuccino", /<item>:<quantity>/],
  ["item=cappuccino:-1", /<item>:<quantity>/],
  ["item=cappuccino:1.5", /<item>:<quantity>/],
  ["item=cappuccino:0", /between 1 and 10/],
  ["item=cappuccino:6&item=cappuccino:5", /between 1 and 10/],
] as const) {
  test(`rejects "${query}"`, () => {
    const result = parse(query);
    assert.ok(!result.ok);
    assert.match(result.error, pattern);
  });
}

test("replaces an invalid ref with direct", () => {
  for (const ref of ["Concierge Bot", "<script>", "x".repeat(33)]) {
    const result = parse(`item=cappuccino:1&ref=${encodeURIComponent(ref)}`);
    assert.ok(result.ok);
    assert.equal(result.basket.ref, "direct");
  }
});
