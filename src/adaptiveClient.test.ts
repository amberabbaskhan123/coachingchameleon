import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAdaptiveClientDirective,
  createCoachSignalState,
  detectCoachSignals,
  updateCoachSignalState,
} from "./adaptiveClient";

test("detectCoachSignals identifies leading and advice language", () => {
  const signals = detectCoachSignals("Don't you think you should just take time off?");
  assert.equal(signals.leadingQuestions, 1);
  assert.equal(signals.adviceMoments, 1);
  assert.equal(signals.openQuestions, 0);
});

test("updateCoachSignalState rewards open and empathic inquiry", () => {
  let state = createCoachSignalState();
  state = updateCoachSignalState(state, "What feels most important right now?");
  state = updateCoachSignalState(state, "It sounds like this has been really heavy for you.");

  assert.equal(state.turns, 2);
  assert.equal(state.openQuestions, 1);
  assert.equal(state.empathyMoments, 1);
  assert.equal(state.qualityBand, "supportive");
  assert.ok(state.qualityScore > 68);
});

test("updateCoachSignalState marks directive patterns as guarded", () => {
  let state = createCoachSignalState();
  state = updateCoachSignalState(state, "Have you tried journaling every day?");
  state = updateCoachSignalState(state, "You should make a plan and stick to it.");
  state = updateCoachSignalState(state, "Why don't you just ask your manager now?");

  assert.equal(state.leadingQuestions >= 2, true);
  assert.equal(state.adviceMoments >= 2, true);
  assert.equal(state.qualityBand, "directive");
  assert.ok(state.qualityScore < 42);
});

test("buildAdaptiveClientDirective returns mode-specific instructions", () => {
  const directive = buildAdaptiveClientDirective({
    turns: 4,
    openQuestions: 0,
    leadingQuestions: 3,
    adviceMoments: 2,
    empathyMoments: 0,
    qualityScore: 28,
    qualityBand: "directive",
  });

  assert.ok(directive.includes("cautious and guarded"));
  assert.ok(directive.includes("ADAPTIVE_COACH_SIGNAL"));
});
