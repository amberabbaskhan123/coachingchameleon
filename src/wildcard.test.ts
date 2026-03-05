import test from "node:test";
import assert from "node:assert/strict";
import {
  fallbackWildcardScenario,
  hasUsableApiKey,
  parseWildcardScenario,
} from "./wildcard";

test("hasUsableApiKey rejects empty and placeholder keys", () => {
  assert.equal(hasUsableApiKey(undefined), false);
  assert.equal(hasUsableApiKey(""), false);
  assert.equal(hasUsableApiKey("MY_GEMINI_API_KEY"), false);
  assert.equal(hasUsableApiKey("dummy"), false);
});

test("hasUsableApiKey accepts non-placeholder keys", () => {
  assert.equal(hasUsableApiKey("abc123"), true);
});

test("parseWildcardScenario parses fenced JSON responses", () => {
  const scenario = parseWildcardScenario(
    '```json\n{"title":"T","summary":"S","persona":"P"}\n```',
  );
  assert.deepEqual(scenario, { title: "T", summary: "S", persona: "P" });
});

test("fallbackWildcardScenario returns complete scenario data", () => {
  const scenario = fallbackWildcardScenario([
    { title: "Imposter Syndrome", summary: "Fear of being found out", persona: "Anxious but open." },
  ]);

  assert.ok(scenario.title.length > 0);
  assert.ok(scenario.summary.length > 0);
  assert.ok(scenario.persona.length > 0);
});
