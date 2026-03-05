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
  const persona = (parsed.persona ?? "").trim();

  if (!title || !summary || !persona) {
    throw new Error("Wildcard scenario response is missing required fields.");
  }

  return { title, summary, persona };
}

export function formatWildcardScenario(scenario: ScenarioLike): string {
  return `${scenario.title}\n\nSummary: ${scenario.summary}\n\nPersona: ${scenario.persona}`;
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
    persona: `${source.persona} You are motivated to improve but unsure what to prioritize first.`,
  };
}
