export type TranscriptLines = {
  coach: string[];
  client: string[];
};

const asString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const appendUnique = (target: string[], value: string) => {
  if (!value) return;
  if (target[target.length - 1] === value) return;
  target.push(value);
};

export function extractTranscriptLines(message: unknown): TranscriptLines {
  const result: TranscriptLines = { coach: [], client: [] };
  const root = asRecord(message);
  if (!root) return result;

  const serverContent = asRecord(root.serverContent);
  const modelTurn = asRecord(serverContent?.modelTurn);
  const parts = Array.isArray(modelTurn?.parts) ? modelTurn.parts : [];

  for (const part of parts) {
    const partRecord = asRecord(part);
    const text = asString(partRecord?.text);
    appendUnique(result.client, text);
  }

  // Current SDK shape for live input/output transcription.
  const inputTranscription = asRecord(serverContent?.inputTranscription);
  appendUnique(result.coach, asString(inputTranscription?.text));

  const outputTranscription = asRecord(serverContent?.outputTranscription);
  const outputText = asString(outputTranscription?.text);
  if (result.client.length === 0) {
    appendUnique(result.client, outputText);
  }

  // Backward compatibility with older message shapes.
  const legacyInputTranscription = asRecord(root.inputTranscription);
  appendUnique(result.coach, asString(legacyInputTranscription?.data));

  return result;
}
