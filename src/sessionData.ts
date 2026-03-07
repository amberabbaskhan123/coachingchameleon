export type EvaluationMetric = {
  category: string;
  metric: string;
  score: number;
  comments: string;
  confidence?: number;
  evidence?: string[];
  calibrationNote?: string;
};

export type EvaluationCalibration = {
  alignmentScore: number;
  benchmark: string;
  notes: string[];
};

export type EvaluationReport = {
  summary: string;
  recommendations: string[];
  redFlags: string[];
  averageScore: number;
  metrics: EvaluationMetric[];
  calibration?: EvaluationCalibration;
};

export type SessionEndReason =
  | "manual_stop"
  | "timer_elapsed"
  | "remote_close"
  | "error";

export type CallLogEntry = {
  id: string;
  timestamp: string;
  type: string;
  status: "started" | "success" | "fallback" | "error" | "info";
  details?: string;
};

export type SessionRecord = {
  id: string;
  startedAt: string;
  endedAt: string;
  plannedSeconds: number;
  elapsedSeconds: number;
  endedReason: SessionEndReason;
  scenario: string;
  transcript: string;
  evaluation: EvaluationReport;
  trainingConfig?: {
    level: string;
    challenge: {
      ambiguity: number;
      resistance: number;
      emotionalVolatility: number;
      goalConflict: number;
    };
  };
  adaptiveProfile?: {
    qualityBand: string;
    qualityScore: number;
    turns: number;
    openQuestions: number;
    leadingQuestions: number;
    adviceMoments: number;
    empathyMoments: number;
  };
  audio?: {
    available: boolean;
    mimeType?: string;
    sizeBytes?: number;
  };
};

export type ProgressSummary = {
  totalSessions: number;
  latestAverageScore: number;
  overallAverageScore: number;
  totalRedFlags: number;
};

export type SessionScorecardExport = {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  plannedSeconds: number;
  elapsedSeconds: number;
  endedReason: SessionEndReason;
  scenario: string;
  evaluation: EvaluationReport;
  trainingConfig?: SessionRecord["trainingConfig"];
  adaptiveProfile?: SessionRecord["adaptiveProfile"];
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

const asString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(asString).filter(Boolean) : [];

const asNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseMetric = (entry: unknown): EvaluationMetric | null => {
  if (!isRecord(entry)) return null;
  const category = asString(entry.category);
  const metric = asString(entry.metric);
  const comments = asString(entry.comments);
  const score = asNumber(entry.score);
  if (!category || !metric || !comments) return null;
  const confidenceRaw = asNumber(entry.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : undefined;
  const evidence = asStringArray(entry.evidence).slice(0, 3);
  const calibrationNote = asString(entry.calibrationNote) || undefined;

  return {
    category,
    metric,
    comments,
    score: Math.max(0, Math.min(10, score)),
    confidence,
    evidence: evidence.length > 0 ? evidence : undefined,
    calibrationNote,
  };
};

const extractRedFlagsFromMetrics = (
  metrics: EvaluationMetric[],
): { redFlags: string[]; cleanMetrics: EvaluationMetric[] } => {
  const redFlags: string[] = [];
  const cleanMetrics: EvaluationMetric[] = [];

  for (const metric of metrics) {
    if (metric.category.toUpperCase() === "RED_FLAGS") {
      redFlags.push(metric.comments);
      continue;
    }
    cleanMetrics.push(metric);
  }

  return { redFlags, cleanMetrics };
};

const deriveRecommendations = (
  metrics: EvaluationMetric[],
  redFlags: string[],
): string[] => {
  const recommendations: string[] = [];
  const lowScores = [...metrics].sort((a, b) => a.score - b.score).slice(0, 3);

  for (const metric of lowScores) {
    if (metric.score < 7) {
      recommendations.push(
        `Improve "${metric.metric}" by practicing one focused question cycle before advising.`,
      );
    }
  }

  if (redFlags.length > 0) {
    recommendations.push(
      "Avoid leading, therapy-style interpretation, and directive advice; stay in coaching inquiry.",
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "Sustain current strengths and deepen client-led reflection with fewer assumptions.",
    );
  }

  return recommendations;
};

const averageMetricScore = (metrics: EvaluationMetric[]): number => {
  if (metrics.length === 0) return 0;
  return round2(metrics.reduce((sum, metric) => sum + metric.score, 0) / metrics.length);
};

export function normalizeEvaluationPayload(payload: unknown): EvaluationReport {
  const metricsFromPayload = Array.isArray(payload)
    ? payload.map(parseMetric).filter(Boolean)
    : isRecord(payload) && Array.isArray(payload.metrics)
      ? payload.metrics.map(parseMetric).filter(Boolean)
      : [];

  const metrics = metricsFromPayload as EvaluationMetric[];
  const { redFlags: metricRedFlags, cleanMetrics } = extractRedFlagsFromMetrics(
    metrics,
  );

  const directRedFlags =
    isRecord(payload) && Array.isArray(payload.redFlags)
      ? payload.redFlags.map(asString).filter(Boolean)
      : [];

  const redFlags = [...directRedFlags, ...metricRedFlags];
  const recommendationsFromPayload =
    isRecord(payload) && Array.isArray(payload.recommendations)
      ? payload.recommendations.map(asString).filter(Boolean)
      : [];

  const calibration =
    isRecord(payload) && isRecord(payload.calibration)
      ? {
          alignmentScore: Math.max(0, Math.min(100, asNumber(payload.calibration.alignmentScore))),
          benchmark: asString(payload.calibration.benchmark) || "internal-expert-benchmarks-v1",
          notes: asStringArray(payload.calibration.notes).slice(0, 4),
        }
      : undefined;

  const recommendations =
    recommendationsFromPayload.length > 0
      ? recommendationsFromPayload
      : deriveRecommendations(cleanMetrics, redFlags);

  const summary =
    isRecord(payload) && asString(payload.summary)
      ? asString(payload.summary)
      : "Session evaluation complete.";

  return {
    summary,
    recommendations,
    redFlags,
    averageScore: averageMetricScore(cleanMetrics),
    metrics: cleanMetrics,
    calibration,
  };
}

export function buildProgressSummary(sessions: SessionRecord[]): ProgressSummary {
  if (sessions.length === 0) {
    return {
      totalSessions: 0,
      latestAverageScore: 0,
      overallAverageScore: 0,
      totalRedFlags: 0,
    };
  }

  const sorted = [...sessions].sort((a, b) => a.endedAt.localeCompare(b.endedAt));
  const latest = sorted[sorted.length - 1];
  const overallAverageScore = round2(
    sorted.reduce((sum, session) => sum + session.evaluation.averageScore, 0) /
      sorted.length,
  );
  const totalRedFlags = sorted.reduce(
    (sum, session) => sum + session.evaluation.redFlags.length,
    0,
  );

  return {
    totalSessions: sorted.length,
    latestAverageScore: latest.evaluation.averageScore,
    overallAverageScore,
    totalRedFlags,
  };
}

export function buildTranscriptExport(session: SessionRecord): string {
  return [
    "KoMe Ai Session Transcript",
    "====================================",
    `Session ID: ${session.id}`,
    `Started At: ${session.startedAt}`,
    `Ended At: ${session.endedAt}`,
    `Planned Duration (s): ${session.plannedSeconds}`,
    `Elapsed Duration (s): ${session.elapsedSeconds}`,
    `Ended Reason: ${session.endedReason}`,
    `Scenario: ${session.scenario}`,
    "",
    "Transcript",
    "----------",
    session.transcript || "(No transcript captured)",
    "",
  ].join("\n");
}

export function buildScorecardExport(
  session: SessionRecord,
): SessionScorecardExport {
  return {
    sessionId: session.id,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    plannedSeconds: session.plannedSeconds,
    elapsedSeconds: session.elapsedSeconds,
    endedReason: session.endedReason,
    scenario: session.scenario,
    evaluation: session.evaluation,
    trainingConfig: session.trainingConfig,
    adaptiveProfile: session.adaptiveProfile,
  };
}

export function audioExtensionFromMimeType(mimeType: string | undefined): string {
  const normalized = (mimeType ?? "").toLowerCase();
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("mp4")) return "m4a";
  if (normalized.includes("aac")) return "aac";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("wav")) return "wav";
  return "audio";
}
