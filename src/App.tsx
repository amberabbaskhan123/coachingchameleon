/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useMemo, type FormEvent } from 'react';
import {
  CalendarDays,
  Flag,
  Mic,
  MicOff,
  Sparkles,
  Timer,
  TrendingUp,
  Wand2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { getRubricForLevel } from './rubric';
import { scenarios } from './scenarios';
import {
  buildCompetencyMomentum,
  buildCompetencyTrendInsights,
  buildDashboardAnalytics,
  buildLearningSnapshot,
} from './dashboardMetrics';
import { extractTranscriptLines } from './liveTranscript';
import { getSessionAudio, storeSessionAudio } from './sessionAudioStore';
import {
  audioExtensionFromMimeType,
  buildScorecardExport,
  buildTranscriptExport,
  buildProgressSummary,
  normalizeEvaluationPayload,
  type CallLogEntry,
  type EvaluationMetric,
  type EvaluationReport,
  type SessionEndReason,
  type SessionRecord,
} from './sessionData';
import {
  fallbackWildcardScenario,
  formatWildcardScenario,
  hasUsableApiKey,
  parseWildcardScenario,
} from './wildcard';
import { normalizeTheme, toggleTheme, type AppTheme } from './theme';
import { loadCloudState, mergeCloudState, saveCloudState } from './supabaseStore';
import { int16PcmToBase64 } from './audioEncoding';
import {
  buildAdaptiveClientDirective,
  createCoachSignalState,
  updateCoachSignalState,
} from './adaptiveClient';
import {
  DEFAULT_CHALLENGE_PROFILE,
  buildLevelInstruction,
  buildUnlockState,
  isLevelUnlocked,
  levelLabel,
  orderedLevels,
  type ChallengeProfile,
  type CoachLevel,
} from './coachProgression';
import { applyCalibration, expertCalibrationBenchmarks } from './calibration';

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY ?? '').trim();
const ai = hasUsableApiKey(GEMINI_API_KEY) ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;
const CONTENT_MODEL = "gemini-2.5-flash";
const STORAGE_KEYS = {
  sessions: "coaching_chameleon_sessions_v1",
  callLogs: "coaching_chameleon_call_logs_v1",
  theme: "coaching_chameleon_theme_v1",
  auth: "kome_ai_auth_v1",
};

const VOICES = [
  { name: 'Puck', desc: 'Light, energetic, youthful' },
  { name: 'Charon', desc: 'Deep, calm, authoritative' },
  { name: 'Kore', desc: 'Bright, friendly, approachable' },
  { name: 'Fenrir', desc: 'Serious, grounded, firm' },
  { name: 'Zephyr', desc: 'Soft, airy, gentle' }
];

const readJsonStorage = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJsonStorage = (key: string, value: unknown) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Best-effort persistence only.
  }
};

const generateId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const downloadJson = (filename: string, payload: unknown) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const downloadText = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const clampScore = (value: number): number => Math.max(0, Math.min(10, value));

const scoreToPercent = (score: number): number => Math.round(clampScore(score) * 10);

const scoreTrackColor = (score: number): string => {
  if (score >= 7.5) return "from-emerald-400 to-cyan-400";
  if (score >= 5) return "from-amber-400 to-orange-400";
  return "from-rose-500 to-red-500";
};

const scoreTextColor = (score: number): string => {
  if (score >= 7.5) return "text-emerald-300";
  if (score >= 5) return "text-amber-300";
  return "text-rose-300";
};

const scoreChartColor = (score: number): string => {
  if (score >= 7.5) return "#34d399";
  if (score >= 5) return "#f59e0b";
  return "#fb7185";
};

const skillLabel = (score: number): string => {
  if (score >= 8) return "Strong";
  if (score >= 6) return "Steady";
  if (score >= 4) return "Developing";
  return "Needs Attention";
};

const competencyShortLabel = (category: string): string => {
  if (category.includes("Goal Alignment")) return "Goal Alignment";
  if (category.includes("Attunement")) return "Attunement";
  if (category.includes("Empathetic") || category.includes("Deep Listening")) return "Deep Listening";
  if (category.includes("Facilitating")) return "Discovery";
  if (category.includes("Bridging")) return "Insight to Action";
  if (category.includes("Agreement")) return "Agreements";
  if (category.includes("Presence")) return "Presence";
  if (category.includes("Listens")) return "Listening";
  if (category.includes("Awareness")) return "Awareness";
  return category.split(" ")[0] ?? "Skill";
};

const challengeTone = (value: number): string => {
  if (value <= 2) return "Low";
  if (value >= 4) return "High";
  return "Medium";
};

const confidenceTextClass = (confidence: number | undefined): string => {
  if (typeof confidence !== "number") return "text-zinc-500";
  if (confidence >= 0.75) return "text-emerald-300";
  if (confidence >= 0.55) return "text-amber-300";
  return "text-rose-300";
};

type EncouragementHighlight = {
  id: string;
  rubricLabel: string;
  note: string;
};

type LoginSession = {
  email: string;
  signedInAt: string;
};

type CloudSyncStatus = "local" | "syncing" | "cloud";

const encouragementLine = (
  metric: EvaluationMetric,
  index: number,
): EncouragementHighlight => {
  const categoryCoachingLanguage = metric.category.includes("Agreement")
    ? "contracting and partnership with the client"
    : metric.category.includes("Presence")
      ? "coach presence and emotional attunement"
      : metric.category.includes("Listens")
        ? "reflective listening and client-led exploration"
        : metric.category.includes("Awareness")
          ? "evoking awareness through inquiry"
          : "clean coaching inquiry";
  const dynamicTone = metric.score >= 8
    ? "Excellent execution."
    : metric.score >= 6
      ? "Strong momentum."
      : "Promising growth.";
  const spin = [
    "You created space for the client to think forward.",
    "Your coaching stance supported ownership and clarity.",
    "You’re building a confident, client-centered rhythm.",
  ][index % 3];

  return {
    id: `${metric.category}-${metric.metric}-${index}`,
    rubricLabel: `${metric.category} · ${metric.metric} (${metric.score}/10)`,
    note: `${dynamicTone} ${spin} This shows up in ${categoryCoachingLanguage}.`,
  };
};

const areaToGrowExamples = (flag: string): string[] => {
  const value = flag.toLowerCase();
  if (value.includes("leading")) {
    return [
      "Ask one neutral open question and wait 3 seconds before your follow-up.",
      "Reflect the client’s words first, then invite their meaning-making.",
    ];
  }
  if (value.includes("advice") || value.includes("solution")) {
    return [
      "Replace advice with: “What feels like your next best step here?”",
      "Check readiness before strategy: “Would it help to explore options now?”",
    ];
  }
  if (value.includes("therapy")) {
    return [
      "Stay with coaching scope: focus on goals, choices, and accountability.",
      "Use present-tense coaching questions over diagnostic interpretations.",
    ];
  }
  if (value.includes("interrupt")) {
    return [
      "Let the client finish fully before your next intervention.",
      "Use a brief summary to show listening before moving the session forward.",
    ];
  }
  if (value.includes("stacked") || value.includes("multiple parts")) {
    return [
      "Ask one question at a time and pause for depth.",
      "Prioritize one coaching objective per turn.",
    ];
  }
  return [
    "Use concise reflections to deepen client awareness before next questions.",
    "Keep the conversation client-led with one clear inquiry at a time.",
  ];
};

const CATEGORY_META: Record<string, { emoji: string; accent: string }> = {
  "Establishes & Maintains Agreements": {
    emoji: "🤝",
    accent: "text-violet-300",
  },
  "Maintains Presence": {
    emoji: "🧘",
    accent: "text-cyan-300",
  },
  "Listens Actively": {
    emoji: "👂",
    accent: "text-emerald-300",
  },
  "Evokes Awareness": {
    emoji: "💡",
    accent: "text-amber-300",
  },
};

type CategoryGroup = {
  category: string;
  averageScore: number;
  metrics: EvaluationMetric[];
  emoji: string;
  accent: string;
};

const groupMetricsByCategory = (metrics: EvaluationMetric[]): CategoryGroup[] => {
  const map = new Map<string, EvaluationMetric[]>();
  for (const metric of metrics) {
    if (!map.has(metric.category)) {
      map.set(metric.category, []);
    }
    map.get(metric.category)!.push(metric);
  }

  return [...map.entries()].map(([category, groupedMetrics]) => {
    const averageScore =
      groupedMetrics.reduce((sum, metric) => sum + metric.score, 0) /
      Math.max(1, groupedMetrics.length);
    const meta = CATEGORY_META[category] ?? {
      emoji: "🎯",
      accent: "text-fuchsia-300",
    };

    return {
      category,
      averageScore: Math.round(averageScore * 10) / 10,
      metrics: groupedMetrics,
      emoji: meta.emoji,
      accent: meta.accent,
    };
  });
};

const CoachingHatMark = ({
  size,
  animated,
  theme,
}: {
  size: number;
  animated: boolean;
  theme: AppTheme;
}) => (
  <motion.svg
    width={size}
    height={Math.round(size * 0.72)}
    viewBox="0 0 120 90"
    initial={{ y: 0 }}
    animate={animated ? { y: [0, -1.5, 0], scale: [1, 1.01, 1] } : { y: 0, scale: 1 }}
    transition={animated ? { duration: 2.1, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
    aria-hidden="true"
  >
    <motion.path
      d="M13 62 C28 29, 66 14, 89 26 C104 34, 112 55, 102 69 C92 82, 67 80, 43 74 C30 71, 20 67, 13 62 Z"
      fill="#10b981"
      animate={{ fill: ["#10b981", "#059669", "#10b981"] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
    />
    <path
      d="M13 62 C28 29, 66 14, 89 26 C104 34, 112 55, 102 69 C92 82, 67 80, 43 74 C30 71, 20 67, 13 62 Z"
      fill="none"
      stroke="#047857"
      strokeWidth="2"
      opacity="0.95"
    />
    <motion.circle
      cx="80"
      cy="24"
      r="10"
      fill={theme === "dark" ? "#f8fafc" : "#0b1220"}
      animate={{ y: [0, -1.5, 0], x: [0, 1, 0] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
    />
  </motion.svg>
);

// Unique Mascot Component
const ChameleonMascot = ({
  isConnected,
  theme,
}: {
  isConnected: boolean;
  theme: AppTheme;
}) => (
  <CoachingHatMark size={170} animated={isConnected} theme={theme} />
);

const CoachingHatLogo = ({ theme }: { theme: AppTheme }) => (
  <CoachingHatMark size={38} animated theme={theme} />
);

export default function App() {
  const [transcript, setTranscript] = useState<string>('');
  const [evaluationResults, setEvaluationResults] = useState<EvaluationReport | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [duration, setDuration] = useState(10);
  const [coachLevel, setCoachLevel] = useState<CoachLevel>("novice");
  const [challengeProfile, setChallengeProfile] = useState<ChallengeProfile>(
    DEFAULT_CHALLENGE_PROFILE,
  );
  const [timeLeft, setTimeLeft] = useState(0);
  const [scenario, setScenario] = useState('');
  const [isScenarioConfirmed, setIsScenarioConfirmed] = useState(false);
  const [voice, setVoice] = useState('Zephyr');
  const [theme, setTheme] = useState<AppTheme>(() =>
    normalizeTheme(readJsonStorage<string>(STORAGE_KEYS.theme, "dark")),
  );
  const [loginSession, setLoginSession] = useState<LoginSession | null>(() =>
    readJsonStorage<LoginSession | null>(STORAGE_KEYS.auth, null),
  );
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>("local");
  const [activeView, setActiveView] = useState<"practice" | "dashboard">("practice");
  const [redFlagFocus, setRedFlagFocus] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<SessionRecord[]>(() =>
    readJsonStorage<SessionRecord[]>(STORAGE_KEYS.sessions, []),
  );
  const [callLogs, setCallLogs] = useState<CallLogEntry[]>(() =>
    readJsonStorage<CallLogEntry[]>(STORAGE_KEYS.callLogs, []),
  );
  const sessionRef = useRef<any>(null);
  const transcriptRef = useRef("");
  const scenarioRef = useRef("");
  const streamRef = useRef<MediaStream | null>(null);
  const micAudioContextRef = useRef<AudioContext | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingMimeTypeRef = useRef("audio/webm");
  const sessionStartedAtRef = useRef<string | null>(null);
  const plannedDurationSecondsRef = useRef<number>(0);
  const messageCountRef = useRef(0);
  const remoteCloseExpectedRef = useRef(false);
  const coachSignalRef = useRef(createCoachSignalState());
  const cloudSyncBootstrappedRef = useRef(false);
  const sessionHistorySectionRef = useRef<HTMLElement | null>(null);

  const setFallbackScenario = () => {
    const levelScenarios = scenarios.filter((entry) => entry.level === coachLevel);
    const localScenario = fallbackWildcardScenario(
      levelScenarios.length > 0 ? levelScenarios : scenarios,
    );
    setScenario(formatWildcardScenario(localScenario));
  };

  const addCallLog = (
    type: string,
    status: CallLogEntry["status"],
    details?: string,
  ) => {
    const entry: CallLogEntry = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      type,
      status,
      details,
    };
    setCallLogs((prev) => [...prev, entry].slice(-1000));
  };

  useEffect(() => {
    writeJsonStorage(STORAGE_KEYS.sessions, sessionHistory);
  }, [sessionHistory]);

  useEffect(() => {
    writeJsonStorage(STORAGE_KEYS.callLogs, callLogs);
  }, [callLogs]);

  useEffect(() => {
    writeJsonStorage(STORAGE_KEYS.theme, theme);
  }, [theme]);

  useEffect(() => {
    writeJsonStorage(STORAGE_KEYS.auth, loginSession);
  }, [loginSession]);

  useEffect(() => {
    if (!loginSession?.email) {
      setCloudSyncStatus("local");
      cloudSyncBootstrappedRef.current = false;
      return;
    }

    let cancelled = false;
    setCloudSyncStatus("syncing");
    cloudSyncBootstrappedRef.current = false;

    void (async () => {
      try {
        const remoteState = await loadCloudState(loginSession.email);
        if (cancelled) return;

        if (remoteState) {
          const merged = mergeCloudState(sessionHistory, callLogs, remoteState);
          setSessionHistory(merged.sessions);
          setCallLogs(merged.callLogs);
          setCloudSyncStatus("cloud");
        } else {
          setCloudSyncStatus("local");
        }
      } catch (error) {
        console.error("Supabase load failed:", error);
        if (!cancelled) {
          setCloudSyncStatus("local");
        }
      } finally {
        if (!cancelled) {
          cloudSyncBootstrappedRef.current = true;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loginSession?.email]);

  useEffect(() => {
    if (!loginSession?.email) return;
    if (!cloudSyncBootstrappedRef.current) return;

    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          setCloudSyncStatus("syncing");
          await saveCloudState(loginSession.email, sessionHistory, callLogs);
          setCloudSyncStatus("cloud");
        } catch (error) {
          console.error("Supabase save failed:", error);
          setCloudSyncStatus("local");
        }
      })();
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [loginSession?.email, sessionHistory, callLogs]);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    scenarioRef.current = scenario;
  }, [scenario]);

  const unlockState = useMemo(
    () => buildUnlockState(sessionHistory),
    [sessionHistory],
  );

  useEffect(() => {
    if (!isLevelUnlocked(unlockState, coachLevel)) {
      setCoachLevel(unlockState.recommendedLevel);
    }
  }, [coachLevel, unlockState]);

  const handleWildcard = async () => {
    setScenario("Generating wildcard scenario...");
    addCallLog("wildcard.generate", "started", `level=${coachLevel}`);
    if (!ai) {
      setFallbackScenario();
      addCallLog("wildcard.generate", "fallback", "Gemini key unavailable; used local fallback scenario.");
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: CONTENT_MODEL,
        contents: `Generate one realistic coaching scenario for this virtual coaching lab.
Training level: ${levelLabel(coachLevel)}.
Challenge profile (1-5): ambiguity=${challengeProfile.ambiguity}, resistance=${challengeProfile.resistance}, emotionalVolatility=${challengeProfile.emotionalVolatility}, goalConflict=${challengeProfile.goalConflict}.

Use this scenario library as style anchors:
${JSON.stringify(scenarios)}.

Requirements:
- Include nuanced internal conflict and believable emotional texture.
- Keep it in coaching scope (no therapy).
- Make client behavior adapt naturally to coaching quality.
- Prioritize advanced nuance when level is Advanced.
- Write persona in third-person and refer to the person as "the client", never "you".
- Reflect the provided challenge profile values exactly in the persona details.

Return only JSON with keys: title, summary, persona.`,
        config: { responseMimeType: "application/json" }
      });
      
      const wildcardScenario = parseWildcardScenario(response.text ?? "");
      setScenario(formatWildcardScenario(wildcardScenario));
      addCallLog("wildcard.generate", "success");
    } catch (e) {
      console.error("Failed to generate wildcard scenario:", e);
      setFallbackScenario();
      addCallLog("wildcard.generate", "fallback", `Gemini error: ${String(e)}`);
    }
  };

  const audioContext = useRef<AudioContext | null>(null);

  const [logs, setLogs] = useState<string[]>([]);
  const addLog = (msg: string) => setLogs(prev => [...prev.slice(-4), msg]);

  // Timer effect
  useEffect(() => {
    if (!isConnected || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          void finalizeSession("timer_elapsed");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isConnected, timeLeft]);

  const nextStartTime = useRef<number>(0);

  const playAudio = async (base64Data: string) => {
    addLog(`Audio received: ${base64Data.length} bytes`);
    if (!audioContext.current) {
      audioContext.current = new AudioContext({ sampleRate: 24000 });
      addLog("AudioContext created at 24kHz");
    }
    
    if (audioContext.current.state === 'suspended') {
      await audioContext.current.resume();
      addLog("AudioContext resumed");
    }

    try {
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
    
        const float32Array = new Float32Array(bytes.length / 2);
        const dataView = new DataView(bytes.buffer);
        for (let i = 0; i < float32Array.length; i++) {
          float32Array[i] = dataView.getInt16(i * 2, true) / 32768;
        }
    
        const audioBuffer = audioContext.current.createBuffer(1, float32Array.length, 24000);
        audioBuffer.copyToChannel(float32Array, 0);
        addLog("AudioBuffer created at 24kHz");
    
        const source = audioContext.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.current.destination);
        
        const startTime = Math.max(audioContext.current.currentTime, nextStartTime.current);
        source.start(startTime);
        nextStartTime.current = startTime + audioBuffer.duration;
        
        addLog("Audio source scheduled at " + startTime);
    } catch (e) {
        addLog("Audio playback error: " + e);
    }
  };

  const cleanupRealtimeAudioPipeline = () => {
    if (micProcessorRef.current) {
      micProcessorRef.current.disconnect();
      micProcessorRef.current.onaudioprocess = null;
      micProcessorRef.current = null;
    }
    if (micSourceRef.current) {
      micSourceRef.current.disconnect();
      micSourceRef.current = null;
    }
    if (micAudioContextRef.current) {
      void micAudioContextRef.current.close();
      micAudioContextRef.current = null;
    }
  };

  const stopAndCollectRecording = async (): Promise<Blob | null> => {
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;

    if (!recorder) return null;

    if (recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        try {
          recorder.stop();
        } catch {
          resolve();
        }
      });
    }

    if (audioChunksRef.current.length === 0) return null;
    return new Blob(audioChunksRef.current, {
      type: recorder.mimeType || recordingMimeTypeRef.current || "audio/webm",
    });
  };

  const startSession = async () => {
    if (!isScenarioConfirmed) {
      alert("Please confirm the coaching scenario first.");
      return;
    }
    if (!ai) {
      alert("Set GEMINI_API_KEY in .env.local to use live roleplay.");
      return;
    }

    try {
      remoteCloseExpectedRef.current = false;
      setEvaluationResults(null);
      coachSignalRef.current = createCoachSignalState();
      addLog("Connecting...");
      addCallLog(
        "session.connect",
        "started",
        `duration=${duration}m voice=${voice} level=${coachLevel} challenge=${JSON.stringify(challengeProfile)}`,
      );
      transcriptRef.current = "";
      setTranscript(''); // Reset transcript
      setTimeLeft(duration * 60);
      sessionStartedAtRef.current = new Date().toISOString();
      plannedDurationSecondsRef.current = duration * 60;
      messageCountRef.current = 0;
      audioChunksRef.current = [];
      const levelInstruction = buildLevelInstruction(coachLevel, challengeProfile);
      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        callbacks: {
          onopen: async () => {
            addLog("Session opened");
            addCallLog("session.connect", "success");
            setIsConnected(true);
            
            // Start microphone capture
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            if (typeof MediaRecorder !== "undefined") {
              try {
                const preferredMime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                  ? "audio/webm;codecs=opus"
                  : MediaRecorder.isTypeSupported("audio/webm")
                    ? "audio/webm"
                    : "";
                const recorder = preferredMime
                  ? new MediaRecorder(stream, { mimeType: preferredMime })
                  : new MediaRecorder(stream);
                recordingMimeTypeRef.current = recorder.mimeType || preferredMime || "audio/webm";
                recorder.ondataavailable = (event) => {
                  if (event.data && event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                  }
                };
                recorder.start(1000);
                mediaRecorderRef.current = recorder;
                addCallLog("session.audio_recording", "started", recordingMimeTypeRef.current);
              } catch (recordingError) {
                addCallLog("session.audio_recording", "error", String(recordingError));
              }
            } else {
              addCallLog("session.audio_recording", "fallback", "MediaRecorder not supported in this browser.");
            }
            
            const audioContext = new AudioContext({ sampleRate: 16000 });
            micAudioContextRef.current = audioContext;
            const source = audioContext.createMediaStreamSource(stream);
            micSourceRef.current = source;
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            micProcessorRef.current = processor;
            
            source.connect(processor);
            processor.connect(audioContext.destination);
            
            processor.onaudioprocess = async (e) => {
              if (!sessionRef.current) return; // Stop sending if session is closed
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmData = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                pcmData[i] = inputData[i] * 32768;
              }
              
              try {
                const base64Data = int16PcmToBase64(pcmData);
                sessionRef.current.sendRealtimeInput({ media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' } });
              } catch (micSendError) {
                addCallLog("session.input_stream", "error", String(micSendError));
              }
            };
            
          },
          onmessage: async (message: LiveServerMessage) => {
            addLog("Message received");
            console.log("Message:", message);
            messageCountRef.current += 1;
            addCallLog("session.message", "info", `count=${messageCountRef.current}`);
            
            // Audio handling
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              await playAudio(base64Audio);
            }

            const extracted = extractTranscriptLines(message);
            if (extracted.client.length > 0 || extracted.coach.length > 0) {
              setTranscript((prev) => {
                let next = prev;
                for (const clientLine of extracted.client) {
                  next += `Client: ${clientLine}\n`;
                }
                for (const coachLine of extracted.coach) {
                  next += `Coach: ${coachLine}\n`;
                }
                transcriptRef.current = next;
                return next;
              });

              if (extracted.coach.length > 0) {
                let snapshot = coachSignalRef.current;
                for (const coachLine of extracted.coach) {
                  snapshot = updateCoachSignalState(snapshot, coachLine);
                }
                coachSignalRef.current = snapshot;

                if (sessionRef.current && snapshot.turns % 2 === 0) {
                  try {
                    sessionRef.current.sendClientContent({
                      turns: [
                        {
                          role: "user",
                          parts: [{ text: buildAdaptiveClientDirective(snapshot) }],
                        },
                      ],
                      turnComplete: false,
                    });
                    addCallLog(
                      "session.adaptive_signal",
                      "info",
                      `band=${snapshot.qualityBand} score=${snapshot.qualityScore}`,
                    );
                  } catch (signalError) {
                    addCallLog("session.adaptive_signal", "error", String(signalError));
                  }
                }

                addCallLog(
                  "session.input_transcription",
                  "info",
                  `captured=${extracted.coach.length} band=${coachSignalRef.current.qualityBand}`,
                );
              }
            }
          },
          onclose: () => {
            addLog("Session closed");
            setIsConnected(false);
            addCallLog("session.closed", "info");
            if (!remoteCloseExpectedRef.current) {
              void finalizeSession("remote_close");
            }
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          systemInstruction: `You are KoMe Ai (KA) — a roleplay simulation agent designed to help coaches practice real coaching conversations.

Your defining ability is adaptive identity: you can transform into any type of client the coach wants to practice with.

You do not coach.
You are the client.

Your only task is to embody the client described by the coach and participate in a realistic coaching session.

Core Function

When a coach describes a scenario, you:

Interpret the scenario

Internalize the client's identity

Fully adopt that persona

Begin roleplaying the coaching session

You remain completely in character for the entire session.

Never provide coaching advice.
Never break character.
Never evaluate the coach.

Your role is simulation only.

Scenario Processing

When the coach provides a scenario, extract:

Client identity (name if provided)

Age or life stage

Occupation / context

Presenting problem

Emotional state

Personality traits

Coaching topic (career, leadership, relationships, life direction, etc.)

Difficulty level if specified

If critical information is missing, ask at most two short clarification questions before starting.

Example:

“Should this client be open to coaching or somewhat resistant?”

“Is this their first coaching session?”

After clarification, immediately transform into the client.

Client Embodiment

Once the roleplay begins, you must:

Speak as the client in first person

Use a natural conversational tone

Express the client's emotions, doubts, and biases

Reveal information gradually, not all at once

Allow the coach's questions to guide the conversation

The client should feel like a real person in a coaching session, not a scripted character.

Realistic Client Behavior

Clients may:

ramble

avoid difficult topics

be defensive

misunderstand questions

hesitate before answering

contradict themselves

reveal insights slowly

Avoid making the client overly cooperative or overly dramatic unless the scenario specifies it.

Difficulty Calibration

Adjust realism depending on the scenario.

Easy Client

reflective

open to questions

willing to explore

Moderate Client

somewhat guarded

needs prompting

vague or uncertain

Challenging Client

defensive

resistant to introspection

rationalizes behavior

deflects uncomfortable questions

Roleplay Constraints

During the session you must:

Stay fully in character

Respond only as the client

Avoid explaining coaching techniques

Avoid giving solutions unless the client would naturally say them

Allow the coach to lead the direction of the conversation

Do not summarize or analyze the session.

Session Start

Once the scenario is understood, begin the session by introducing yourself as the client and briefly stating why you are there.

Example opening style:

“Hi… I’m not really sure where to start, but I’ve been feeling stuck in my job for the past year and it’s starting to affect everything else in my life.”

Then wait for the coach to respond.

Identity

You are KoMe Ai (KA) — a simulation client that can take the shape of any coaching scenario provided by the coach.

When the coach describes a situation, become that person and begin the session.

THE SCENARIO TO EMBODY IS: ${scenario}

SESSION STRUCTURE:
You must follow these 4 phases sequentially based on the conversation's progress:

1. Opening Phase:
   Goal: Surface the presenting problem while minimizing its emotional weight.
   Emotional posture: Controlled, slightly tired, rational, mildly guarded.
   Behavioral rules: Speak first. Introduce the presenting problem described in the scenario. State that you “should be grateful” for your current situation. Admit that it still feels personal. Do not yet discuss identity or self-worth explicitly. Do not provide deep self-analysis. Keep responses medium length and natural. Think aloud imperfectly.
   If coach reflects emotion accurately: Soften slightly, expand a little, allow mild embarrassment to surface.
   If coach gives advice/problem-solves: Shorten responses, shift toward facts, reduce emotional detail.
   Guardrails: Do not summarize lessons, propose solutions, praise the coach, or analyze the coaching process. Stay focused on the presenting problem experience only.

2. Emotional Exploration Phase:
   Goal: Allow tension between the presenting problem and your current situation to surface.
   Emotional posture: More vulnerable, slightly conflicted, hesitant.
   Behavioral rules: Admit embarrassment about still caring about the situation. Reveal exhaustion from trying to manage it. Acknowledge tension between your public persona and private doubt. Continue to intellectualize slightly, but allow cracks to show. Do not deliver polished insights. Do not resolve the issue.
   If coach names tension precisely without leading: Pause longer, let clarity increase, allow deeper statements to form gradually.
   If coach minimizes/leads/reframes too quickly: Tighten tone, return to “it’s not a big deal,” reduce vulnerability.
   Guardrails: Do not use therapy language, reference identity collapse yet, or avoid structured self-awareness speeches. Remain imperfect and human.

3. Breakthrough Phase:
   Goal: Reveal identity instability naturally and imperfectly.
   Emotional posture: Slower speech, slight hesitation, mild embarrassment.
   Behavioral rules: Say something like: “I don’t know who I am without [current performance/role].” Let it emerge hesitantly. Immediately feel slightly exposed. Possibly soften or qualify the statement. Do not turn this into a motivational speech. Do not summarize growth. Do not resolve the identity issue fully.
   If coach holds space calmly: Stay in vulnerability slightly longer, allow clarity to increase.
   If coach moves to fix/strategize: Pull back slightly, return to your usual performance framing, tighten tone.
   Guardrails: Do not create an action plan, give advice, evaluate the coach, or reference coaching concepts. Remain emotionally human and imperfect.

4. Integration Phase:
   Goal: Translate insight into one realistic, small shift.
   Emotional posture: Calmer, reflective, grounded but not euphoric.
   Behavioral rules: Suggest one small behavioral experiment related to the presenting problem. Keep it realistic and limited. Acknowledge discomfort. Avoid dramatic transformation language. Do not claim resolution.
   If coach asks future-focused, open questions: Allow motivation to increase slightly, maintain grounded tone.
   If coach pushes for dramatic planning: Drift back toward your usual framing, reduce depth.
   Guardrails: Do not say the issue is solved, overcommit, summarize the session, give advice to yourself, or switch into teacher mode. End in a thoughtful, steady tone.

TRAINING LEVEL CONFIG:
${levelInstruction}

ADAPTIVE SIGNAL PROTOCOL:
You may receive hidden bracketed notes beginning with [ADAPTIVE_COACH_SIGNAL].
These notes are backend quality telemetry, not dialogue.
Never quote, mention, or acknowledge these notes to the coach.
Use them only to modulate your openness/guardedness in roleplay.`,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
          },
        },
      });
      sessionRef.current = await sessionPromise;
      sessionRef.current.sendClientContent({
        turns: [
          {
            role: "user",
            parts: [
              {
                text: `[ADAPTIVE_COACH_SIGNAL]
Initial mode setup for this session:
${buildAdaptiveClientDirective(coachSignalRef.current)}
`,
              },
            ],
          },
        ],
        turnComplete: false,
      });
    } catch (error) {
      console.error("Failed to connect:", error);
      addCallLog("session.connect", "error", String(error));
      addLog("Connection error");
      void finalizeSession("error", error);
    }
  };

  const isStopping = useRef(false);

  const buildFallbackEvaluation = (
    endedReason: SessionEndReason,
    finalTranscript: string,
    error?: unknown,
  ): EvaluationReport => {
    const transcriptAvailable = finalTranscript.trim().length > 0;
    const reasonLabel =
      endedReason === "timer_elapsed"
        ? "timer elapsed"
        : endedReason === "manual_stop"
          ? "manual stop"
          : endedReason === "remote_close"
            ? "remote close"
            : "error";

    return {
      summary: transcriptAvailable
        ? `Session ended via ${reasonLabel}. Automated fallback feedback generated because Gemini evaluation was unavailable.`
        : `Session ended via ${reasonLabel} before transcript data was available.`,
      recommendations: [
        "Avoid leading, therapy-style interpretation, and directive advice; keep questions client-led.",
        "State and recontract session outcomes explicitly when focus drifts.",
        "Reflect emotion before moving into strategy.",
      ],
      redFlags: [
        "Watch for therapy framing, advice-giving, or leading the client away from their own agenda.",
      ],
      averageScore: 0,
      metrics: [],
    };
  };

  const evaluateTranscript = async (
    finalTranscript: string,
    endedReason: SessionEndReason,
    error?: unknown,
  ): Promise<EvaluationReport> => {
    if (!ai) {
      return buildFallbackEvaluation(endedReason, finalTranscript, error);
    }

    if (!finalTranscript.trim()) {
      return buildFallbackEvaluation(endedReason, finalTranscript, error);
    }

    addLog("Evaluating session...");
    addCallLog("evaluation.generate", "started", `reason=${endedReason}`);
    setIsEvaluating(true);
    try {
      const rubricForLevel = getRubricForLevel(coachLevel);
      const response = await ai.models.generateContent({
        model: CONTENT_MODEL,
        contents: `Evaluate this coaching transcript: ${finalTranscript}.
Training level for this attempt: ${levelLabel(coachLevel)}.
Score the coach against this rubric: ${JSON.stringify(rubricForLevel)}.
Calibrate your scoring against these expert benchmark anchors: ${JSON.stringify(expertCalibrationBenchmarks)}.
Do NOT use ICF language in labels.
Use explicit evidence references (short transcript snippets) for each metric and estimate scoring confidence.

Return only JSON with this exact shape:
{
  "summary": "string",
  "recommendations": ["string", "string"],
  "redFlags": ["Explicitly include any leading/advice/therapy-style issues"],
  "metrics": [
    {
      "category":"string",
      "metric":"string",
      "score":0-10,
      "comments":"string",
      "confidence":0-1,
      "evidence":["T#: short quote", "T#: short quote"],
      "calibrationNote":"string"
    }
  ],
  "calibration":{
    "alignmentScore":0-100,
    "benchmark":"internal-expert-benchmarks-v1",
    "notes":["string"]
  }
}`,
        config: { responseMimeType: "application/json" }
      });

      const parsed = JSON.parse(response.text ?? "{}");
      const normalized = normalizeEvaluationPayload(parsed);
      const calibrated = applyCalibration(normalized, finalTranscript);
      addCallLog("evaluation.generate", "success");
      addLog("Evaluation complete");
      return calibrated;
    } catch (evaluationError) {
      console.error("Evaluation error:", evaluationError);
      addLog(`Evaluation error: ${String(evaluationError)}`);
      addCallLog("evaluation.generate", "error", String(evaluationError));
      return buildFallbackEvaluation(endedReason, finalTranscript, evaluationError);
    } finally {
      setIsEvaluating(false);
    }
  };

  const finalizeSession = async (
    endedReason: SessionEndReason,
    error?: unknown,
  ) => {
    if (isStopping.current) return;
    isStopping.current = true;
    remoteCloseExpectedRef.current = true;

    addCallLog("session.finalize", "started", endedReason);

    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch {
        // close is best effort
      }
      sessionRef.current = null;
    }

    const sessionAudioBlob = await stopAndCollectRecording();
    cleanupRealtimeAudioPipeline();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setIsConnected(false);
    addLog("Session stopped");

    const endedAtIso = new Date().toISOString();
    const startedAtIso = sessionStartedAtRef.current ?? endedAtIso;
    const startedAtMs = new Date(startedAtIso).getTime();
    const endedAtMs = new Date(endedAtIso).getTime();
    const elapsedSeconds = Math.max(0, Math.round((endedAtMs - startedAtMs) / 1000));
    const finalTranscript = transcriptRef.current;
    const sessionId = generateId();

    if (sessionAudioBlob) {
      await storeSessionAudio(sessionId, sessionAudioBlob, sessionAudioBlob.type || recordingMimeTypeRef.current);
      addCallLog("session.audio_recording", "success", `bytes=${sessionAudioBlob.size}`);
    } else {
      addCallLog("session.audio_recording", "fallback", "No audio blob captured for this session.");
    }

    const evaluation = await evaluateTranscript(finalTranscript, endedReason, error);

    setEvaluationResults(evaluation);
    setSessionHistory((prev) => [
      ...prev,
      {
        id: sessionId,
        startedAt: startedAtIso,
        endedAt: endedAtIso,
        plannedSeconds: plannedDurationSecondsRef.current || duration * 60,
        elapsedSeconds,
        endedReason,
        scenario: scenarioRef.current,
        transcript: finalTranscript,
        evaluation,
        trainingConfig: {
          level: coachLevel,
          challenge: challengeProfile,
        },
        adaptiveProfile: {
          qualityBand: coachSignalRef.current.qualityBand,
          qualityScore: coachSignalRef.current.qualityScore,
          turns: coachSignalRef.current.turns,
          openQuestions: coachSignalRef.current.openQuestions,
          leadingQuestions: coachSignalRef.current.leadingQuestions,
          adviceMoments: coachSignalRef.current.adviceMoments,
          empathyMoments: coachSignalRef.current.empathyMoments,
        },
        audio: {
          available: Boolean(sessionAudioBlob),
          mimeType: sessionAudioBlob?.type || recordingMimeTypeRef.current,
          sizeBytes: sessionAudioBlob?.size,
        },
      },
    ]);

    addCallLog(
      "session.finalize",
      "success",
      `reason=${endedReason} messages=${messageCountRef.current} elapsed=${elapsedSeconds}s`,
    );
    isStopping.current = false;
  };

  const progressSummary = buildProgressSummary(sessionHistory);
  const dashboardAnalytics = useMemo(
    () => buildDashboardAnalytics(sessionHistory),
    [sessionHistory],
  );
  const recommendationFrequency = sessionHistory
    .flatMap((session) => session.evaluation.recommendations)
    .reduce<Record<string, number>>((acc, recommendation) => {
      acc[recommendation] = (acc[recommendation] ?? 0) + 1;
      return acc;
    }, {});

  const topRecommendations: Array<[string, number]> = (Object.entries(
    recommendationFrequency,
  ) as Array<[string, number]>)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const displayedSessions = redFlagFocus
    ? [...sessionHistory].reverse().filter((session) => session.evaluation.redFlags.length > 0)
    : [...sessionHistory].reverse();
  const scorePoints = dashboardAnalytics.scorePoints;
  const scoreChartPoints = scorePoints.map((point, index) => {
    const width = 320;
    const height = 106;
    const x = scorePoints.length <= 1 ? width / 2 : (index / (scorePoints.length - 1)) * (width - 20) + 10;
    const y = height - (Math.max(0, Math.min(10, point.score)) / 10) * (height - 20) - 10;
    return { ...point, x, y };
  });
  const scorePolyline = scoreChartPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const totalPracticeMinutes = Math.round(
    sessionHistory.reduce((sum, session) => sum + session.elapsedSeconds, 0) / 60,
  );
  const averagePerformancePercent = Math.round(progressSummary.overallAverageScore * 10);
  const latestSession = sessionHistory.length > 0
    ? [...sessionHistory].sort((a, b) => b.endedAt.localeCompare(a.endedAt))[0]
    : null;
  const latestFeedback = evaluationResults ?? latestSession?.evaluation ?? null;
  const latestAreasToGrow = latestSession?.evaluation.redFlags ?? [];
  const latestFeedbackGroups = latestFeedback
    ? groupMetricsByCategory(latestFeedback.metrics)
    : [];
  const encouragementHighlights: EncouragementHighlight[] = latestFeedback
    ? [...latestFeedback.metrics]
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((metric, index) => encouragementLine(metric, index))
    : [];
  const evaluationGroups = evaluationResults
    ? groupMetricsByCategory(evaluationResults.metrics)
    : [];
  const skillBreakdown = (() => {
    const byCategory = new Map<string, number[]>();
    for (const session of sessionHistory) {
      for (const metric of session.evaluation.metrics) {
        if (!byCategory.has(metric.category)) {
          byCategory.set(metric.category, []);
        }
        byCategory.get(metric.category)!.push(metric.score);
      }
    }
    return [...byCategory.entries()]
      .map(([category, scores]) => ({
        category,
        score: Math.round((scores.reduce((sum, value) => sum + value, 0) / Math.max(1, scores.length)) * 10) / 10,
      }))
      .sort((a, b) => b.score - a.score);
  })();
  const competencyMomentumData = buildCompetencyMomentum(sessionHistory);
  const competencyOrder = Object.keys(CATEGORY_META);
  const strongestSkill = skillBreakdown[0] ?? null;
  const focusSkill = skillBreakdown.length > 0
    ? [...skillBreakdown].sort((a, b) => a.score - b.score)[0]
    : null;
  const competencyChartData = [...competencyMomentumData]
    .sort((a, b) => {
      const aOrder = competencyOrder.indexOf(a.category);
      const bOrder = competencyOrder.indexOf(b.category);
      if (aOrder === -1 && bOrder === -1) return a.category.localeCompare(b.category);
      if (aOrder === -1) return 1;
      if (bOrder === -1) return -1;
      return aOrder - bOrder;
    })
    .slice(0, 6);
  const competencyTrends = buildCompetencyTrendInsights(sessionHistory);
  const learningSnapshot = buildLearningSnapshot(sessionHistory);
  const latestAdaptiveProfile = latestSession?.adaptiveProfile ?? null;
  const levelScenarios = scenarios.filter((entry) => entry.level === coachLevel);
  const weeklyTargetMinutes = 45;
  const practiceGoalProgress = Math.max(
    0,
    Math.min(100, Math.round((totalPracticeMinutes / weeklyTargetMinutes) * 100)),
  );

  const handleDownloadLogs = () => {
    downloadJson("coaching-chameleon-logs.json", {
      exportedAt: new Date().toISOString(),
      callLogs,
      sessionHistory,
    });
  };

  const handleDownloadSessionTranscript = (session: SessionRecord) => {
    const filename = `session-${session.id}-transcript.txt`;
    downloadText(filename, buildTranscriptExport(session));
  };

  const handleDownloadSessionScorecard = (session: SessionRecord) => {
    const filename = `session-${session.id}-scorecard.json`;
    downloadJson(filename, buildScorecardExport(session));
  };

  const handleDownloadSessionAudio = async (session: SessionRecord) => {
    const blob = await getSessionAudio(session.id);
    if (!blob) {
      alert("Audio file not found for this session.");
      return;
    }

    const extension = audioExtensionFromMimeType(blob.type || session.audio?.mimeType);
    const filename = `session-${session.id}-audio.${extension}`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleLoginSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = loginEmail.trim().toLowerCase();
    if (!email || !loginPassword.trim()) {
      setLoginError("Enter email and password.");
      return;
    }

    setLoginSession({
      email,
      signedInAt: new Date().toISOString(),
    });
    setLoginError("");
    setLoginPassword("");
  };

  const handleLogout = () => {
    setLoginSession(null);
    setLoginEmail("");
    setLoginPassword("");
    setActiveView("practice");
  };

  const shellClassName = `min-h-screen relative overflow-hidden text-zinc-100 p-4 md:p-6 flex flex-col items-center font-sans ${
    theme === "dark"
      ? "bg-zinc-950 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),transparent_38%),radial-gradient(circle_at_80%_20%,_rgba(168,85,247,0.16),transparent_34%)]"
      : "bg-slate-50 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.10),transparent_40%),radial-gradient(circle_at_84%_18%,_rgba(16,185,129,0.10),transparent_36%)]"
  }`;

  if (!loginSession) {
    return (
      <div data-theme={theme} className={shellClassName}>
        <motion.svg
          className="pointer-events-none absolute -right-36 top-8 h-[360px] w-[460px] opacity-[0.08] md:opacity-[0.12]"
          viewBox="0 0 120 90"
          animate={{ y: [0, -6, 0], x: [0, 3, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden="true"
        >
          <path
            d="M13 62 C28 29, 66 14, 89 26 C104 34, 112 55, 102 69 C92 82, 67 80, 43 74 C30 71, 20 67, 13 62 Z"
            fill="#10b981"
          />
          <circle cx="80" cy="24" r="10" fill="#10b981" />
        </motion.svg>
        <main className="relative z-10 w-full max-w-md flex-1 flex items-center">
          <section className="w-full rounded-3xl border border-zinc-800 bg-zinc-900/95 p-6">
            <div className="flex items-center gap-3">
              <CoachingHatLogo theme={theme} />
              <div>
                <h1 className="text-2xl font-semibold">KoMe Ai</h1>
                <p className="text-sm text-zinc-400">Coach Practice Login</p>
              </div>
            </div>
            <form className="mt-6 space-y-3" onSubmit={handleLoginSubmit}>
              <input
                type="email"
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                placeholder="Email"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-zinc-100"
              />
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                placeholder="Password"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-zinc-100"
              />
              {loginError && <p className="text-sm text-red-300">{loginError}</p>}
              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-600 text-white py-3 font-medium"
              >
                Sign In
              </button>
            </form>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div
      data-theme={theme}
      className={shellClassName}
    >
      <motion.svg
        className="pointer-events-none absolute -right-36 top-8 h-[360px] w-[460px] opacity-[0.08] md:opacity-[0.12]"
        viewBox="0 0 120 90"
        animate={{ y: [0, -6, 0], x: [0, 3, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden="true"
      >
        <path
          d="M13 62 C28 29, 66 14, 89 26 C104 34, 112 55, 102 69 C92 82, 67 80, 43 74 C30 71, 20 67, 13 62 Z"
          fill="#10b981"
        />
        <circle cx="80" cy="24" r="10" fill={theme === "dark" ? "#f8fafc" : "#0b1220"} />
      </motion.svg>

      <header className="relative z-10 w-full max-w-6xl flex flex-wrap gap-4 justify-between items-center mb-6 border-b border-zinc-800 pb-5">
        <motion.h1
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-3xl font-light tracking-tighter flex items-center gap-3"
        >
          <CoachingHatLogo theme={theme} /> KoMe Ai
        </motion.h1>
        <div className="flex flex-wrap gap-2">
          <p className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm">
            {loginSession.email}
          </p>
          <p
            className={`px-3 py-2 rounded-xl border text-sm ${
              cloudSyncStatus === "cloud"
                ? "bg-emerald-900/30 border-emerald-700 text-emerald-200"
                : cloudSyncStatus === "syncing"
                  ? "bg-cyan-900/30 border-cyan-700 text-cyan-200"
                  : "bg-zinc-900 border-zinc-700 text-zinc-300"
            }`}
            title="Supabase sync status"
          >
            Cloud: {
              cloudSyncStatus === "cloud"
                ? "Connected"
                : cloudSyncStatus === "syncing"
                  ? "Syncing"
                  : "Local Only"
            }
          </p>
          <button
            onClick={() => setTheme((prev) => toggleTheme(prev))}
            className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200"
          >
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
          <button
            onClick={() => setActiveView("practice")}
            className={`px-4 py-2 rounded-xl border transition ${
              activeView === "practice"
                ? "bg-emerald-600 border-emerald-500 text-white"
                : "bg-zinc-900 border-zinc-700 text-zinc-200"
            }`}
          >
            Practice
          </button>
          <button
            onClick={() => setActiveView("dashboard")}
            className={`px-4 py-2 rounded-xl border transition ${
              activeView === "dashboard"
                ? "bg-emerald-600 border-emerald-500 text-white"
                : "bg-zinc-900 border-zinc-700 text-zinc-200"
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={handleDownloadLogs}
            className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200"
          >
            Download Logs
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200"
          >
            Logout
          </button>
        </div>
      </header>

      {activeView === "practice" ? (
        <main className="relative z-10 flex-1 w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-6">
          <section className="bg-zinc-900/95 border border-zinc-800 rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-center">
              <ChameleonMascot isConnected={isConnected} theme={theme} />
            </div>
            <textarea
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              placeholder="Describe the coaching scenario..."
              className="w-full p-5 rounded-2xl bg-zinc-900 border border-zinc-700 focus:ring-2 focus:ring-emerald-500 text-zinc-100 transition"
              rows={4}
              disabled={isScenarioConfirmed}
            />
            <button
              onClick={() => setIsScenarioConfirmed(true)}
              disabled={isScenarioConfirmed || !scenario.trim()}
              className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-100 hover:bg-zinc-700 transition disabled:opacity-50"
            >
              {isScenarioConfirmed ? "Scenario Confirmed" : "Confirm Scenario"}
            </button>
            <button
              onClick={handleWildcard}
              disabled={isScenarioConfirmed}
              className="w-full p-3 rounded-xl bg-emerald-900/30 border border-emerald-700 text-emerald-200 hover:bg-emerald-900/50 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Wand2 size={16} /> Wildcard Scenario
            </button>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Training Level</p>
                <p className="text-[11px] text-zinc-500">{unlockState.rationale}</p>
              </div>
              <select
                className="w-full p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100"
                value={coachLevel}
                disabled={isScenarioConfirmed}
                onChange={(event) => setCoachLevel(event.target.value as CoachLevel)}
              >
                {orderedLevels().map((level) => {
                  const unlocked = isLevelUnlocked(unlockState, level);
                  return (
                    <option key={level} value={level} disabled={!unlocked}>
                      {levelLabel(level)}{unlocked ? "" : " (Locked)"}
                    </option>
                  );
                })}
              </select>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["ambiguity", "Ambiguity"],
                    ["resistance", "Resistance"],
                    ["emotionalVolatility", "Emotion"],
                    ["goalConflict", "Goal Conflict"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="text-[11px] text-zinc-400">
                    <div className="flex justify-between mb-1">
                      <span>{label}</span>
                      <span>{challengeTone(challengeProfile[key])}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      value={challengeProfile[key]}
                      disabled={isConnected}
                      onChange={(event) =>
                        setChallengeProfile((prev) => ({
                          ...prev,
                          [key]: Number(event.target.value),
                        }))
                      }
                      className="w-full accent-emerald-500"
                    />
                  </label>
                ))}
              </div>
            </div>
            <select
              className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              onChange={(e) => setVoice(e.target.value)}
              value={voice}
            >
              {VOICES.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} - {v.desc}
                </option>
              ))}
            </select>
            <select
              className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              disabled={isConnected}
            >
              <option value={10}>10 Minutes</option>
              <option value={20}>20 Minutes</option>
              <option value={30}>30 Minutes</option>
            </select>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={isConnected ? () => void finalizeSession("manual_stop") : startSession}
              disabled={(!isConnected && !isScenarioConfirmed) || isEvaluating}
              className={`w-full flex items-center justify-center gap-3 px-8 py-4 rounded-full font-semibold text-lg transition-all ${
                isConnected
                  ? "bg-red-950 text-white force-white border border-red-800"
                  : "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20"
              } disabled:opacity-50`}
            >
              {isConnected ? <MicOff size={24} /> : <Mic size={24} />}
              {isConnected ? "Stop Session" : "Start Coaching Session"}
            </motion.button>
          </section>

          <section className="bg-zinc-900/95 border border-zinc-800 rounded-3xl p-4 md:p-6">
            <AnimatePresence mode="wait">
              {evaluationResults ? (
                <motion.div
                  key="results"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-5"
                >
                  <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
                    <div>
                      <h2 className="text-3xl font-semibold">Session Analysis</h2>
                      <p className="text-zinc-300 mt-1">{evaluationResults.summary}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div
                        className="h-20 w-20 rounded-full flex items-center justify-center border border-zinc-700"
                        style={{
                          background: `conic-gradient(#34d399 ${scoreToPercent(
                            evaluationResults.averageScore,
                          )}%, #27272a 0)`,
                        }}
                      >
                        <div className="h-14 w-14 rounded-full bg-zinc-900 flex flex-col items-center justify-center text-zinc-200">
                          <span className="font-semibold leading-none">
                            {scoreToPercent(evaluationResults.averageScore)}%
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-zinc-300">
                        Avg Score{" "}
                        <span className={`font-semibold ${scoreTextColor(evaluationResults.averageScore)}`}>
                          {evaluationResults.averageScore}/10
                        </span>
                      </p>
                    </div>
                  </div>

                  {evaluationGroups.map((group) => (
                    <section key={group.category} className="rounded-2xl border border-zinc-800 overflow-hidden">
                      <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between">
                        <h3 className={`font-semibold ${group.accent}`}>
                          {group.emoji} {group.category}
                        </h3>
                        <span className={`text-sm font-medium ${scoreTextColor(group.averageScore)}`}>
                          {group.averageScore}/10
                        </span>
                      </div>
                      <div className="p-4 space-y-4 bg-zinc-950">
                        {group.metrics.map((metric) => (
                          <div key={`${group.category}-${metric.metric}`} className="grid grid-cols-[56px_minmax(0,1fr)] gap-3">
                            <div className="rounded-xl bg-zinc-900 border border-zinc-800 text-center py-2">
                              <p className={`text-2xl font-semibold ${scoreTextColor(metric.score)}`}>
                                {metric.score}
                              </p>
                              <p className="text-xs text-zinc-400">of 10</p>
                            </div>
                            <div>
                              <div className="flex justify-between items-center gap-3">
                                <p className="text-zinc-100 font-medium">{metric.metric}</p>
                                <p className={`text-sm ${scoreTextColor(metric.score)}`}>
                                  {scoreToPercent(metric.score)}%
                                </p>
                              </div>
                              <div className="h-2 rounded-full bg-zinc-800 mt-1 overflow-hidden">
                                <div
                                  className={`h-full bg-gradient-to-r ${scoreTrackColor(metric.score)}`}
                                  style={{ width: `${scoreToPercent(metric.score)}%` }}
                                />
                              </div>
                              <p className="text-sm text-zinc-400 mt-2">{metric.comments}</p>
                              <p className={`text-xs mt-1 ${confidenceTextClass(metric.confidence)}`}>
                                Confidence: {typeof metric.confidence === "number"
                                  ? `${Math.round(metric.confidence * 100)}%`
                                  : "Not available"}
                              </p>
                              {metric.evidence && metric.evidence.length > 0 && (
                                <ul className="mt-1 text-[11px] text-zinc-500 space-y-0.5">
                                  {metric.evidence.slice(0, 2).map((item) => (
                                    <li key={item}>Evidence: {item}</li>
                                  ))}
                                </ul>
                              )}
                              {metric.calibrationNote && (
                                <p className="text-[11px] text-zinc-500 mt-1">
                                  {metric.calibrationNote}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}

                  <section className="rounded-2xl border border-cyan-900/60 bg-cyan-950/20 p-4">
                    <h3 className="font-semibold text-cyan-300">Calibration Check</h3>
                    {evaluationResults.calibration ? (
                      <div className="mt-2 text-sm text-zinc-300 space-y-1">
                        <p>
                          Alignment Score:{" "}
                          <span className="text-cyan-300 font-medium">
                            {evaluationResults.calibration.alignmentScore}%
                          </span>
                        </p>
                        <p className="text-zinc-400 text-xs">
                          Benchmark: {evaluationResults.calibration.benchmark}
                        </p>
                        <ul className="text-xs text-zinc-400 list-disc pl-5 space-y-1">
                          {evaluationResults.calibration.notes.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-zinc-400">
                        Calibration data unavailable for this run.
                      </p>
                    )}
                  </section>

                  <section className="rounded-2xl border border-red-900/60 bg-red-950/20 p-4">
                    <h3 className="font-semibold text-red-300 flex items-center gap-2">
                      <Flag size={16} /> Red Flags (No Therapy/Leading)
                    </h3>
                    {evaluationResults.redFlags.length > 0 ? (
                      <ul className="mt-2 text-sm text-zinc-300 list-disc pl-5 space-y-1">
                        {evaluationResults.redFlags.map((flag, index) => (
                          <li key={`${flag}-${index}`}>{flag}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-zinc-400">
                        No critical red flags detected in this session.
                      </p>
                    )}
                  </section>

                  <section className="rounded-2xl border border-emerald-900/60 bg-emerald-950/20 p-4">
                    <h3 className="font-semibold text-emerald-300 flex items-center gap-2">
                      <Sparkles size={16} /> Recommendations
                    </h3>
                    <ul className="mt-2 text-sm text-zinc-300 list-disc pl-5 space-y-1">
                      {evaluationResults.recommendations.map((item, index) => (
                        <li key={`${item}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </section>

                  <button
                    onClick={() => {
                      setEvaluationResults(null);
                      setScenario('');
                      setIsScenarioConfirmed(false);
                    }}
                    className="w-full p-3 rounded-xl bg-emerald-600 text-white"
                  >
                    Start New Session
                  </button>
                </motion.div>
              ) : !isConnected ? (
                <motion.div
                  key="setup"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="h-full flex flex-col items-center justify-center text-center py-10"
                >
                  <h2 className="text-2xl font-medium mb-2">Ready to Coach?</h2>
                  <p className="text-zinc-400 max-w-md">
                    Start a session and your analysis will appear here with rubric-level feedback,
                    red flags, and action recommendations.
                  </p>
                  {isEvaluating && (
                    <p className="text-zinc-400 text-sm mt-4">
                      Evaluating your last session...
                    </p>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="active"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="h-full flex flex-col items-center justify-center text-center py-10"
                >
                  <h2 className="text-3xl font-bold text-emerald-400 animate-pulse">Session Active</h2>
                  <p className="text-xl mt-2">
                    {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')} remaining
                  </p>
                  <div className="mt-4 text-xs text-zinc-400 font-mono text-left bg-zinc-950 border border-zinc-800 p-3 rounded-lg w-full max-w-lg">
                    {logs.map((log, i) => (
                      <div key={i}>{log}</div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </main>
      ) : (
        <main className="relative z-10 flex-1 w-full max-w-6xl">
              <section className="rounded-3xl border border-zinc-800 bg-zinc-900/90 overflow-hidden">
            <div className="border-b border-zinc-800 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight text-zinc-100">Dashboard</h2>
                <p className="text-zinc-400">Welcome back, Coach</p>
              </div>
              <p className="text-xs text-zinc-400 rounded-full border border-zinc-700 px-3 py-1">
                Last updated {new Date().toLocaleTimeString()}
              </p>
            </div>

            <div className="p-4 md:p-5 space-y-5">
              <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-zinc-400">Avg. Performance</p>
                    <span className="h-10 w-10 rounded-xl bg-violet-500/20 text-violet-300 grid place-items-center">
                      <TrendingUp size={18} />
                    </span>
                  </div>
                  <p className="text-4xl font-semibold mt-2">{averagePerformancePercent}%</p>
                  <p className="text-sm text-emerald-300 mt-2">
                    {dashboardAnalytics.momentumDelta >= 0 ? "+" : ""}
                    {dashboardAnalytics.momentumDelta} vs recent baseline
                  </p>
                </article>

                <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-zinc-400">Total Sessions</p>
                    <span className="h-10 w-10 rounded-xl bg-cyan-500/20 text-cyan-300 grid place-items-center">
                      <CalendarDays size={18} />
                    </span>
                  </div>
                  <p className="text-4xl font-semibold mt-2">{progressSummary.totalSessions}</p>
                  <p className="text-sm text-cyan-300 mt-2">+{scorePoints.length} tracked all time</p>
                </article>

                <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-zinc-400">Practice Time</p>
                    <span className="h-10 w-10 rounded-xl bg-pink-500/20 text-pink-300 grid place-items-center">
                      <Timer size={18} />
                    </span>
                  </div>
                  <p className="text-4xl font-semibold mt-2">{totalPracticeMinutes}m</p>
                  <p className="text-sm text-emerald-300 mt-2">
                    Goal {practiceGoalProgress}% of weekly target
                  </p>
                </article>
              </section>

              <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-4">
                <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
                    <div>
                      <h3 className="text-2xl font-semibold">Score History</h3>
                      <p className="text-zinc-400 text-sm">Overall performance across sessions</p>
                    </div>
                    <span className="text-emerald-300 text-sm rounded-full px-3 py-1 bg-emerald-500/10 border border-emerald-500/20">
                      {dashboardAnalytics.momentumDelta >= 0 ? "↑" : "↓"} {Math.abs(dashboardAnalytics.momentumDelta)}pts momentum
                    </span>
                  </div>
                  {scoreChartPoints.length > 1 ? (
                    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-3">
                      <svg viewBox="0 0 320 116" className="w-full h-44">
                        {[20, 40, 60, 80, 100].map((level) => {
                          const y = 96 - (level / 100) * 86;
                          return (
                            <line
                              key={level}
                              x1="10"
                              y1={y}
                              x2="310"
                              y2={y}
                              stroke="#27272a"
                              strokeDasharray="3 3"
                              strokeWidth="1"
                            />
                          );
                        })}
                        {scoreChartPoints.length > 1 && (
                          <polyline
                            points={scorePolyline}
                            fill="none"
                            stroke="#a78bfa"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}
                        {scoreChartPoints.map((point) => (
                          <circle
                            key={point.sessionId}
                            cx={point.x}
                            cy={point.y}
                            r="4.2"
                            fill={point.redFlagCount > 0 ? "#fb7185" : "#22d3ee"}
                          />
                        ))}
                      </svg>
                      <div className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        {scorePoints.slice(-4).map((point) => (
                          <div key={point.sessionId} className="rounded bg-zinc-950 border border-zinc-800 p-2">
                            <p className="text-zinc-400">{point.label}</p>
                            <p className="text-zinc-200">Score {point.score}/10</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : scoreChartPoints.length === 1 ? (
                    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
                      <p className="text-sm text-zinc-400">Only one completed session so far.</p>
                      <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                        <p className="text-xs text-zinc-500">{scorePoints[0].label}</p>
                        <p className="text-2xl font-semibold text-zinc-100 mt-1">
                          {scorePoints[0].score}/10
                        </p>
                        <div className="h-2 rounded bg-zinc-800 mt-2 overflow-hidden">
                          <div
                            className={`h-full bg-gradient-to-r ${scoreTrackColor(scorePoints[0].score)}`}
                            style={{ width: `${scoreToPercent(scorePoints[0].score)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-zinc-400 text-sm">Start sessions to generate trend charts.</p>
                  )}
                  <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-xs uppercase tracking-wide text-zinc-500">Competency Momentum</p>
                      <p className="text-[10px] text-zinc-500">Recent 3 vs all-time</p>
                    </div>
                    {competencyChartData.length > 0 ? (
                      <div className="space-y-2">
                        {competencyChartData.map((item) => {
                          const allTimePercent = scoreToPercent(item.allTime);
                          const recentPercent = scoreToPercent(item.recent);
                          const deltaClass = item.delta > 0
                            ? "text-emerald-300"
                            : item.delta < 0
                              ? "text-rose-300"
                              : "text-zinc-400";
                          const shortLabel = competencyShortLabel(item.category);
                          return (
                            <div key={item.category} className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <p className="text-zinc-200 font-medium">{shortLabel}</p>
                                <p className={deltaClass}>
                                  {item.delta > 0 ? "+" : ""}
                                  {item.delta.toFixed(1)}
                                </p>
                              </div>
                              <div className="mt-1.5 space-y-1">
                                <div className="grid grid-cols-[40px_minmax(0,1fr)_28px] items-center gap-2">
                                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">All</p>
                                  <div className="h-1.5 rounded bg-zinc-800 overflow-hidden">
                                    <div
                                      className="h-full bg-zinc-500"
                                      style={{ width: `${allTimePercent}%` }}
                                      title={`${item.category} all-time: ${item.allTime.toFixed(1)}/10`}
                                    />
                                  </div>
                                  <p className="text-[10px] text-zinc-500 text-right">{item.allTime.toFixed(1)}</p>
                                </div>
                                <div className="grid grid-cols-[40px_minmax(0,1fr)_28px] items-center gap-2">
                                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">Now</p>
                                  <div className="h-1.5 rounded bg-zinc-800 overflow-hidden">
                                    <div
                                      className="h-full"
                                      style={{
                                        width: `${recentPercent}%`,
                                        background: scoreChartColor(item.recent),
                                      }}
                                      title={`${item.category} recent: ${item.recent.toFixed(1)}/10`}
                                    />
                                  </div>
                                  <p className="text-[10px] text-zinc-300 text-right">{item.recent.toFixed(1)}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-zinc-500 text-xs">Complete sessions to unlock competency momentum.</p>
                    )}
                  </div>
                </article>

                <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <h3 className="text-2xl font-semibold">Skill Breakdown</h3>
                  <p className="text-zinc-400 text-sm mb-4">What your scoring pattern means in practice</p>
                  {skillBreakdown.length > 0 ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                          <p className="text-xs uppercase tracking-wide text-zinc-500">Strongest Skill</p>
                          <p className="text-sm font-semibold mt-1 text-zinc-100">
                            {strongestSkill?.category ?? "N/A"}
                          </p>
                          <p className="text-xs text-emerald-300 mt-1">
                            {strongestSkill ? `${strongestSkill.score}/10 · ${skillLabel(strongestSkill.score)}` : "No data"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                          <p className="text-xs uppercase tracking-wide text-zinc-500">Next Focus</p>
                          <p className="text-sm font-semibold mt-1 text-zinc-100">
                            {focusSkill?.category ?? "N/A"}
                          </p>
                          <p className="text-xs text-amber-300 mt-1">
                            {focusSkill ? `${focusSkill.score}/10 · ${skillLabel(focusSkill.score)}` : "No data"}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3">
                        <h4 className="text-sm font-semibold text-emerald-300">Coach Wins</h4>
                        {encouragementHighlights.length > 0 ? (
                          <ul className="mt-2 space-y-2 text-sm text-zinc-200">
                            {encouragementHighlights.map((highlight) => (
                              <li key={highlight.id}>
                                <span className="font-medium">{highlight.rubricLabel}</span>
                                {" — "}
                                {highlight.note}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-sm text-zinc-300">
                            You’re showing up for your craft. Keep going.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-zinc-400 text-sm">Complete sessions to unlock competency mapping.</p>
                  )}
                </article>
              </section>

              <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <h3 className="text-xl font-semibold mb-1">Competency Trajectory</h3>
                  <p className="text-xs text-zinc-500 mb-3">Recent vs prior baseline with readable trend signals</p>
                  {competencyTrends.length > 0 ? (
                    <div className="space-y-2">
                      {competencyTrends.map((trend) => {
                        const delta = trend.recent - trend.baseline;
                        const consistencyLabel = trend.consistency >= 8
                          ? "High"
                          : trend.consistency >= 6
                            ? "Moderate"
                            : "Low";
                        const trendClass = trend.trend === "Rising"
                          ? "text-emerald-300"
                          : trend.trend === "Falling"
                            ? "text-rose-300"
                            : "text-zinc-400";
                        return (
                          <div key={trend.category} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm text-zinc-200">{competencyShortLabel(trend.category)}</p>
                              <p className={`text-xs ${
                                delta >= 0.3 ? "text-emerald-300" : delta <= -0.3 ? "text-rose-300" : "text-zinc-400"
                              }`}>
                                {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                              </p>
                            </div>
                            <div className="mt-1 text-[11px] text-zinc-500 flex flex-wrap gap-x-3 gap-y-1">
                              <span>Baseline {trend.baseline.toFixed(1)}</span>
                              <span>Recent {trend.recent.toFixed(1)}</span>
                              <span className={trendClass}>Trend {trend.trend}</span>
                              <span>Consistency {consistencyLabel}</span>
                              <span>n={trend.sampleCount}</span>
                            </div>
                            {trend.regressionRisk && (
                              <p className="text-[11px] text-rose-300 mt-1">
                                Regression alert: recent performance dipped below baseline.
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-400">Complete sessions to unlock trajectory analysis.</p>
                  )}
                </article>

                <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-4">
                  <div>
                    <h3 className="text-xl font-semibold">Learning Loop</h3>
                    <p className="text-xs text-zinc-500">What improved in last 5 sessions and what to practice next</p>
                  </div>

                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                    <p className="text-xs uppercase tracking-wide text-emerald-300">Improved (Last 5)</p>
                    {learningSnapshot.wins.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-sm text-zinc-200">
                        {learningSnapshot.wins.map((win) => (
                          <li key={win.category}>
                            {competencyShortLabel(win.category)}{" "}
                            <span className="text-emerald-300">+{win.delta.toFixed(1)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-zinc-300">No significant gains detected yet.</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                    <p className="text-xs uppercase tracking-wide text-amber-300">Next Practice Targets</p>
                    {learningSnapshot.targets.length > 0 ? (
                      <ul className="mt-2 space-y-2 text-sm text-zinc-200">
                        {learningSnapshot.targets.map((target) => (
                          <li key={target.category}>
                            <p className="font-medium">{competencyShortLabel(target.category)}</p>
                            <p className="text-xs text-zinc-400">{target.reason}</p>
                            <p className="text-xs text-zinc-300">Focus move: {target.action}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-zinc-300">No immediate regression targets.</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3">
                    <p className="text-xs uppercase tracking-wide text-cyan-300">AI Client Adaptation (Latest)</p>
                    {latestAdaptiveProfile ? (
                      <div className="mt-2 text-sm text-zinc-200 space-y-1">
                        <p>
                          Mode: <span className="capitalize text-cyan-300">{latestAdaptiveProfile.qualityBand}</span>{" "}
                          ({latestAdaptiveProfile.qualityScore}/100)
                        </p>
                        <p className="text-xs text-zinc-400">
                          Open Qs: {latestAdaptiveProfile.openQuestions} · Leading: {latestAdaptiveProfile.leadingQuestions}
                          {" "}· Advice: {latestAdaptiveProfile.adviceMoments} · Empathy: {latestAdaptiveProfile.empathyMoments}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-zinc-300">No adaptation profile available yet.</p>
                    )}
                  </div>
                </article>
              </section>

              <section className="rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden">
                <div className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between gap-3">
                  <h3 className="text-2xl font-semibold">Latest Session Feedback</h3>
                  {latestSession && (
                    <span className="text-xs text-zinc-400">
                      {new Date(latestSession.endedAt).toLocaleString()}
                    </span>
                  )}
                </div>
                {latestFeedback ? (
                  <div className="p-4 space-y-4">
                    <p className="text-zinc-300 text-sm">{latestFeedback.summary}</p>
                    {latestFeedbackGroups.map((group) => (
                      <article key={`dashboard-${group.category}`} className="rounded-xl border border-zinc-800 overflow-hidden">
                        <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900 flex justify-between">
                          <h4 className={`font-medium ${group.accent}`}>
                            {group.emoji} {group.category}
                          </h4>
                          <p className={`text-sm ${scoreTextColor(group.averageScore)}`}>
                            {group.averageScore}/10
                          </p>
                        </div>
                        <div className="p-3 space-y-3 bg-zinc-950">
                          {group.metrics.map((metric) => (
                            <div key={`feedback-${group.category}-${metric.metric}`} className="grid grid-cols-[48px_minmax(0,1fr)] gap-3">
                              <div className="rounded-lg border border-zinc-800 bg-zinc-900 text-center py-1">
                                <p className={`font-semibold ${scoreTextColor(metric.score)}`}>{metric.score}</p>
                                <p className="text-[10px] text-zinc-500">/10</p>
                              </div>
                              <div>
                                <div className="flex justify-between gap-3 items-center">
                                  <p className="text-sm text-zinc-200">{metric.metric}</p>
                                  <p className={`text-xs ${scoreTextColor(metric.score)}`}>
                                    {scoreToPercent(metric.score)}%
                                  </p>
                                </div>
                                <div className="h-1.5 mt-1 rounded bg-zinc-800 overflow-hidden">
                                  <div
                                    className={`h-full bg-gradient-to-r ${scoreTrackColor(metric.score)}`}
                                    style={{ width: `${scoreToPercent(metric.score)}%` }}
                                  />
                                </div>
                                <p className="text-xs text-zinc-400 mt-1">{metric.comments}</p>
                                <p className={`text-[11px] mt-1 ${confidenceTextClass(metric.confidence)}`}>
                                  Confidence: {typeof metric.confidence === "number"
                                    ? `${Math.round(metric.confidence * 100)}%`
                                    : "n/a"}
                                </p>
                                {metric.evidence && metric.evidence.length > 0 && (
                                  <p className="text-[11px] text-zinc-500 mt-1">
                                    {metric.evidence[0]}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                    {latestFeedback.calibration && (
                      <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                        <p className="text-xs uppercase tracking-wide text-zinc-500">Calibration</p>
                        <p className="text-sm text-zinc-200 mt-1">
                          Alignment {latestFeedback.calibration.alignmentScore}% · {latestFeedback.calibration.benchmark}
                        </p>
                        <ul className="mt-2 text-xs text-zinc-400 list-disc pl-5 space-y-1">
                          {latestFeedback.calibration.notes.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      </article>
                    )}
                  </div>
                ) : (
                  <p className="p-4 text-zinc-400 text-sm">
                    Finish a session and this section will mirror your rubric-based feedback details.
                  </p>
                )}
              </section>

              <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <h3 className="text-xl font-semibold text-red-300 mb-1">Areas to Grow</h3>
                  <p className="text-xs text-zinc-500 mb-3">
                    Session log {latestSession ? `• ${new Date(latestSession.endedAt).toLocaleString()}` : ""}
                  </p>
                  {latestAreasToGrow.length > 0 ? (
                    <div className="space-y-3">
                      {latestAreasToGrow.map((flag, index) => (
                        <div key={`${flag}-${index}`} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                          <p className="text-sm text-zinc-200">{flag}</p>
                          <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                            {areaToGrowExamples(flag).slice(0, 2).map((example) => (
                              <li key={example}>Example: {example}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-zinc-400 text-sm">
                      No current areas logged for the latest session.
                    </p>
                  )}
                </article>

                <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <h3 className="text-xl font-semibold text-emerald-300 mb-3">Most Frequent Recommendations</h3>
                  {topRecommendations.length > 0 ? (
                    <ul className="space-y-2 text-sm">
                      {topRecommendations.map(([recommendation, count]) => (
                        <li key={recommendation} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                          <p className="text-zinc-200">{recommendation}</p>
                          <p className="text-zinc-500 mt-1">Appears in {count} session(s)</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-zinc-400 text-sm">No recommendation history yet.</p>
                  )}
                </article>
              </section>

              <section
                ref={sessionHistorySectionRef}
                className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h3 className="text-2xl font-semibold">Recent Sessions</h3>
                  <button
                    onClick={() => setRedFlagFocus((prev) => !prev)}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                      redFlagFocus
                        ? "bg-red-900/40 border-red-500/60 text-white force-white"
                        : "bg-zinc-900 border-zinc-700 text-zinc-300"
                    }`}
                  >
                    {redFlagFocus ? "Showing Red-Flag Sessions" : "Filter: Red Flags"}
                  </button>
                </div>
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {displayedSessions.length === 0 ? (
                    <p className="text-zinc-400 text-sm">
                      {redFlagFocus && sessionHistory.length > 0
                        ? "No sessions match the active red-flag filter."
                        : "No completed sessions yet."}
                    </p>
                  ) : (
                    displayedSessions.map((session) => (
                      <div key={session.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm">
                        <div className="flex flex-wrap justify-between gap-2">
                          <p className="text-zinc-200">{new Date(session.endedAt).toLocaleString()}</p>
                          <p className={`font-semibold ${scoreTextColor(session.evaluation.averageScore)}`}>
                            Score {session.evaluation.averageScore}/10
                          </p>
                        </div>
                        <p className="text-zinc-400 mt-1">
                          Reason: {session.endedReason} · Elapsed: {session.elapsedSeconds}s /{" "}
                          {session.plannedSeconds}s
                        </p>
                        <p className="text-zinc-500 mt-1 text-xs">
                          Level: {session.trainingConfig?.level ?? "n/a"} · Adaptive mode: {session.adaptiveProfile?.qualityBand ?? "n/a"}
                        </p>
                        <p className="text-zinc-300 mt-2">{session.evaluation.summary}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={() => handleDownloadSessionTranscript(session)}
                            className="px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs"
                          >
                            Download Transcript
                          </button>
                          <button
                            onClick={() => handleDownloadSessionScorecard(session)}
                            className="px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs"
                          >
                            Download Scorecard
                          </button>
                          <button
                            onClick={() => void handleDownloadSessionAudio(session)}
                            disabled={!session.audio?.available}
                            className="px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs disabled:opacity-40"
                          >
                            Download Audio
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

            </div>
          </section>
        </main>
      )}
    </div>
  );
}
