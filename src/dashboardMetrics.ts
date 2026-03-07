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

export type CompetencyMomentum = {
  category: string;
  allTime: number;
  recent: number;
  delta: number;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;
const round1 = (value: number): number => Math.round(value * 10) / 10;

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

export function buildCompetencyMomentum(
  sessions: SessionRecord[],
  recentWindow = 3,
): CompetencyMomentum[] {
  const sorted = [...sessions].sort((a, b) => a.endedAt.localeCompare(b.endedAt));
  const recentSessions = sorted.slice(-Math.max(1, recentWindow));
  const allMap = new Map<string, number[]>();
  const recentMap = new Map<string, number[]>();

  for (const session of sorted) {
    for (const metric of session.evaluation.metrics) {
      if (!allMap.has(metric.category)) {
        allMap.set(metric.category, []);
      }
      allMap.get(metric.category)!.push(metric.score);
    }
  }

  for (const session of recentSessions) {
    for (const metric of session.evaluation.metrics) {
      if (!recentMap.has(metric.category)) {
        recentMap.set(metric.category, []);
      }
      recentMap.get(metric.category)!.push(metric.score);
    }
  }

  return [...allMap.entries()]
    .map(([category, allScores]) => {
      const recentScores = recentMap.get(category) ?? [];
      const allTime = average(allScores);
      const recent = recentScores.length > 0 ? average(recentScores) : allTime;
      return {
        category,
        allTime: round1(allTime),
        recent: round1(recent),
        delta: round1(recent - allTime),
      };
    })
    .sort((a, b) => b.recent - a.recent);
}

export type CompetencyTrendInsight = {
  category: string;
  baseline: number;
  recent: number;
  slope: number;
  consistency: number;
  regressionRisk: boolean;
  trend: "Rising" | "Steady" | "Falling";
  sampleCount: number;
  recentSampleCount: number;
};

export type LearningSnapshot = {
  wins: Array<{
    category: string;
    delta: number;
  }>;
  targets: Array<{
    category: string;
    reason: string;
    action: string;
  }>;
};

const stddev = (values: number[]): number => {
  if (values.length <= 1) return 0;
  const mean = average(values);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const linearSlope = (values: number[]): number => {
  if (values.length <= 1) return 0;
  const n = values.length;
  const xs = values.map((_, index) => index);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;
  const numerator = values.reduce(
    (sum, value, index) => sum + (xs[index] - meanX) * (value - meanY),
    0,
  );
  const denominator = xs.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  if (denominator === 0) return 0;
  return numerator / denominator;
};

export function buildCompetencyTrendInsights(
  sessions: SessionRecord[],
  window = 5,
): CompetencyTrendInsight[] {
  const sorted = [...sessions].sort((a, b) => a.endedAt.localeCompare(b.endedAt));
  const categoryScores = new Map<string, number[]>();

  for (const session of sorted) {
    for (const metric of session.evaluation.metrics) {
      if (!categoryScores.has(metric.category)) {
        categoryScores.set(metric.category, []);
      }
      categoryScores.get(metric.category)!.push(metric.score);
    }
  }

  return [...categoryScores.entries()]
    .filter(([, scores]) => scores.length >= 2)
    .map(([category, scores]) => {
      const recentSlice = scores.slice(-Math.max(1, window));
      const baselineSlice = scores.slice(0, Math.max(0, scores.length - recentSlice.length));
      const baseline = baselineSlice.length > 0 ? average(baselineSlice) : average(scores);
      const recent = average(recentSlice);
      const slope = round2(linearSlope(scores));
      const stability = round1(Math.max(0, 10 - stddev(scores)));
      const regressionRisk = recent + 0.2 < baseline;
      const trend: CompetencyTrendInsight["trend"] =
        slope > 0.15 ? "Rising" : slope < -0.15 ? "Falling" : "Steady";
      return {
        category,
        baseline: round1(baseline),
        recent: round1(recent),
        slope,
        consistency: stability,
        regressionRisk,
        trend,
        sampleCount: scores.length,
        recentSampleCount: recentSlice.length,
      };
    })
    .sort((a, b) => b.recent - a.recent);
}

const targetAction = (category: string): string => {
  if (category.toLowerCase().includes("agreement")) {
    return "Contract one concrete session outcome in the first 2 minutes.";
  }
  if (category.toLowerCase().includes("presence")) {
    return "Name emotion before asking the next question.";
  }
  if (category.toLowerCase().includes("listen")) {
    return "Use a concise reflective summary every 2-3 turns.";
  }
  if (category.toLowerCase().includes("awareness")) {
    return "Use one non-leading open question before any reframe.";
  }
  return "Keep one clean inquiry objective per turn.";
};

export function buildLearningSnapshot(
  sessions: SessionRecord[],
  window = 5,
): LearningSnapshot {
  const insights = buildCompetencyTrendInsights(sessions, window);
  const deltas = insights.map((insight) => ({
    category: insight.category,
    delta: round1(insight.recent - insight.baseline),
    regressionRisk: insight.regressionRisk,
    recent: insight.recent,
  }));

  const wins = deltas
    .filter((item) => item.delta > 0.2)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3)
    .map(({ category, delta }) => ({ category, delta }));

  const targets = deltas
    .filter((item) => item.regressionRisk || item.recent < 6)
    .sort((a, b) => Number(b.regressionRisk) - Number(a.regressionRisk) || a.recent - b.recent)
    .slice(0, 3)
    .map((item) => ({
      category: item.category,
      reason: item.regressionRisk
        ? "Recent performance dropped below baseline."
        : "Recent performance is below target range.",
      action: targetAction(item.category),
    }));

  return {
    wins,
    targets,
  };
}
