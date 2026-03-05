import test from "node:test";
import assert from "node:assert/strict";
import { extractTranscriptLines } from "./liveTranscript";

test("extractTranscriptLines reads coach transcription from serverContent.inputTranscription.text", () => {
  const lines = extractTranscriptLines({
    serverContent: {
      inputTranscription: { text: "What feels most important today?" },
    },
  });

  assert.deepEqual(lines.coach, ["What feels most important today?"]);
});

test("extractTranscriptLines reads client text from modelTurn parts", () => {
  const lines = extractTranscriptLines({
    serverContent: {
      modelTurn: {
        parts: [{ text: "I feel stuck in my role." }],
      },
    },
  });

  assert.deepEqual(lines.client, ["I feel stuck in my role."]);
});

test("extractTranscriptLines keeps backward compatibility for legacy inputTranscription.data", () => {
  const lines = extractTranscriptLines({
    inputTranscription: { data: "Legacy coach transcript" },
  });

  assert.deepEqual(lines.coach, ["Legacy coach transcript"]);
});
