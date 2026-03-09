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
