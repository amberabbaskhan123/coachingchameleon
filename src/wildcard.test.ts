import test from "node:test";
import assert from "node:assert/strict";
import {
  fallbackWildcardScenario,
  formatWildcardScenario,
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

test("parseWildcardScenario normalizes second-person persona text", () => {
  const scenario = parseWildcardScenario(
    '{"title":"T","summary":"S","persona":"You are unsure if your decision is right. You keep doubting yourself."}',
  );
  assert.equal(
    scenario.persona,
    "the client is unsure if the client's decision is right. the client keep doubting themself.",
  );
});

test("formatWildcardScenario normalizes persona perspective", () => {
  const rendered = formatWildcardScenario({
    title: "T",
    summary: "S",
    persona: "You're exploring your options, and you've delayed action.",
  });
  assert.match(rendered, /Persona: the client is exploring the client's options, and the client has delayed action\./);
});

test("fallbackWildcardScenario returns complete scenario data", () => {
  const scenario = fallbackWildcardScenario([
    { title: "Imposter Syndrome", summary: "Fear of being found out", persona: "Anxious but open." },
  ]);

  assert.ok(scenario.title.length > 0);
  assert.ok(scenario.summary.length > 0);
  assert.ok(scenario.persona.length > 0);
});
