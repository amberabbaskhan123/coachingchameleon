import type { CallLogEntry, SessionRecord } from "./sessionData";

export type CloudState = {
  user_email: string;
  sessions: unknown;
  call_logs: unknown;
  updated_at?: string;
};

export type NormalizedCloudState = {
  sessions: SessionRecord[];
  callLogs: CallLogEntry[];
};

const API_BASE = "/api/cloud_state";
const LOGIN_EVENT_API_BASE = "/api/login_event";
const DASHBOARD_SNAPSHOT_API_BASE = "/api/dashboard_snapshot";
const LOCAL_FALLBACK_STATUSES = new Set([404, 405, 503]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asArray = <T>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const coalesceTime = (value: string | undefined): string =>
  typeof value === "string" && value.trim() ? value : "";

const sessionRecency = (session: SessionRecord): string =>
  coalesceTime(session.endedAt) || coalesceTime(session.startedAt);

const logRecency = (entry: CallLogEntry): string => coalesceTime(entry.timestamp);

const mergeSessions = (
  localSessions: SessionRecord[],
  remoteSessions: SessionRecord[],
): SessionRecord[] => {
  const byId = new Map<string, SessionRecord>();
  const unordered: SessionRecord[] = [];

  const upsert = (session: SessionRecord) => {
    const key = session.id?.trim();
    if (!key) {
      unordered.push(session);
      return;
    }
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, session);
      return;
    }
    byId.set(
      key,
      sessionRecency(session) >= sessionRecency(existing) ? session : existing,
    );
  };

  for (const session of localSessions) upsert(session);
  for (const session of remoteSessions) upsert(session);

  return [...unordered, ...byId.values()].sort((a, b) =>
    sessionRecency(a).localeCompare(sessionRecency(b)),
  );
};

const mergeCallLogs = (
  localLogs: CallLogEntry[],
  remoteLogs: CallLogEntry[],
): CallLogEntry[] => {
  const byKey = new Map<string, CallLogEntry>();

  const upsert = (entry: CallLogEntry) => {
    const fallbackKey = [
      entry.timestamp,
      entry.type,
      entry.status,
      entry.details ?? "",
    ].join("|");
    const key = entry.id?.trim() || fallbackKey;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, entry);
      return;
    }
    byKey.set(key, logRecency(entry) >= logRecency(existing) ? entry : existing);
  };

  for (const entry of localLogs) upsert(entry);
  for (const entry of remoteLogs) upsert(entry);

  return [...byKey.values()]
    .sort((a, b) => logRecency(a).localeCompare(logRecency(b)))
    .slice(-1000);
};

export const mergeCloudState = (
  localSessions: SessionRecord[],
  localCallLogs: CallLogEntry[],
  remoteState: NormalizedCloudState | null,
): NormalizedCloudState => ({
  sessions: mergeSessions(localSessions, remoteState?.sessions ?? []),
  callLogs: mergeCallLogs(localCallLogs, remoteState?.callLogs ?? []),
});

const isFallbackBody = (body: string): boolean =>
  /supabase_not_configured|cannot (get|post) \/api\/cloud_state|not found/i.test(
    body,
  );

export function normalizeCloudState(payload: unknown): NormalizedCloudState | null {
  const row = Array.isArray(payload)
    ? payload.length > 0
      ? payload[0]
      : null
    : payload;

  if (!row || !isObject(row)) return null;

  return {
    sessions: asArray<SessionRecord>(row.sessions),
    callLogs: asArray<CallLogEntry>(row.call_logs),
  };
}

export async function loadCloudState(
  userEmail: string,
): Promise<NormalizedCloudState | null> {
  if (!userEmail.trim()) return null;

  const params = new URLSearchParams({ userEmail });
  let response: Response;
  try {
    response = await fetch(`${API_BASE}?${params.toString()}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return null;
  }

  if (LOCAL_FALLBACK_STATUSES.has(response.status)) return null;
  if (!response.ok) {
    const errorBody = await response.text();
    if (isFallbackBody(errorBody)) return null;
    throw new Error(`Cloud state load failed: ${response.status} ${errorBody}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }

  const body = (await response.json()) as { data?: CloudState[] | CloudState };
  if (!body?.data) return null;
  if (Array.isArray(body.data) && body.data.length === 0) {
    return { sessions: [], callLogs: [] };
  }
  return normalizeCloudState(body.data);
}

export async function saveCloudState(
  userEmail: string,
  sessions: SessionRecord[],
  callLogs: CallLogEntry[],
): Promise<void> {
  if (!userEmail.trim()) return;

  const payload = {
    user_email: userEmail,
    sessions,
    call_logs: callLogs,
    updated_at: new Date().toISOString(),
  };

  let response: Response;
  try {
    response = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("cloud_not_configured");
  }

  if (LOCAL_FALLBACK_STATUSES.has(response.status)) {
    throw new Error("cloud_not_configured");
  }
  if (!response.ok) {
    const errorBody = await response.text();
    if (isFallbackBody(errorBody)) {
      throw new Error("cloud_not_configured");
    }
    throw new Error(`Cloud state save failed: ${response.status} ${errorBody}`);
  }
}

export type LoginEventPayload = {
  user_email: string;
  login_at: string;
  coaching_scenario_description: string;
  wildcard_scenario_description: string;
  level_selected: string;
  ambiguity_level: number;
  resistance_level: number;
  emotional_volatility_level: number;
  goal_conflict_level: number;
  ai_agent_selected: string;
  ai_model_selected: string;
  session_duration_minutes: number;
  timezone: string;
};

export async function saveLoginEvent(payload: LoginEventPayload): Promise<void> {
  let response: Response;
  try {
    response = await fetch(LOGIN_EVENT_API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("cloud_not_configured");
  }

  if (LOCAL_FALLBACK_STATUSES.has(response.status)) {
    throw new Error("cloud_not_configured");
  }
  if (!response.ok) {
    const errorBody = await response.text();
    if (isFallbackBody(errorBody)) {
      throw new Error("cloud_not_configured");
    }
    throw new Error(`Login event save failed: ${response.status} ${errorBody}`);
  }
}

export type DashboardSnapshotPayload = {
  user_email: string;
  snapshot_at: string;
  timezone: string;
  ui_theme: string;
  coach_level_selected: string;
  ai_agent_selected: string;
  session_duration_minutes: number;
  scenario_current: string;
  challenge_profile: unknown;
  total_sessions: number;
  average_performance_percent: number;
  overall_average_score: number;
  latest_average_score: number;
  total_red_flags: number;
  total_practice_minutes: number;
  practice_goal_progress: number;
  momentum_delta: number;
  strongest_skill: string;
  strongest_skill_score: number;
  focus_skill: string;
  focus_skill_score: number;
  latest_quality_band: string;
  latest_quality_score: number;
  score_history_points: unknown;
  skill_breakdown: unknown;
  competency_momentum: unknown;
  competency_trajectory: unknown;
  learning_snapshot: unknown;
  latest_feedback: unknown;
  top_recommendations: unknown;
  red_flag_frequency: unknown;
};

export async function saveDashboardSnapshot(
  payload: DashboardSnapshotPayload,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(DASHBOARD_SNAPSHOT_API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("cloud_not_configured");
  }

  if (LOCAL_FALLBACK_STATUSES.has(response.status)) {
    throw new Error("cloud_not_configured");
  }
  if (!response.ok) {
    const errorBody = await response.text();
    if (isFallbackBody(errorBody)) {
      throw new Error("cloud_not_configured");
    }
    throw new Error(`Dashboard snapshot save failed: ${response.status} ${errorBody}`);
  }
}
