import test from "node:test";
import assert from "node:assert/strict";
import { customRubric, getRubricForLevel } from "./rubric";

test("getRubricForLevel keeps rubric shape consistent across levels", () => {
  const novice = getRubricForLevel("novice");
  const intermediate = getRubricForLevel("intermediate");
  const advanced = getRubricForLevel("advanced");

  assert.equal(novice.length, customRubric.length);
  assert.deepEqual(
    novice.map((entry) => `${entry.category}|${entry.metric}`),
    customRubric.map((entry) => `${entry.category}|${entry.metric}`),
  );
  assert.deepEqual(
    intermediate.map((entry) => `${entry.category}|${entry.metric}`),
    customRubric.map((entry) => `${entry.category}|${entry.metric}`),
  );
  assert.deepEqual(
    advanced.map((entry) => `${entry.category}|${entry.metric}`),
    customRubric.map((entry) => `${entry.category}|${entry.metric}`),
  );
});

test("intermediate rubric wording aligns with PCC marker language", () => {
  const intermediate = getRubricForLevel("intermediate");
  const text = intermediate.map((entry) => entry.definition).join(" ");

  assert.match(
    text,
    /identify or reconfirm what the client wants to accomplish/i,
  );
  assert.match(
    text,
    /clear,\s*direct,\s*primarily open-ended questions,\s*one at a time/i,
  );
});

test("advanced rubric wording aligns with MCC minimum skills language", () => {
  const advanced = getRubricForLevel("advanced");
  const text = advanced.map((entry) => entry.definition).join(" ");

  assert.match(text, /clarifies several aspects of the topic/i);
  assert.match(text, /translate insights or learning into actions/i);
});
