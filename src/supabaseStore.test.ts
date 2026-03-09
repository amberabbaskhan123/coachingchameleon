import test from "node:test";
import assert from "node:assert/strict";
import {
  loadCloudState,
  mergeCloudState,
  normalizeCloudState,
  saveCloudState,
  type CloudState,
} from "./supabaseStore";
import type { CallLogEntry, SessionRecord } from "./sessionData";

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

const createSession = (
  id: string,
  endedAt: string,
  score = 6,
): SessionRecord => ({
  id,
  startedAt: "2026-03-07T10:00:00.000Z",
  endedAt,
  plannedSeconds: 600,
  elapsedSeconds: 580,
  endedReason: "timer_elapsed",
  scenario: "Scenario",
  transcript: "Coach: hi\nClient: hey",
  evaluation: {
    summary: "Summary",
    recommendations: [],
    redFlags: [],
    averageScore: score,
    metrics: [],
  },
});

const createLog = (
  id: string,
  timestamp: string,
  status: CallLogEntry["status"] = "info",
): CallLogEntry => ({
  id,
  timestamp,
  type: "session.finalize",
  status,
});

test("mergeCloudState keeps local data when remote is empty", () => {
  const localSessions = [createSession("s-local", "2026-03-07T10:10:00.000Z")];
  const localLogs = [createLog("l-local", "2026-03-07T10:11:00.000Z")];
  const merged = mergeCloudState(localSessions, localLogs, { sessions: [], callLogs: [] });

  assert.equal(merged.sessions.length, 1);
  assert.equal(merged.sessions[0]?.id, "s-local");
  assert.equal(merged.callLogs.length, 1);
  assert.equal(merged.callLogs[0]?.id, "l-local");
});

test("mergeCloudState de-duplicates and keeps latest record for matching ids", () => {
  const localSessions = [createSession("s1", "2026-03-07T10:10:00.000Z", 5)];
  const remoteSessions = [
    createSession("s1", "2026-03-07T10:15:00.000Z", 8),
    createSession("s2", "2026-03-07T11:00:00.000Z", 7),
  ];
  const localLogs = [createLog("l1", "2026-03-07T10:11:00.000Z")];
  const remoteLogs = [createLog("l1", "2026-03-07T10:12:00.000Z"), createLog("l2", "2026-03-07T11:02:00.000Z")];

  const merged = mergeCloudState(localSessions, localLogs, {
    sessions: remoteSessions,
    callLogs: remoteLogs,
  });

  assert.equal(merged.sessions.length, 2);
  const s1 = merged.sessions.find((session) => session.id === "s1");
  assert.equal(s1?.endedAt, "2026-03-07T10:15:00.000Z");
  assert.equal(s1?.evaluation.averageScore, 8);

  assert.equal(merged.callLogs.length, 2);
  const l1 = merged.callLogs.find((entry) => entry.id === "l1");
  assert.equal(l1?.timestamp, "2026-03-07T10:12:00.000Z");
});
