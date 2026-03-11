import test from "node:test";
import assert from "node:assert/strict";
import {
  loadCloudState,
  mergeCloudState,
  normalizeCloudState,
  saveDashboardSnapshot,
  saveCloudState,
  saveLoginEvent,
  type CloudState,
  type DashboardSnapshotPayload,
  type LoginEventPayload,
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

test("saveLoginEvent posts payload to login event API route", async () => {
  let capturedUrl = "";
  let capturedBody = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url, init) => {
    capturedUrl = String(url);
    capturedBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const payload: LoginEventPayload = {
    user_email: "coach@example.com",
    login_at: "2026-03-11T03:00:00.000Z",
    coaching_scenario_description: "Client is deciding between offers.",
    wildcard_scenario_description: "",
    level_selected: "novice",
    ambiguity_level: 3,
    resistance_level: 2,
    emotional_volatility_level: 2,
    goal_conflict_level: 4,
    ai_agent_selected: "Zephyr",
    ai_model_selected: "gemini-2.5-flash-native-audio-preview-09-2025",
    session_duration_minutes: 10,
    timezone: "America/New_York",
  };

  try {
    await saveLoginEvent(payload);
    assert.equal(capturedUrl, "/api/login_event");
    const body = JSON.parse(capturedBody) as LoginEventPayload;
    assert.equal(body.user_email, "coach@example.com");
    assert.equal(body.ai_agent_selected, "Zephyr");
    assert.equal(body.session_duration_minutes, 10);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("saveLoginEvent treats 503 as cloud not configured", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "supabase_not_configured" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  const payload: LoginEventPayload = {
    user_email: "coach@example.com",
    login_at: "2026-03-11T03:00:00.000Z",
    coaching_scenario_description: "",
    wildcard_scenario_description: "",
    level_selected: "novice",
    ambiguity_level: 1,
    resistance_level: 1,
    emotional_volatility_level: 1,
    goal_conflict_level: 1,
    ai_agent_selected: "Zephyr",
    ai_model_selected: "gemini-2.5-flash-native-audio-preview-09-2025",
    session_duration_minutes: 10,
    timezone: "America/New_York",
  };

  try {
    await assert.rejects(() => saveLoginEvent(payload), /cloud_not_configured/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("saveDashboardSnapshot posts payload to dashboard snapshot API route", async () => {
  let capturedUrl = "";
  let capturedBody = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url, init) => {
    capturedUrl = String(url);
    capturedBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const payload: DashboardSnapshotPayload = {
    user_email: "coach@example.com",
    snapshot_at: "2026-03-11T04:00:00.000Z",
    timezone: "America/New_York",
    ui_theme: "dark",
    coach_level_selected: "novice",
    ai_agent_selected: "Zephyr",
    session_duration_minutes: 10,
    scenario_current: "Client is overwhelmed at work.",
    challenge_profile: {
      ambiguity: 3,
      resistance: 2,
      emotionalVolatility: 2,
      goalConflict: 4,
    },
    total_sessions: 12,
    average_performance_percent: 68,
    overall_average_score: 6.8,
    latest_average_score: 7.1,
    total_red_flags: 8,
    total_practice_minutes: 94,
    practice_goal_progress: 100,
    momentum_delta: 0.7,
    strongest_skill: "Maintains Presence",
    strongest_skill_score: 7.8,
    focus_skill: "Evokes Awareness",
    focus_skill_score: 5.4,
    latest_quality_band: "steady",
    latest_quality_score: 72,
    score_history_points: [],
    skill_breakdown: [],
    competency_momentum: [],
    competency_trajectory: [],
    learning_snapshot: { wins: [], targets: [] },
    latest_feedback: { summary: "Solid session." },
    top_recommendations: [],
    red_flag_frequency: [],
  };

  try {
    await saveDashboardSnapshot(payload);
    assert.equal(capturedUrl, "/api/dashboard_snapshot");
    const body = JSON.parse(capturedBody) as DashboardSnapshotPayload;
    assert.equal(body.user_email, "coach@example.com");
    assert.equal(body.total_sessions, 12);
    assert.equal(body.coach_level_selected, "novice");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("saveDashboardSnapshot treats 503 as cloud not configured", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "supabase_not_configured" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  const payload: DashboardSnapshotPayload = {
    user_email: "coach@example.com",
    snapshot_at: "2026-03-11T04:00:00.000Z",
    timezone: "America/New_York",
    ui_theme: "dark",
    coach_level_selected: "novice",
    ai_agent_selected: "Zephyr",
    session_duration_minutes: 10,
    scenario_current: "",
    challenge_profile: {},
    total_sessions: 0,
    average_performance_percent: 0,
    overall_average_score: 0,
    latest_average_score: 0,
    total_red_flags: 0,
    total_practice_minutes: 0,
    practice_goal_progress: 0,
    momentum_delta: 0,
    strongest_skill: "",
    strongest_skill_score: 0,
    focus_skill: "",
    focus_skill_score: 0,
    latest_quality_band: "",
    latest_quality_score: 0,
    score_history_points: [],
    skill_breakdown: [],
    competency_momentum: [],
    competency_trajectory: [],
    learning_snapshot: {},
    latest_feedback: {},
    top_recommendations: [],
    red_flag_frequency: [],
  };

  try {
    await assert.rejects(() => saveDashboardSnapshot(payload), /cloud_not_configured/);
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
