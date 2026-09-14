import assert from "node:assert/strict";
import test from "node:test";
import { chooseCake, initialOrder, orderPrice, processLabel } from "../components/bakery-order.ts";

test("prices the entire cake with serving sizes and both upgrades", () => {
  assert.equal(orderPrice(initialOrder), 1240);
  assert.equal(orderPrice({ ...initialOrder, servings: 8 }), 2480);
  assert.equal(orderPrice({ ...initialOrder, servings: 6, frosting: "chocolate", topping: "pistachio" }), 2080);
});

test("changing a signature preserves the gathering and chooses its matching finish", () => {
  const original = { ...initialOrder, servings: 8 };
  const chocolate = chooseCake(original, "cacao");
  assert.deepEqual(chocolate, { cake: "cacao", servings: 8, frosting: "chocolate", topping: "chocolate" });
  assert.equal(orderPrice(chocolate), 2440);
  assert.deepEqual(original, { ...initialOrder, servings: 8 });
});

test("each process has a beginning, a finish, and a clear baking progression", () => {
  assert.equal(processLabel(5, 0), "Mixing until silky");
  assert.equal(processLabel(5, .25), "Pouring into the tin");
  assert.equal(processLabel(5, .65), "Rising, slowly turning golden");
  assert.equal(processLabel(5, 1), "Cooling on the rack");
  assert.equal(processLabel(7, 0), "Nestling your cake into its box");
  assert.equal(processLabel(7, 1), "One last handwritten touch");
});
