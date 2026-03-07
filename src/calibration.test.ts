import test from "node:test";
import assert from "node:assert/strict";
import { applyCalibration } from "./calibration";
import type { EvaluationReport } from "./sessionData";

test("applyCalibration enriches metrics with confidence and evidence", () => {
  const report: EvaluationReport = {
    summary: "Summary",
    recommendations: [],
    redFlags: [],
    averageScore: 6.5,
    metrics: [
      {
        category: "Goal Alignment & Collaboration",
        metric: "Clarity of Purpose",
        score: 6,
        comments: "Needs clearer contracting.",
      },
    ],
  };

  const transcript = [
    "Coach: What would a successful session outcome look like for you?",
    "Client: I want clarity on my next step.",
    "Coach: Let's keep that goal in focus as we continue.",
  ].join("\n");

  const calibrated = applyCalibration(report, transcript);
  assert.ok(calibrated.calibration);
  assert.equal(calibrated.metrics.length, 1);
  assert.ok((calibrated.metrics[0].confidence ?? 0) > 0.6);
  assert.ok((calibrated.metrics[0].evidence ?? []).length > 0);
  assert.ok(typeof calibrated.metrics[0].calibrationNote === "string");
});

test("applyCalibration returns benchmark summary notes", () => {
  const report: EvaluationReport = {
    summary: "Summary",
    recommendations: [],
    redFlags: [],
    averageScore: 5,
    metrics: [
      {
        category: "Facilitating Discovery",
        metric: "Encouraging New Perspectives",
        score: 4,
        comments: "Mostly advice.",
      },
      {
        category: "Bridging Insight to Action",
        metric: "Translating Awareness",
        score: 5,
        comments: "Action step was vague.",
      },
    ],
  };

  const calibrated = applyCalibration(report, "Coach: You should take a break.");
  assert.ok((calibrated.calibration?.alignmentScore ?? 0) > 0);
  assert.equal((calibrated.calibration?.notes.length ?? 0) > 0, true);
});
