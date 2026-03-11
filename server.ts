import express from "express";
import { createServer as createViteServer } from "vite";
import { Request, Response } from "express";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const SUPABASE_URL = (
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  ""
).trim();
const SUPABASE_SECRET_KEY = (
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  ""
).trim();

const hasSupabaseServerConfig = (): boolean =>
  Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY);

const isJwtApiKey = (key: string): boolean => {
  const trimmed = key.trim();
  if (!trimmed) return false;
  // Legacy anon/service_role keys are JWTs. New sb_secret/sb_publishable keys are not.
  return trimmed.split(".").length === 3;
};

const supabaseHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    apikey: SUPABASE_SECRET_KEY,
    "Content-Type": "application/json",
  };

  if (isJwtApiKey(SUPABASE_SECRET_KEY)) {
    headers.Authorization = `Bearer ${SUPABASE_SECRET_KEY}`;
  }

  return headers;
};

const supabaseRestTableUrl = (table: string): string =>
  `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${table}`;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  const PORT = 3000;

  // API routes
  app.post("/api/test_analyse", async (req: Request, res: Response) => {
    const analysis = [
        {
            category: "Establishes & Maintains Agreements",
            metric: "Session Outcome Clarity",
            score: 10,
            comments:
                "At T1 the coach asked what would make the session valuable, and clarified the outcome at T3–T4. The agreement was explicit and mutually confirmed.",
        },
        {
            category: "Establishes & Maintains Agreements",
            metric: "Partnership in Agreement",
            score: 10,
            comments:
                "The coach reflected the client's stated goal (T3) and asked for confirmation rather than imposing direction.",
        },
        {
            category: "Establishes & Maintains Agreements",
            metric: "Maintains Focus on Agreed Outcome",
            score: 5,
            comments:
                "The coach stayed mostly aligned with the session objective (T5–T21), but advice at T23 briefly shifted the focus.",
        },
        {
            category: "Establishes & Maintains Agreements",
            metric: "Re-contracts When Needed",
            score: 5,
            comments:
                "There was a minor alignment check at T18, but no strong recontracting after directive advice at T23.",
        },
        {
            category: "Maintains Presence",
            metric: "Demonstrates Curiosity",
            score: 10,
            comments:
                "Open-ended questions at T5 and T9 demonstrate exploratory curiosity rather than assumption.",
        },
        {
            category: "Maintains Presence",
            metric: "Lets Client Lead",
            score: 5,
            comments:
                "The client generated insight at T10–T12, but the directive instruction at T23 reduced partnership.",
        },
        {
            category: "Maintains Presence",
            metric: "Responsive to Client Emotions",
            score: 10,
            comments:
                "The coach reflected both emotional and somatic cues at T7, demonstrating attunement.",
        },
        {
            category: "Maintains Presence",
            metric: "Flexible to What Emerges",
            score: 10,
            comments:
                "When ego protection surfaced at T10, the coach deepened the exploration at T11 rather than redirecting.",
        },
        {
            category: "Listens Actively",
            metric: "Accurate Paraphrasing",
            score: 10,
            comments:
                "The paraphrase at T7 captured both thought and emotion expressed at T6.",
        },
        {
            category: "Listens Actively",
            metric: "Reflects Emotion",
            score: 10,
            comments:
                "The coach acknowledged fear and bodily reaction at T7 instead of staying purely cognitive.",
        },
        {
            category: "Listens Actively",
            metric: "Observes Patterns",
            score: 5,
            comments:
                "Avoidance linked to ego protection at T11 indicates pattern recognition, but broader patterns were not explored.",
        },
        {
            category: "Listens Actively",
            metric: "Integrates Multiple Client Threads",
            score: 5,
            comments:
                "Integration of belief and emotion occurred, but limited cross-context synthesis was present.",
        },
        {
            category: "Evokes Awareness",
            metric: "Uses Powerful Open Questions",
            score: 10,
            comments:
                "Questions at T5 and T9 expanded thinking and avoided leading.",
        },
        {
            category: "Evokes Awareness",
            metric: "Explores Beliefs and Identity",
            score: 10,
            comments:
                "The coach explored identity-level drivers at T11, moving beyond surface procrastination.",
        },
        {
            category: "Evokes Awareness",
            metric: "Encourages New Perspectives",
            score: 5,
            comments:
                "Inquiry supported reframing, but advice at T23 reduced client-generated perspective shifts.",
        },
        {
            category: "Evokes Awareness",
            metric: "Supports Client-Generated Insight",
            score: 10,
            comments:
                "The client's insight at T10 was acknowledged and deepened at T11.",
        },
        {
            category: "RED_FLAGS",
            metric: "Session Red Flags Summary",
            score: 0,
            comments:
                "• Advice-giving at T23 reduced partnership.\n• Temporary shift from exploratory coaching to directive instruction.\n• Minor focus drift after directive moment.",
        },
    ];

    res.json(analysis);
  });

  app.get("/api/cloud_state", async (req: Request, res: Response) => {
    if (!hasSupabaseServerConfig()) {
      return res.status(503).json({ error: "supabase_not_configured" });
    }

    const userEmail = String(req.query.userEmail ?? "").trim().toLowerCase();
    if (!userEmail) {
      return res.status(400).json({ error: "userEmail is required" });
    }

    try {
      const params = new URLSearchParams({
        select: "sessions,call_logs,updated_at",
        user_email: `eq.${userEmail}`,
        limit: "1",
      });
      const response = await fetch(`${supabaseRestTableUrl("coach_state")}?${params.toString()}`, {
        method: "GET",
        headers: supabaseHeaders(),
      });

      if (!response.ok) {
        const details = await response.text();
        return res.status(response.status).json({ error: details || "supabase_get_failed" });
      }

      const data = await response.json();
      return res.json({ data });
    } catch (error) {
      return res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/cloud_state", async (req: Request, res: Response) => {
    if (!hasSupabaseServerConfig()) {
      return res.status(503).json({ error: "supabase_not_configured" });
    }

    const userEmail = String(req.body?.user_email ?? req.body?.userEmail ?? "")
      .trim()
      .toLowerCase();

    if (!userEmail) {
      return res.status(400).json({ error: "user_email is required" });
    }

    const payload = [
      {
        user_email: userEmail,
        sessions: Array.isArray(req.body?.sessions) ? req.body.sessions : [],
        call_logs: Array.isArray(req.body?.call_logs)
          ? req.body.call_logs
          : Array.isArray(req.body?.callLogs)
            ? req.body.callLogs
            : [],
        updated_at: new Date().toISOString(),
      },
    ];

    try {
      const response = await fetch(`${supabaseRestTableUrl("coach_state")}?on_conflict=user_email`, {
        method: "POST",
        headers: {
          ...supabaseHeaders(),
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const details = await response.text();
        return res.status(response.status).json({ error: details || "supabase_save_failed" });
      }

      return res.json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/login_event", async (req: Request, res: Response) => {
    if (!hasSupabaseServerConfig()) {
      return res.status(503).json({ error: "supabase_not_configured" });
    }

    const userEmail = String(req.body?.user_email ?? "")
      .trim()
      .toLowerCase();
    const loginAt = String(req.body?.login_at ?? "").trim();

    if (!userEmail) {
      return res.status(400).json({ error: "user_email is required" });
    }
    if (!loginAt) {
      return res.status(400).json({ error: "login_at is required" });
    }

    const asLevel = (value: unknown): number => {
      const num = Number(value);
      if (!Number.isFinite(num)) return 1;
      return Math.max(1, Math.min(5, Math.round(num)));
    };

    const sessionDurationMinutes = Number(req.body?.session_duration_minutes ?? 0);
    if (!Number.isFinite(sessionDurationMinutes) || sessionDurationMinutes <= 0) {
      return res.status(400).json({ error: "session_duration_minutes must be > 0" });
    }

    const payload = [
      {
        user_email: userEmail,
        login_at: loginAt,
        coaching_scenario_description: String(req.body?.coaching_scenario_description ?? ""),
        wildcard_scenario_description: String(req.body?.wildcard_scenario_description ?? ""),
        level_selected: String(req.body?.level_selected ?? ""),
        ambiguity_level: asLevel(req.body?.ambiguity_level),
        resistance_level: asLevel(req.body?.resistance_level),
        emotional_volatility_level: asLevel(req.body?.emotional_volatility_level),
        goal_conflict_level: asLevel(req.body?.goal_conflict_level),
        ai_agent_selected: String(req.body?.ai_agent_selected ?? ""),
        ai_model_selected: String(req.body?.ai_model_selected ?? ""),
        session_duration_minutes: Math.round(sessionDurationMinutes),
        timezone: String(req.body?.timezone ?? ""),
      },
    ];

    try {
      const response = await fetch(supabaseRestTableUrl("login_events"), {
        method: "POST",
        headers: {
          ...supabaseHeaders(),
          Prefer: "return=minimal",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const details = await response.text();
        return res.status(response.status).json({ error: details || "supabase_login_event_failed" });
      }

      return res.json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/dashboard_snapshot", async (req: Request, res: Response) => {
    if (!hasSupabaseServerConfig()) {
      return res.status(503).json({ error: "supabase_not_configured" });
    }

    const userEmail = String(req.body?.user_email ?? "")
      .trim()
      .toLowerCase();
    const snapshotAt = String(req.body?.snapshot_at ?? "").trim();

    if (!userEmail) {
      return res.status(400).json({ error: "user_email is required" });
    }
    if (!snapshotAt) {
      return res.status(400).json({ error: "snapshot_at is required" });
    }

    const asNumber = (value: unknown, fallback = 0): number => {
      const num = Number(value);
      if (!Number.isFinite(num)) return fallback;
      return num;
    };
    const asInt = (value: unknown, fallback = 0): number =>
      Math.round(asNumber(value, fallback));
    const clamp = (value: number, min: number, max: number): number =>
      Math.max(min, Math.min(max, value));
    const asPercent = (value: unknown): number =>
      clamp(asInt(value, 0), 0, 100);
    const asJsonArray = (value: unknown): unknown[] =>
      Array.isArray(value) ? value : [];
    const asJsonObject = (value: unknown): Record<string, unknown> =>
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

    const payload = [
      {
        user_email: userEmail,
        snapshot_at: snapshotAt,
        timezone: String(req.body?.timezone ?? "UTC"),
        ui_theme: String(req.body?.ui_theme ?? ""),
        coach_level_selected: String(req.body?.coach_level_selected ?? ""),
        ai_agent_selected: String(req.body?.ai_agent_selected ?? ""),
        session_duration_minutes: Math.max(0, asInt(req.body?.session_duration_minutes, 0)),
        scenario_current: String(req.body?.scenario_current ?? ""),
        challenge_profile: asJsonObject(req.body?.challenge_profile),
        total_sessions: Math.max(0, asInt(req.body?.total_sessions, 0)),
        average_performance_percent: asPercent(req.body?.average_performance_percent),
        overall_average_score: clamp(asNumber(req.body?.overall_average_score, 0), 0, 10),
        latest_average_score: clamp(asNumber(req.body?.latest_average_score, 0), 0, 10),
        total_red_flags: Math.max(0, asInt(req.body?.total_red_flags, 0)),
        total_practice_minutes: Math.max(0, asInt(req.body?.total_practice_minutes, 0)),
        practice_goal_progress: asPercent(req.body?.practice_goal_progress),
        momentum_delta: asNumber(req.body?.momentum_delta, 0),
        strongest_skill: String(req.body?.strongest_skill ?? ""),
        strongest_skill_score: clamp(asNumber(req.body?.strongest_skill_score, 0), 0, 10),
        focus_skill: String(req.body?.focus_skill ?? ""),
        focus_skill_score: clamp(asNumber(req.body?.focus_skill_score, 0), 0, 10),
        latest_quality_band: String(req.body?.latest_quality_band ?? ""),
        latest_quality_score: clamp(asNumber(req.body?.latest_quality_score, 0), 0, 100),
        score_history_points: asJsonArray(req.body?.score_history_points),
        skill_breakdown: asJsonArray(req.body?.skill_breakdown),
        competency_momentum: asJsonArray(req.body?.competency_momentum),
        competency_trajectory: asJsonArray(req.body?.competency_trajectory),
        learning_snapshot: asJsonObject(req.body?.learning_snapshot),
        latest_feedback: asJsonObject(req.body?.latest_feedback),
        top_recommendations: asJsonArray(req.body?.top_recommendations),
        red_flag_frequency: asJsonArray(req.body?.red_flag_frequency),
      },
    ];

    try {
      const response = await fetch(supabaseRestTableUrl("dashboard_snapshots"), {
        method: "POST",
        headers: {
          ...supabaseHeaders(),
          Prefer: "return=minimal",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const details = await response.text();
        return res.status(response.status).json({ error: details || "supabase_dashboard_snapshot_failed" });
      }

      return res.json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: String(error) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
