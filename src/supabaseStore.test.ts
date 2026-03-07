import test from "node:test";
import assert from "node:assert/strict";
import {
  loadCloudState,
  normalizeCloudState,
  saveCloudState,
  type CloudState,
} from "./supabaseStore";

test("normalizeCloudState supports row object shape", () => {
  const normalized = normalizeCloudState({
    sessions: [
      {
        id: "s1",
        startedAt: "2026-03-01T09:00:00.000Z",
        endedAt: "2026-03-01T09:10:00.000Z",
        plannedSeconds: 600,
        elapsedSeconds: 600,
        endedReason: "timer_elapsed",
        scenario: "Scenario",
        transcript: "Coach: hi",
        evaluation: {
          summary: "Summary",
          recommendations: [],
          redFlags: [],
          averageScore: 7,
          metrics: [],
        },
      },
    ],
    call_logs: [
      {
        id: "c1",
        timestamp: "2026-03-01T09:11:00.000Z",
        type: "session.finalize",
        status: "success",
      },
    ],
  });

  assert.ok(normalized);
  assert.equal(normalized?.sessions.length, 1);
  assert.equal(normalized?.callLogs.length, 1);
});

test("normalizeCloudState supports array response and null safety", () => {
  const payload: CloudState[] = [
    {
      user_email: "coach@example.com",
      sessions: [],
      call_logs: [],
      updated_at: "2026-03-01T09:00:00.000Z",
    },
  ];
  const normalized = normalizeCloudState(payload);
  assert.ok(normalized);
  assert.equal(normalized?.sessions.length, 0);
  assert.equal(normalized?.callLogs.length, 0);

  const nullResult = normalizeCloudState([]);
  assert.equal(nullResult, null);
});

test("loadCloudState falls back to local mode when API returns non-JSON success", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("<!doctype html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    })) as typeof fetch;

  try {
    const state = await loadCloudState("coach@example.com");
    assert.equal(state, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("saveCloudState treats 404 cloud route as not configured", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("Not Found", {
      status: 404,
      headers: { "content-type": "text/plain" },
    })) as typeof fetch;

  try {
    await assert.rejects(
      () => saveCloudState("coach@example.com", [], []),
      /cloud_not_configured/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
