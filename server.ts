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

const supabaseTableUrl = (): string =>
  `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/coach_state`;

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
      const response = await fetch(`${supabaseTableUrl()}?${params.toString()}`, {
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
      const response = await fetch(`${supabaseTableUrl()}?on_conflict=user_email`, {
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
