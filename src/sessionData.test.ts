import test from "node:test";
import assert from "node:assert/strict";
import {
  audioExtensionFromMimeType,
  buildScorecardExport,
  buildTranscriptExport,
  buildProgressSummary,
  normalizeEvaluationPayload,
  type SessionRecord,
} from "./sessionData";

test("normalizeEvaluationPayload supports structured object payloads", () => {
  const result = normalizeEvaluationPayload({
    summary: "Strong presence, weaker contracting.",
    recommendations: ["Use explicit agreements at session start."],
    redFlags: ["No therapy language."],
    metrics: [
      { category: "Presence", metric: "Demonstrates Curiosity", score: 8, comments: "Good depth." },
      { category: "Agreements", metric: "Session Outcome Clarity", score: 6, comments: "Needs stronger recontracting." },
    ],
  });

  assert.equal(result.metrics.length, 2);
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.redFlags.length, 1);
  assert.equal(result.averageScore, 7);
});

test("normalizeEvaluationPayload supports legacy array payloads with red flags", () => {
  const result = normalizeEvaluationPayload([
    { category: "Presence", metric: "Curiosity", score: 9, comments: "Great." },
    { category: "RED_FLAGS", metric: "Session Red Flags Summary", score: 0, comments: "Advice-giving detected." },
  ]);

  assert.equal(result.metrics.length, 1);
  assert.equal(result.redFlags.length, 1);
  assert.ok(result.recommendations.length > 0);
});

test("buildProgressSummary aggregates score and red-flag trends", () => {
  const sessions: SessionRecord[] = [
    {
      id: "s1",
      startedAt: "2026-03-01T09:00:00.000Z",
      endedAt: "2026-03-01T09:20:00.000Z",
      plannedSeconds: 1200,
      elapsedSeconds: 1200,
      endedReason: "timer_elapsed",
      scenario: "Scenario A",
      transcript: "Coach: ...",
      evaluation: {
        summary: "Session A",
        recommendations: ["Ask fewer leading questions."],
        redFlags: ["Leading language used once."],
        averageScore: 6.5,
        metrics: [],
      },
    },
    {
      id: "s2",
      startedAt: "2026-03-02T09:00:00.000Z",
      endedAt: "2026-03-02T09:20:00.000Z",
      plannedSeconds: 1200,
      elapsedSeconds: 1180,
      endedReason: "manual_stop",
      scenario: "Scenario B",
      transcript: "Coach: ...",
      evaluation: {
        summary: "Session B",
        recommendations: ["Maintain emotional reflection."],
        redFlags: [],
        averageScore: 8.2,
        metrics: [],
      },
    },
  ];

  const summary = buildProgressSummary(sessions);
  assert.equal(summary.totalSessions, 2);
  assert.equal(summary.latestAverageScore, 8.2);
  assert.equal(summary.overallAverageScore, 7.35);
  assert.equal(summary.totalRedFlags, 1);
});

test("buildTranscriptExport includes key session metadata and transcript", () => {
  const session: SessionRecord = {
    id: "s3",
    startedAt: "2026-03-03T09:00:00.000Z",
    endedAt: "2026-03-03T09:10:00.000Z",
    plannedSeconds: 600,
    elapsedSeconds: 590,
    endedReason: "manual_stop",
    scenario: "Career transition",
    transcript: "Coach: What matters most?\nClient: Clarity.",
    evaluation: {
      summary: "Solid session.",
      recommendations: ["Pause before advising."],
      redFlags: ["One leading question."],
      averageScore: 7.4,
      metrics: [],
    },
  };

  const text = buildTranscriptExport(session);
  assert.ok(text.includes("Session ID: s3"));
  assert.ok(text.includes("Scenario: Career transition"));
  assert.ok(text.includes("Coach: What matters most?"));
});

test("buildScorecardExport returns structured scorecard payload", () => {
  const session: SessionRecord = {
    id: "s4",
    startedAt: "2026-03-03T10:00:00.000Z",
    endedAt: "2026-03-03T10:15:00.000Z",
    plannedSeconds: 900,
    elapsedSeconds: 890,
    endedReason: "timer_elapsed",
    scenario: "Leadership conflict",
    transcript: "Coach: ...",
    evaluation: {
      summary: "Needs stronger agreements.",
      recommendations: ["Define outcomes in first 2 minutes."],
      redFlags: ["Directive suggestion detected."],
      averageScore: 6.8,
      metrics: [
        { category: "Agreements", metric: "Outcome clarity", score: 6, comments: "Partial." },
      ],
    },
  };

  const scorecard = buildScorecardExport(session);
  assert.equal(scorecard.sessionId, "s4");
  assert.equal(scorecard.evaluation.averageScore, 6.8);
  assert.equal(scorecard.evaluation.redFlags.length, 1);
});

test("audioExtensionFromMimeType maps common audio formats", () => {
  assert.equal(audioExtensionFromMimeType("audio/webm;codecs=opus"), "webm");
  assert.equal(audioExtensionFromMimeType("audio/mp4"), "m4a");
  assert.equal(audioExtensionFromMimeType("audio/ogg"), "ogg");
  assert.equal(audioExtensionFromMimeType("audio/unknown"), "audio");
});
