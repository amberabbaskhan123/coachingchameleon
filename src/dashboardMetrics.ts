import type { SessionRecord } from "./sessionData";

export type ScorePoint = {
  sessionId: string;
  label: string;
  score: number;
  redFlagCount: number;
};

export type RedFlagFrequency = {
  flag: string;
  count: number;
  lastSeen: string;
};

export type MetricTrend = {
  metric: string;
  earlyAverage: number;
  recentAverage: number;
  delta: number;
};

export type DashboardAnalytics = {
  scorePoints: ScorePoint[];
  redFlagFrequency: RedFlagFrequency[];
  metricTrends: MetricTrend[];
  momentumDelta: number;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

const average = (values: number[]): number =>
  values.length === 0 ? 0 : round2(values.reduce((sum, v) => sum + v, 0) / values.length);

export function buildDashboardAnalytics(
  sessions: SessionRecord[],
): DashboardAnalytics {
  const sorted = [...sessions].sort((a, b) => a.endedAt.localeCompare(b.endedAt));

  const scorePoints: ScorePoint[] = sorted.map((session) => ({
    sessionId: session.id,
    label: new Date(session.endedAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    score: session.evaluation.averageScore,
    redFlagCount: session.evaluation.redFlags.length,
  }));

  const redFlagMap = new Map<string, RedFlagFrequency>();
  for (const session of sorted) {
    for (const flag of session.evaluation.redFlags) {
      const key = flag.trim();
      if (!key) continue;
      const existing = redFlagMap.get(key);
      if (!existing) {
        redFlagMap.set(key, { flag: key, count: 1, lastSeen: session.endedAt });
      } else {
        existing.count += 1;
        if (session.endedAt > existing.lastSeen) existing.lastSeen = session.endedAt;
      }
    }
  }

  const redFlagFrequency = [...redFlagMap.values()].sort((a, b) => b.count - a.count);

  const midpoint = Math.floor(sorted.length / 2);
  const earlySessions = sorted.slice(0, Math.max(1, midpoint));
  const recentSessions = sorted.slice(Math.max(0, sorted.length - Math.max(1, midpoint)));
  const metricNames = new Set<string>();
  for (const session of sorted) {
    for (const metric of session.evaluation.metrics) {
      metricNames.add(metric.metric);
    }
  }

  const metricTrends: MetricTrend[] = [...metricNames]
    .map((metricName) => {
      const earlyScores: number[] = [];
      const recentScores: number[] = [];
      for (const session of earlySessions) {
        for (const metric of session.evaluation.metrics) {
          if (metric.metric === metricName) earlyScores.push(metric.score);
        }
      }
      for (const session of recentSessions) {
        for (const metric of session.evaluation.metrics) {
          if (metric.metric === metricName) recentScores.push(metric.score);
        }
      }

      const earlyAverage = average(earlyScores);
      const recentAverage = average(recentScores);
      return {
        metric: metricName,
        earlyAverage,
        recentAverage,
        delta: round2(recentAverage - earlyAverage),
      };
    })
    .sort((a, b) => b.delta - a.delta);

  const previousScores = sorted
    .slice(0, Math.max(0, sorted.length - 3))
    .slice(-3)
    .map((session) => session.evaluation.averageScore);
  const recentScores = sorted
    .slice(-3)
    .map((session) => session.evaluation.averageScore);

  const momentumDelta = round2(average(recentScores) - average(previousScores));

  return {
    scorePoints,
    redFlagFrequency,
    metricTrends,
    momentumDelta,
  };
}
