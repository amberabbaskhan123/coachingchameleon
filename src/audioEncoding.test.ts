import test from "node:test";
import assert from "node:assert/strict";
import { int16PcmToBase64 } from "./audioEncoding";

const base64ToBytes = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

test("int16PcmToBase64 preserves raw PCM bytes", () => {
  const pcm = new Int16Array([0, 1024, -1024, 16384, -16384, 32767, -32768]);
  const encoded = int16PcmToBase64(pcm);
  const decoded = base64ToBytes(encoded);
  const original = new Uint8Array(pcm.buffer);
  assert.equal(decoded.length, original.length);
  assert.deepEqual([...decoded], [...original]);
});

test("int16PcmToBase64 handles larger buffers without throwing", () => {
  const pcm = new Int16Array(32768);
  for (let i = 0; i < pcm.length; i += 1) {
    pcm[i] = (i % 2000) - 1000;
  }
  const encoded = int16PcmToBase64(pcm);
  assert.ok(encoded.length > 0);
});
