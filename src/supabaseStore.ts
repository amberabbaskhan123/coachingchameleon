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
const LOCAL_FALLBACK_STATUSES = new Set([404, 405, 503]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asArray = <T>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

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
