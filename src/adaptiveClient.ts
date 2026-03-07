export type CoachQualityBand = "supportive" | "mixed" | "directive";

export type CoachSignalState = {
  turns: number;
  openQuestions: number;
  leadingQuestions: number;
  adviceMoments: number;
  empathyMoments: number;
  qualityScore: number;
  qualityBand: CoachQualityBand;
};

const LEADING_PATTERNS = [
  /don['’]t you think/i,
  /wouldn['’]t it be better/i,
  /isn['’]t it true/i,
  /why don['’]t you/i,
  /have you tried/i,
  /you should/i,
  /you need to/i,
];

const ADVICE_PATTERNS = [
  /you should/i,
  /you need to/i,
  /i suggest/i,
  /my advice/i,
  /have you tried/i,
  /why don['’]t you/i,
  /here(?:'| i)s what to do/i,
  /try to/i,
  /the best thing is/i,
];

const EMPATHY_PATTERNS = [
  /it sounds like/i,
  /i hear/i,
  /that seems/i,
  /that must feel/i,
  /it makes sense/i,
  /you(?:'| a)re feeling/i,
];

const OPEN_QUESTION_PREFIX = /^\s*(what|how|when|where|who|which|could|can|would|tell me|help me understand)\b/i;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const round1 = (value: number): number => Math.round(value * 10) / 10;

const hasPattern = (text: string, patterns: RegExp[]): boolean =>
  patterns.some((pattern) => pattern.test(text));

export const createCoachSignalState = (): CoachSignalState => ({
  turns: 0,
  openQuestions: 0,
  leadingQuestions: 0,
  adviceMoments: 0,
  empathyMoments: 0,
  qualityScore: 50,
  qualityBand: "mixed",
});

export const detectCoachSignals = (line: string) => {
  const text = line.trim();
  const hasQuestion = text.includes("?");
  const leading = hasPattern(text, LEADING_PATTERNS);
  const advice = hasPattern(text, ADVICE_PATTERNS);
  const empathy = hasPattern(text, EMPATHY_PATTERNS);
  const open = hasQuestion && OPEN_QUESTION_PREFIX.test(text) && !leading;
  return {
    openQuestions: open ? 1 : 0,
    leadingQuestions: leading ? 1 : 0,
    adviceMoments: advice ? 1 : 0,
    empathyMoments: empathy ? 1 : 0,
  };
};

const qualityBandFromScore = (score: number): CoachQualityBand => {
  if (score >= 70) return "supportive";
  if (score <= 44) return "directive";
  return "mixed";
};

export const updateCoachSignalState = (
  state: CoachSignalState,
  line: string,
): CoachSignalState => {
  const signals = detectCoachSignals(line);
  let turnScore = 50;
  turnScore += signals.openQuestions * 28;
  turnScore += signals.empathyMoments * 32;
  turnScore -= signals.leadingQuestions * 34;
  turnScore -= signals.adviceMoments * 28;
  if (signals.openQuestions === 0 && signals.empathyMoments === 0) {
    turnScore -= 6;
  }

  const normalizedTurnScore = clamp(turnScore, 0, 100);
  const qualityScore = round1(state.qualityScore * 0.5 + normalizedTurnScore * 0.5);
  const qualityBand = qualityBandFromScore(qualityScore);

  return {
    turns: state.turns + 1,
    openQuestions: state.openQuestions + signals.openQuestions,
    leadingQuestions: state.leadingQuestions + signals.leadingQuestions,
    adviceMoments: state.adviceMoments + signals.adviceMoments,
    empathyMoments: state.empathyMoments + signals.empathyMoments,
    qualityScore,
    qualityBand,
  };
};

export const buildAdaptiveClientDirective = (state: CoachSignalState): string => {
  if (state.qualityBand === "supportive") {
    return `[ADAPTIVE_COACH_SIGNAL]
Quality band: supportive (${state.qualityScore}/100).
Coach behavior suggests client-led inquiry and emotional attunement.
Client response mode: soften and trust more, disclose deeper beliefs, provide fuller context, and show gradual insight formation.`;
  }

  if (state.qualityBand === "directive") {
    return `[ADAPTIVE_COACH_SIGNAL]
Quality band: directive (${state.qualityScore}/100).
Coach behavior includes leading or advice-heavy moves.
Client response mode: become cautious and guarded, shorten responses, return to facts, and ask for clarification before opening up.`;
  }

  return `[ADAPTIVE_COACH_SIGNAL]
Quality band: mixed (${state.qualityScore}/100).
Coach behavior is partially exploratory with some directive moments.
Client response mode: alternate between openness and guardedness; share some insight but keep uncertainty and hesitation visible.`;
};
