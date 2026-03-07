import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLevelInstruction,
  buildUnlockState,
  isLevelUnlocked,
  levelLabel,
} from "./coachProgression";
import type { SessionRecord } from "./sessionData";

const makeSession = (id: string, score: number, redFlags: string[]): SessionRecord => ({
  id,
  startedAt: `2026-03-${id}T09:00:00.000Z`,
  endedAt: `2026-03-${id}T09:10:00.000Z`,
  plannedSeconds: 600,
  elapsedSeconds: 600,
  endedReason: "timer_elapsed",
  scenario: "Scenario",
  transcript: "Coach: Hello\nClient: Hi",
  evaluation: {
    summary: "Summary",
    recommendations: [],
    redFlags,
    averageScore: score,
    metrics: [],
  },
});

test("buildUnlockState starts at novice", () => {
  const unlock = buildUnlockState([]);
  assert.deepEqual(unlock.unlockedLevels, ["novice"]);
  assert.equal(unlock.recommendedLevel, "novice");
});

test("buildUnlockState unlocks intermediate with consistent progress", () => {
  const sessions = [
    makeSession("01", 5.8, []),
    makeSession("02", 6.1, []),
    makeSession("03", 6.4, []),
  ];
  const unlock = buildUnlockState(sessions);
  assert.equal(isLevelUnlocked(unlock, "intermediate"), true);
  assert.equal(unlock.recommendedLevel, "intermediate");
});

test("buildUnlockState unlocks advanced with stronger rubric trend", () => {
  const sessions: SessionRecord[] = [
    makeSession("01", 7.2, []),
    makeSession("02", 7.4, []),
    makeSession("03", 7.6, []),
    makeSession("04", 7.8, []),
    makeSession("05", 7.4, []),
    makeSession("06", 7.9, []),
    makeSession("07", 8.1, []),
    makeSession("08", 7.7, []),
  ];
  const unlock = buildUnlockState(sessions);
  assert.equal(isLevelUnlocked(unlock, "advanced"), true);
  assert.equal(unlock.recommendedLevel, "advanced");
});

test("buildUnlockState unlocks all levels when testing override is enabled", () => {
  const previous = process.env.VITE_UNLOCK_ALL_LEVELS;
  process.env.VITE_UNLOCK_ALL_LEVELS = "true";

  const unlock = buildUnlockState([]);
  assert.deepEqual(unlock.unlockedLevels, ["novice", "intermediate", "advanced"]);
  assert.equal(unlock.recommendedLevel, "advanced");

  if (typeof previous === "undefined") {
    delete process.env.VITE_UNLOCK_ALL_LEVELS;
  } else {
    process.env.VITE_UNLOCK_ALL_LEVELS = previous;
  }
});

test("buildLevelInstruction encodes challenge dimensions", () => {
  const instruction = buildLevelInstruction("advanced", {
    ambiguity: 5,
    resistance: 4,
    emotionalVolatility: 2,
    goalConflict: 5,
  });
  assert.ok(instruction.includes(levelLabel("advanced")));
  assert.ok(instruction.includes("ambiguous and layered"));
  assert.ok(instruction.includes("defensive, guarded"));
});
