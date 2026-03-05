import test from "node:test";
import assert from "node:assert/strict";
import { buildDashboardAnalytics } from "./dashboardMetrics";
import type { SessionRecord } from "./sessionData";

const makeSession = (
  id: string,
  endedAt: string,
  averageScore: number,
  redFlags: string[],
  metricScore: number,
): SessionRecord => ({
  id,
  startedAt: endedAt,
  endedAt,
  plannedSeconds: 600,
  elapsedSeconds: 600,
  endedReason: "timer_elapsed",
  scenario: "Scenario",
  transcript: "Coach: Q\nClient: A",
  evaluation: {
    summary: "Summary",
    recommendations: [],
    redFlags,
    averageScore,
    metrics: [
      {
        category: "Presence",
        metric: "Curiosity",
        score: metricScore,
        comments: "Comments",
      },
    ],
  },
});

test("buildDashboardAnalytics sorts sessions and creates score points", () => {
  const analytics = buildDashboardAnalytics([
    makeSession("s2", "2026-03-02T09:00:00.000Z", 8, [], 8),
    makeSession("s1", "2026-03-01T09:00:00.000Z", 6, ["Leading"], 6),
  ]);

  assert.equal(analytics.scorePoints.length, 2);
  assert.equal(analytics.scorePoints[0].sessionId, "s1");
  assert.equal(analytics.scorePoints[1].sessionId, "s2");
});

test("buildDashboardAnalytics computes momentum from recent sessions", () => {
  const analytics = buildDashboardAnalytics([
    makeSession("s1", "2026-03-01T09:00:00.000Z", 4, [], 4),
    makeSession("s2", "2026-03-02T09:00:00.000Z", 5, [], 5),
    makeSession("s3", "2026-03-03T09:00:00.000Z", 7, [], 7),
    makeSession("s4", "2026-03-04T09:00:00.000Z", 8, [], 8),
  ]);

  assert.ok(analytics.momentumDelta > 0);
});

test("buildDashboardAnalytics counts red flag frequency", () => {
  const analytics = buildDashboardAnalytics([
    makeSession("s1", "2026-03-01T09:00:00.000Z", 6, ["Leading", "Therapy"], 6),
    makeSession("s2", "2026-03-02T09:00:00.000Z", 7, ["Leading"], 7),
  ]);

  const leading = analytics.redFlagFrequency.find((item) => item.flag === "Leading");
  assert.equal(leading?.count, 2);
});
