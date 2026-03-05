/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Settings, Sparkles, ChevronDown, Wand2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { customRubric } from './rubric';
import { scenarios } from './scenarios';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const VOICES = [
  { name: 'Puck', desc: 'Light, energetic, youthful' },
  { name: 'Charon', desc: 'Deep, calm, authoritative' },
  { name: 'Kore', desc: 'Bright, friendly, approachable' },
  { name: 'Fenrir', desc: 'Serious, grounded, firm' },
  { name: 'Zephyr', desc: 'Soft, airy, gentle' }
];

// Unique Mascot Component
const ChameleonMascot = ({ isConnected }: { isConnected: boolean }) => (
  <motion.svg 
    width="150" height="150" viewBox="0 0 100 100"
    animate={{ rotate: isConnected ? [0, -5, 5, 0] : 0 }}
    transition={{ repeat: isConnected ? Infinity : 0, duration: 2 }}
  >
    <motion.path 
      d="M20,50 Q50,10 80,50 T20,50" 
      fill={isConnected ? "#10b981" : "#3f3f46"} 
      animate={{ fill: isConnected ? "#10b981" : "#3f3f46" }}
    />
    <motion.circle cx="70" cy="40" r="5" fill="white" />
  </motion.svg>
);

export default function App() {
  const [transcript, setTranscript] = useState<string>('');
  const [evaluationResults, setEvaluationResults] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [duration, setDuration] = useState(10);
  const [timeLeft, setTimeLeft] = useState(0);
  const [scenario, setScenario] = useState('');
  const [isScenarioConfirmed, setIsScenarioConfirmed] = useState(false);
  const [voice, setVoice] = useState('Zephyr');
  const sessionRef = useRef<any>(null);

  const handleWildcard = async () => {
    setScenario("Generating wildcard scenario...");
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Generate a diverse and challenging coaching scenario for a roleplay session. 
        Use these existing scenarios as reference points for style and depth: 
        ${JSON.stringify(scenarios)}. 
        Return only the scenario title, summary, and persona in a JSON object with keys: title, summary, persona.`,
        config: { responseMimeType: "application/json" }
      });
      
      const wildcardScenario = JSON.parse(response.text!);
      setScenario(`${wildcardScenario.title}\n\nSummary: ${wildcardScenario.summary}\n\nPersona: ${wildcardScenario.persona}`);
    } catch (e) {
      console.error("Failed to generate wildcard scenario:", e);
      setScenario("Failed to generate scenario. Please try again.");
    }
  };

  const audioContext = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [logs, setLogs] = useState<string[]>([]);
  const addLog = (msg: string) => setLogs(prev => [...prev.slice(-4), msg]);

  // Timer effect
  useEffect(() => {
    if (!isConnected || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          stopSession();
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

  const startSession = async () => {
    if (!isScenarioConfirmed) {
      alert("Please confirm the coaching scenario first.");
      return;
    }

    try {
      addLog("Connecting...");
      setTranscript(''); // Reset transcript
      setTimeLeft(duration * 60);
      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        callbacks: {
          onopen: async () => {
            addLog("Session opened");
            setIsConnected(true);
            
            // Start microphone capture
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            
            const audioContext = new AudioContext({ sampleRate: 16000 });
            const source = audioContext.createMediaStreamSource(stream);
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            
            source.connect(processor);
            processor.connect(audioContext.destination);
            
            processor.onaudioprocess = async (e) => {
              if (!sessionRef.current) return; // Stop sending if session is closed
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmData = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                pcmData[i] = inputData[i] * 32768;
              }
              
              const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
              sessionRef.current.sendRealtimeInput({ media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' } });
            };
            
            mediaRecorderRef.current = { stop: () => { stream.getTracks().forEach(t => t.stop()); source.disconnect(); processor.disconnect(); } } as any;
          },
          onmessage: async (message: LiveServerMessage) => {
            addLog("Message received");
            console.log("Message:", message);
            
            // Audio handling
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              await playAudio(base64Audio);
            }
            
            // Transcription handling
            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.text) {
                  setTranscript(prev => prev + "Client: " + part.text + "\n");
                }
              }
            }
            
            // User input transcription
            if ((message as any).inputTranscription?.data) {
               console.log("Input transcription received:", (message as any).inputTranscription.data);
               setTranscript(prev => prev + "Coach: " + (message as any).inputTranscription.data + "\n");
            }
          },
          onclose: () => {
            addLog("Session closed");
            setIsConnected(false);
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          systemInstruction: `You are Coaching Chameleon (CC) — a roleplay simulation agent designed to help coaches practice real coaching conversations.

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

You are Coaching Chameleon (CC) — a simulation client that can take the shape of any coaching scenario provided by the coach.

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
   Guardrails: Do not say the issue is solved, overcommit, summarize the session, give advice to yourself, or switch into teacher mode. End in a thoughtful, steady tone.`,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
          },
        },
      });
      sessionRef.current = await sessionPromise;
    } catch (error) {
      console.error("Failed to connect:", error);
    }
  };

  const isStopping = useRef(false);

  const stopSession = async () => {
    if (isStopping.current) return;
    isStopping.current = true;

    if (sessionRef.current) {
        sessionRef.current.close();
        sessionRef.current = null;
    }
    
    // Cleanup media resources
    if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }
    
    setIsConnected(false);
    addLog("Session stopped");
    addLog("Transcript length: " + transcript.length);
    console.log("Transcript:", transcript);
    
    addLog("Evaluating session...");
    try {
      const response = await ai.models.generateContent({
          model: "gemini-3.1-pro-preview",
          contents: `Evaluate this coaching transcript: ${transcript}. 
          Score the coach against this rubric: ${JSON.stringify(customRubric)}. 
          Do NOT use ICF language. Return the analysis as a JSON array of objects with category, metric, score (0-10), and comments.`,
          config: { responseMimeType: "application/json" }
      });
      
      const evaluation = JSON.parse(response.text!);
      setEvaluationResults(evaluation);
      addLog("Evaluation complete");
      console.log("Evaluation results:", evaluation);
    } catch (e) {
      addLog("Evaluation error: " + e);
      console.error("Evaluation error:", e);
      alert("Session ended, but evaluation failed. Check console for details.");
      isStopping.current = false;
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 flex flex-col items-center font-sans">
      <header className="w-full max-w-4xl flex justify-between items-center mb-12 border-b border-zinc-800 pb-6">
        <motion.h1 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="text-3xl font-light tracking-tighter flex items-center gap-3">
          <Sparkles className="text-emerald-400" /> Coaching Chameleon
        </motion.h1>
      </header>

      <main className="flex-1 w-full max-w-md flex flex-col items-center gap-10">
        <ChameleonMascot isConnected={isConnected} />

        <div className="flex flex-col gap-4 w-full">
            <textarea 
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                placeholder="Describe the coaching scenario..."
                className="w-full p-5 rounded-2xl bg-zinc-900 border border-zinc-800 focus:ring-2 focus:ring-emerald-500 text-zinc-100 transition"
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
                className="w-full p-3 rounded-xl bg-emerald-900/30 border border-emerald-800 text-emerald-200 hover:bg-emerald-900/50 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
                <Wand2 size={16} /> Wildcard Scenario
            </button>
            <select className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" onChange={(e) => setVoice(e.target.value)}>
                {VOICES.map(v => <option key={v.name} value={v.name}>{v.name} - {v.desc}</option>)}
            </select>
            <select className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" value={duration} onChange={(e) => setDuration(Number(e.target.value))} disabled={isScenarioConfirmed}>
                <option value={10}>10 Minutes</option>
                <option value={20}>20 Minutes</option>
                <option value={30}>30 Minutes</option>
            </select>
        </div>

        <AnimatePresence mode="wait">
          {evaluationResults ? (
            <motion.div key="results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full bg-zinc-900 p-6 rounded-2xl border border-zinc-800">
                <h2 className="text-2xl font-bold mb-4 text-emerald-400">Session Evaluation</h2>
                <div className="space-y-4">
                    {evaluationResults.map((item: any, i: number) => (
                        <div key={i} className="border-b border-zinc-800 pb-2">
                            <div className="flex justify-between">
                                <span className="font-semibold">{item.metric}</span>
                                <span className="text-emerald-400">{item.score}/10</span>
                            </div>
                            <p className="text-sm text-zinc-400">{item.comments}</p>
                        </div>
                    ))}
                </div>
                <button onClick={() => { setEvaluationResults(null); setScenario(''); setIsScenarioConfirmed(false); }} className="mt-6 w-full p-3 rounded-xl bg-emerald-600 text-white">Start New Session</button>
            </motion.div>
          ) : !isConnected ? (
            <motion.div key="setup" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="text-center w-full">
              <h2 className="text-2xl font-medium mb-2">Ready to Coach?</h2>
            </motion.div>
          ) : (
            <motion.div key="active" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="text-center">
              <h2 className="text-3xl font-bold text-emerald-400 animate-pulse">Session Active</h2>
              <p className="text-xl mt-2">{Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')} remaining</p>
              <div className="mt-4 text-xs text-zinc-500 font-mono text-left bg-zinc-900 p-3 rounded-lg">
                {logs.map((log, i) => <div key={i}>{log}</div>)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button 
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={isConnected ? stopSession : startSession}
          disabled={!isConnected && !isScenarioConfirmed}
          className={`flex items-center gap-3 px-8 py-4 rounded-full font-semibold text-lg transition-all ${
            isConnected ? 'bg-red-950 text-red-200 border border-red-800' : 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20'
          } disabled:opacity-50`}
        >
          {isConnected ? <MicOff size={24} /> : <Mic size={24} />}
          {isConnected ? 'Stop Session' : 'Start Coaching Session'}
        </motion.button>
      </main>
    </div>
  );
}
