import { expect, it } from "vitest";
import { copy } from "./copy";
import { deriveBuyBox, initialState } from "./buyBoxState";

it("produces exactly the provided fine print in the default state", () => {
  expect(deriveBuyBox(initialState).finePrint).toBe(copy.finePrint);
});

it("defaults to the subscription price shown in the design", () => {
  const derived = deriveBuyBox(initialState);
  expect(derived.subscribed).toBe(true);
  expect(derived.total).toBe("$25.46");
  expect(derived.subscribePrice).toBe("$25.46");
  expect(derived.comparePrice).toBe("$29.95");
});

it("uses the one-time price and drops the fine print for a one-time purchase", () => {
  const derived = deriveBuyBox({ ...initialState, option: "oneTime" });
  expect(derived.subscribed).toBe(false);
  expect(derived.total).toBe("$29.95");
  expect(derived.finePrint).toBeNull();
});

it("multiplies the total and fine print by quantity but keeps card prices per unit", () => {
  const derived = deriveBuyBox({ ...initialState, quantity: 2 });
  expect(derived.total).toBe("$50.92");
  expect(derived.finePrint).toContain("at $50.92 until");
  expect(derived.subscribePrice).toBe("$25.46");
  expect(derived.oneTimePrice).toBe("$29.95");
});

it("puts the chosen frequency in the fine print", () => {
  const derived = deriveBuyBox({ ...initialState, frequency: "90 days" });
  expect(derived.finePrint).toContain("renews every 90 days at");
});

it("flags the quantity limits of 1 and 10", () => {
  expect(deriveBuyBox({ ...initialState, quantity: 1 }).atMinQuantity).toBe(true);
  expect(deriveBuyBox({ ...initialState, quantity: 2 }).atMinQuantity).toBe(false);
  expect(deriveBuyBox({ ...initialState, quantity: 9 }).atMaxQuantity).toBe(false);
  expect(deriveBuyBox({ ...initialState, quantity: 10 }).atMaxQuantity).toBe(true);
});
