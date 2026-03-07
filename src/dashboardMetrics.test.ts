import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCompetencyMomentum,
  buildCompetencyTrendInsights,
  buildDashboardAnalytics,
  buildLearningSnapshot,
} from "./dashboardMetrics";
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

test("buildCompetencyMomentum tracks recent vs all-time by competency", () => {
  const sessions: SessionRecord[] = [
    {
      id: "s1",
      startedAt: "2026-03-01T09:00:00.000Z",
      endedAt: "2026-03-01T09:10:00.000Z",
      plannedSeconds: 600,
      elapsedSeconds: 600,
      endedReason: "timer_elapsed",
      scenario: "Scenario",
      transcript: "Coach: Q\nClient: A",
      evaluation: {
        summary: "Summary",
        recommendations: [],
        redFlags: [],
        averageScore: 5,
        metrics: [
          {
            category: "Maintains Presence",
            metric: "Curiosity",
            score: 4,
            comments: "Comments",
          },
          {
            category: "Listens Actively",
            metric: "Reflects Emotion",
            score: 5,
            comments: "Comments",
          },
        ],
      },
    },
    {
      id: "s2",
      startedAt: "2026-03-02T09:00:00.000Z",
      endedAt: "2026-03-02T09:10:00.000Z",
      plannedSeconds: 600,
      elapsedSeconds: 600,
      endedReason: "timer_elapsed",
      scenario: "Scenario",
      transcript: "Coach: Q\nClient: A",
      evaluation: {
        summary: "Summary",
        recommendations: [],
        redFlags: [],
        averageScore: 6,
        metrics: [
          {
            category: "Maintains Presence",
            metric: "Curiosity",
            score: 6,
            comments: "Comments",
          },
        ],
      },
    },
    {
      id: "s3",
      startedAt: "2026-03-03T09:00:00.000Z",
      endedAt: "2026-03-03T09:10:00.000Z",
      plannedSeconds: 600,
      elapsedSeconds: 600,
      endedReason: "timer_elapsed",
      scenario: "Scenario",
      transcript: "Coach: Q\nClient: A",
      evaluation: {
        summary: "Summary",
        recommendations: [],
        redFlags: [],
        averageScore: 7,
        metrics: [
          {
            category: "Maintains Presence",
            metric: "Curiosity",
            score: 8,
            comments: "Comments",
          },
          {
            category: "Listens Actively",
            metric: "Reflects Emotion",
            score: 7,
            comments: "Comments",
          },
        ],
      },
    },
    {
      id: "s4",
      startedAt: "2026-03-04T09:00:00.000Z",
      endedAt: "2026-03-04T09:10:00.000Z",
      plannedSeconds: 600,
      elapsedSeconds: 600,
      endedReason: "timer_elapsed",
      scenario: "Scenario",
      transcript: "Coach: Q\nClient: A",
      evaluation: {
        summary: "Summary",
        recommendations: [],
        redFlags: [],
        averageScore: 8,
        metrics: [
          {
            category: "Maintains Presence",
            metric: "Curiosity",
            score: 9,
            comments: "Comments",
          },
          {
            category: "Listens Actively",
            metric: "Reflects Emotion",
            score: 8,
            comments: "Comments",
          },
        ],
      },
    },
  ];

  const momentum = buildCompetencyMomentum(sessions);
  const presence = momentum.find((item) => item.category === "Maintains Presence");
  const listening = momentum.find((item) => item.category === "Listens Actively");

  assert.equal(presence?.allTime, 6.8);
  assert.equal(presence?.recent, 7.7);
  assert.equal(presence?.delta, 0.9);

  assert.equal(listening?.allTime, 6.7);
  assert.equal(listening?.recent, 7.5);
  assert.equal(listening?.delta, 0.8);
});

test("buildCompetencyTrendInsights marks regression risk and slope", () => {
  const sessions: SessionRecord[] = [
    {
      id: "t1",
      startedAt: "2026-03-01T09:00:00.000Z",
      endedAt: "2026-03-01T09:10:00.000Z",
      plannedSeconds: 600,
      elapsedSeconds: 600,
      endedReason: "timer_elapsed",
      scenario: "Scenario",
      transcript: "Coach: Q",
      evaluation: {
        summary: "Summary",
        recommendations: [],
        redFlags: [],
        averageScore: 7,
        metrics: [
          { category: "Maintains Presence", metric: "Curiosity", score: 8, comments: "C" },
        ],
      },
    },
    {
      id: "t2",
      startedAt: "2026-03-02T09:00:00.000Z",
      endedAt: "2026-03-02T09:10:00.000Z",
      plannedSeconds: 600,
      elapsedSeconds: 600,
      endedReason: "timer_elapsed",
      scenario: "Scenario",
      transcript: "Coach: Q",
      evaluation: {
        summary: "Summary",
        recommendations: [],
        redFlags: [],
        averageScore: 7,
        metrics: [
          { category: "Maintains Presence", metric: "Curiosity", score: 7, comments: "C" },
        ],
      },
    },
    {
      id: "t3",
      startedAt: "2026-03-03T09:00:00.000Z",
      endedAt: "2026-03-03T09:10:00.000Z",
      plannedSeconds: 600,
      elapsedSeconds: 600,
      endedReason: "timer_elapsed",
      scenario: "Scenario",
      transcript: "Coach: Q",
      evaluation: {
        summary: "Summary",
        recommendations: [],
        redFlags: [],
        averageScore: 7,
        metrics: [
          { category: "Maintains Presence", metric: "Curiosity", score: 5, comments: "C" },
        ],
      },
    },
  ];

  const insights = buildCompetencyTrendInsights(sessions, 2);
  const presence = insights.find((item) => item.category === "Maintains Presence");
  assert.ok(presence);
  assert.equal(presence?.regressionRisk, true);
  assert.ok((presence?.slope ?? 0) < 0);
});

test("buildLearningSnapshot returns wins and targets", () => {
  const sessions: SessionRecord[] = [
    makeSession("a1", "2026-03-01T09:00:00.000Z", 4.5, [], 4),
    makeSession("a2", "2026-03-02T09:00:00.000Z", 5.1, [], 5),
    makeSession("a3", "2026-03-03T09:00:00.000Z", 6.2, [], 6),
    makeSession("a4", "2026-03-04T09:00:00.000Z", 7.1, [], 7),
  ];

  const snapshot = buildLearningSnapshot(sessions, 2);
  assert.equal(snapshot.wins.length > 0, true);
  assert.equal(snapshot.targets.length, 0);
});
