import assert from "node:assert/strict";
import { test } from "node:test";
import { lunarClockState } from "../lunar-clock.js";

test("clock hands show real local hours, minutes and smooth seconds from the moon centre", () => {
  const state = lunarClockState(new Date(2026, 9, 28, 3, 15, 30, 500));
  assert.equal(state.seconds, 183);
  assert.equal(state.minutes, 93.05);
  assert.ok(Math.abs(state.hours - 97.7541666667) < 1e-8);
  const next = lunarClockState(new Date(2026, 9, 28, 3, 15, 30, 750));
  assert.equal(next.seconds - state.seconds, 1.5);
});

test("clock rolls over correctly and reduced motion keeps the original moon still", () => {
  const midnight = lunarClockState(new Date(2026, 9, 29, 0, 0, 0, 0), true);
  assert.equal(midnight.hours, 0);
  assert.equal(midnight.minutes, 0);
  assert.equal(midnight.seconds, 0);
  assert.equal(midnight.moonRotation, 0);
  assert.equal(midnight.brightness, 1.05);
});
