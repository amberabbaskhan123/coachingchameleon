type ScenarioLike = {
  title: string;
  summary: string;
  persona: string;
};

export type WildcardScenario = {
  title: string;
  summary: string;
  persona: string;
};

const PLACEHOLDER_KEYS = new Set(["", "MY_GEMINI_API_KEY", "dummy"]);

const normalizeWildcardPersona = (persona: string): string => {
  const replacements: Array<[RegExp, string]> = [
    [/\b[Yy]ou are\b/g, "the client is"],
    [/\b[Yy]ou['’]re\b/g, "the client is"],
    [/\b[Yy]ou['’]ve\b/g, "the client has"],
    [/\b[Yy]ou['’]ll\b/g, "the client will"],
    [/\b[Yy]ou['’]d\b/g, "the client would"],
    [/\b[Yy]ourself\b/g, "themself"],
    [/\b[Yy]ours\b/g, "the client's"],
    [/\b[Yy]our\b/g, "the client's"],
    [/\b[Yy]ou\b/g, "the client"],
  ];

  return replacements.reduce(
    (normalized, [pattern, replacement]) =>
      normalized.replace(pattern, replacement),
    persona,
  );
};

export function hasUsableApiKey(apiKey: string | undefined): boolean {
  return !PLACEHOLDER_KEYS.has((apiKey ?? "").trim());
}

function extractJsonBlob(text: string): string {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();

  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) return objectMatch[0];

  return text;
}

export function parseWildcardScenario(text: string): WildcardScenario {
  const parsed = JSON.parse(extractJsonBlob(text)) as Partial<WildcardScenario>;
  const title = (parsed.title ?? "").trim();
  const summary = (parsed.summary ?? "").trim();
  const persona = normalizeWildcardPersona((parsed.persona ?? "").trim());

  if (!title || !summary || !persona) {
    throw new Error("Wildcard scenario response is missing required fields.");
  }

  return { title, summary, persona };
}

export function formatWildcardScenario(scenario: ScenarioLike): string {
  const normalizedPersona = normalizeWildcardPersona(scenario.persona);
  return `${scenario.title}\n\nSummary: ${scenario.summary}\n\nPersona: ${normalizedPersona}`;
}

export function fallbackWildcardScenario(
  scenarios: ScenarioLike[],
): WildcardScenario {
  const source =
    scenarios[Math.floor(Math.random() * scenarios.length)] ?? {
      title: "High-Stakes Team Conflict",
      summary:
        "A leadership team is split after a failed launch and trust is low.",
      persona:
        "You are a thoughtful but defensive leader under pressure, trying to recover credibility while holding your team together.",
    };

  return {
    title: `Wildcard: ${source.title}`,
    summary: `${source.summary} Add a surprising constraint: a key decision must be made in the next 24 hours.`,
    persona: normalizeWildcardPersona(
      `${source.persona} The client is motivated to improve but unsure what to prioritize first.`,
    ),
  };
}
