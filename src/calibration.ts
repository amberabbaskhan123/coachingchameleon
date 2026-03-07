import type { EvaluationMetric, EvaluationReport } from "./sessionData";

type ExpertBenchmark = {
  metricKey: string;
  keywords: string[];
  expectedScore: number;
  benchmarkBehavior: string;
};

const BENCHMARK_SET = "internal-expert-benchmarks-v1";

export const expertCalibrationBenchmarks: ExpertBenchmark[] = [
  {
    metricKey: "Clarity of Purpose",
    keywords: ["goal", "outcome", "focus", "contract", "purpose"],
    expectedScore: 8,
    benchmarkBehavior:
      "Coach co-creates a clear session objective and revisits it when focus drifts.",
  },
  {
    metricKey: "Emotional Responsiveness",
    keywords: ["feel", "sounds", "hear", "emotion", "hard"],
    expectedScore: 8,
    benchmarkBehavior:
      "Coach names emotion and responds with attuned pacing before moving to problem-solving.",
  },
  {
    metricKey: "Reflective Understanding",
    keywords: ["hearing", "reflect", "summary", "what I hear", "mirror"],
    expectedScore: 7.5,
    benchmarkBehavior:
      "Coach reflects both content and meaning so the client feels accurately understood.",
  },
  {
    metricKey: "Encouraging New Perspectives",
    keywords: ["what else", "another way", "perspective", "notice", "reframe"],
    expectedScore: 7.5,
    benchmarkBehavior:
      "Coach uses non-leading inquiry to unlock client-generated perspective shifts.",
  },
  {
    metricKey: "Translating Awareness",
    keywords: ["next step", "experiment", "action", "commit", "between now"],
    expectedScore: 7.5,
    benchmarkBehavior:
      "Coach helps convert insight into one concrete and realistic action.",
  },
];

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const round1 = (value: number): number => Math.round(value * 10) / 10;
const round2 = (value: number): number => Math.round(value * 100) / 100;

const scoreAlignment = (score: number, expectedScore: number): number =>
  round1(clamp(100 - Math.abs(score - expectedScore) * 12, 20, 100));

const splitTranscript = (transcript: string): string[] =>
  transcript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const extractEvidence = (
  transcript: string,
  keywords: string[],
  limit = 2,
): string[] => {
  const lines = splitTranscript(transcript);
  const evidence: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith("Coach:")) continue;
    const lower = line.toLowerCase();
    if (!keywords.some((keyword) => lower.includes(keyword.toLowerCase()))) continue;
    evidence.push(`T${index + 1}: ${line.replace(/^Coach:\s*/i, "")}`);
    if (evidence.length >= limit) break;
  }

  return evidence;
};

const matchBenchmark = (metric: EvaluationMetric): ExpertBenchmark => {
  const metricName = metric.metric.toLowerCase();
  const category = metric.category.toLowerCase();
  const exact = expertCalibrationBenchmarks.find(
    (benchmark) => benchmark.metricKey.toLowerCase() === metricName,
  );
  if (exact) return exact;

  const partial = expertCalibrationBenchmarks.find((benchmark) => {
    const key = benchmark.metricKey.toLowerCase();
    return metricName.includes(key.split(" ")[0]) || category.includes(key.split(" ")[0]);
  });
  return partial ?? expertCalibrationBenchmarks[0];
};

const metricCalibrationNote = (
  metric: EvaluationMetric,
  benchmark: ExpertBenchmark,
): string => {
  const delta = metric.score - benchmark.expectedScore;
  if (delta >= 1.2) {
    return `Scored above benchmark. Sustain this behavior: ${benchmark.benchmarkBehavior}`;
  }
  if (delta <= -1.2) {
    return `Below benchmark. Improve by practicing: ${benchmark.benchmarkBehavior}`;
  }
  return `Near benchmark. Keep tightening consistency in: ${benchmark.benchmarkBehavior}`;
};

export function applyCalibration(
  report: EvaluationReport,
  transcript: string,
): EvaluationReport {
  const calibratedMetrics = report.metrics.map((metric) => {
    const benchmark = matchBenchmark(metric);
    const evidence = metric.evidence?.length
      ? metric.evidence
      : extractEvidence(transcript, benchmark.keywords);
    const evidenceBoost = evidence.length >= 2 ? 0.2 : evidence.length === 1 ? 0.1 : -0.12;
    const rawConfidence = (metric.confidence ?? 0.58) + evidenceBoost;
    const confidence = round2(clamp(rawConfidence, 0.15, 0.95));
    const calibrationNote = metric.calibrationNote ?? metricCalibrationNote(metric, benchmark);

    return {
      ...metric,
      confidence,
      evidence,
      calibrationNote,
    };
  });

  const alignmentScore =
    calibratedMetrics.length === 0
      ? 0
      : round1(
          calibratedMetrics.reduce((sum, metric) => {
            const benchmark = matchBenchmark(metric);
            return sum + scoreAlignment(metric.score, benchmark.expectedScore);
          }, 0) / calibratedMetrics.length,
        );

  const topDrifts = calibratedMetrics
    .map((metric) => {
      const benchmark = matchBenchmark(metric);
      return {
        metric,
        drift: Math.abs(metric.score - benchmark.expectedScore),
      };
    })
    .sort((a, b) => b.drift - a.drift)
    .slice(0, 2)
    .map(
      ({ metric }) =>
        `${metric.metric}: ${metric.score}/10 (confidence ${Math.round((metric.confidence ?? 0) * 100)}%)`,
    );

  return {
    ...report,
    metrics: calibratedMetrics,
    calibration: {
      alignmentScore,
      benchmark: BENCHMARK_SET,
      notes:
        topDrifts.length > 0
          ? topDrifts
          : ["Insufficient metric detail for benchmark drift analysis."],
    },
  };
}
