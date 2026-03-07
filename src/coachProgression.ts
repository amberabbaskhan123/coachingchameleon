import type { SessionRecord } from "./sessionData";

export type CoachLevel = "novice" | "intermediate" | "advanced";

export type ChallengeProfile = {
  ambiguity: number;
  resistance: number;
  emotionalVolatility: number;
  goalConflict: number;
};

export type UnlockState = {
  unlockedLevels: CoachLevel[];
  recommendedLevel: CoachLevel;
  rationale: string;
};

export const DEFAULT_CHALLENGE_PROFILE: ChallengeProfile = {
  ambiguity: 3,
  resistance: 3,
  emotionalVolatility: 3,
  goalConflict: 3,
};

const LEVELS: CoachLevel[] = ["novice", "intermediate", "advanced"];

const clamp = (value: number): number => Math.max(1, Math.min(5, Math.round(value)));

const avg = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

export const levelLabel = (level: CoachLevel): string =>
  level === "novice" ? "Novice" : level === "intermediate" ? "Intermediate" : "Advanced";

export const buildUnlockState = (sessions: SessionRecord[]): UnlockState => {
  if (sessions.length === 0) {
    return {
      unlockedLevels: ["novice"],
      recommendedLevel: "novice",
      rationale: "Complete initial sessions to unlock higher challenge levels.",
    };
  }

  const sorted = [...sessions].sort((a, b) => a.endedAt.localeCompare(b.endedAt));
  const recent = sorted.slice(-5);
  const recentAverage = avg(recent.map((session) => session.evaluation.averageScore));
  const redFlagRate =
    sorted.reduce((sum, session) => sum + session.evaluation.redFlags.length, 0) /
    Math.max(1, sorted.length);

  const unlocked: CoachLevel[] = ["novice"];
  if (sorted.length >= 3 && recentAverage >= 5.5) {
    unlocked.push("intermediate");
  }
  if (sorted.length >= 8 && recentAverage >= 7 && redFlagRate <= 1.2) {
    unlocked.push("advanced");
  }

  const recommendedLevel = unlocked[unlocked.length - 1];
  const rationale =
    recommendedLevel === "advanced"
      ? "Advanced unlocked: strong recent competency scores with controlled red flags."
      : recommendedLevel === "intermediate"
        ? "Intermediate unlocked: consistent rubric momentum across recent sessions."
        : "Novice focus: build consistency before adding higher scenario complexity.";

  return {
    unlockedLevels: unlocked,
    recommendedLevel,
    rationale,
  };
};

const descriptor = (
  value: number,
  low: string,
  mid: string,
  high: string,
): string => {
  const normalized = clamp(value);
  if (normalized <= 2) return low;
  if (normalized >= 4) return high;
  return mid;
};

export const buildLevelInstruction = (
  level: CoachLevel,
  challenge: ChallengeProfile,
): string => {
  const ambiguity = descriptor(
    challenge.ambiguity,
    "problem framing is explicit and concrete",
    "problem framing is partially unclear with mild ambiguity",
    "problem framing is ambiguous and layered",
  );
  const resistance = descriptor(
    challenge.resistance,
    "client is cooperative and quickly engages",
    "client alternates between openness and hesitation",
    "client is defensive, guarded, and challenges questions",
  );
  const volatility = descriptor(
    challenge.emotionalVolatility,
    "emotions are steady and mostly regulated",
    "emotion shifts occur with moderate intensity",
    "emotion shifts are frequent and intense",
  );
  const conflict = descriptor(
    challenge.goalConflict,
    "goals are relatively aligned and simple",
    "goals contain moderate tension",
    "goals are competing and hard to reconcile",
  );

  const levelInstruction =
    level === "advanced"
      ? "Simulate high nuance, subtle resistance, and delayed insight formation. Require clean inquiry for deeper disclosure."
      : level === "intermediate"
        ? "Simulate moderate complexity, occasional guardedness, and non-linear progress."
        : "Simulate clear issues with manageable emotional complexity while preserving realism.";

  return [
    `Training level: ${levelLabel(level)}.`,
    levelInstruction,
    `Challenge profile: ${ambiguity}; ${resistance}; ${volatility}; ${conflict}.`,
  ].join(" ");
};

export const isLevelUnlocked = (
  unlockState: UnlockState,
  level: CoachLevel,
): boolean => unlockState.unlockedLevels.includes(level);

export const orderedLevels = (): CoachLevel[] => [...LEVELS];
