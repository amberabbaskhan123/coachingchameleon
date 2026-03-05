import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTheme, toggleTheme } from "./theme";

test("normalizeTheme returns dark for invalid values", () => {
  assert.equal(normalizeTheme(undefined), "dark");
  assert.equal(normalizeTheme(""), "dark");
  assert.equal(normalizeTheme("blue"), "dark");
});

test("normalizeTheme accepts dark and light", () => {
  assert.equal(normalizeTheme("dark"), "dark");
  assert.equal(normalizeTheme("light"), "light");
});

test("toggleTheme flips dark/light", () => {
  assert.equal(toggleTheme("dark"), "light");
  assert.equal(toggleTheme("light"), "dark");
});
