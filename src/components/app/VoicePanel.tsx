"use client";

/**
 * Browser voice, fixed in the corner. Mic audio goes out as PCM, agent audio plays back,
 * and audio_output_clear flushes playback (barge-in). The API key never reaches this file.
 * `?voicePreview=pill|open` seeds a fake transcript in development only.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { reduceTranscriptOpen, transcriptPillVisible } from "@/voice/transcriptDock";
import { ErrorLine, Icon, T } from "../desk/ui";
import { RemOrb } from "./RemOrb";
import {
  answerClientTool,
  applyTranscript,
  audioInputMessage,
  base64ToPcm16,
  clientToolResultMessage,
  downsample,
  floatsToPcm16,
  parseServerEvent,
  pcm16ToBase64,
  pcm16ToFloat,
  sessionCreateMessage,
  statusAfter,
  SAMPLE_RATE,
  type TranscriptLine,
  type VoiceStatus,
} from "@/voice/session";

const STATUS_WORD: Record<VoiceStatus, string> = {
  idle: "Ready",
  connecting: "Connecting",
  listening: "Listening",
  speaking: "Speaking",
};

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-paper focus-visible:ring-offset-2 focus-visible:ring-offset-bar";

function voicePreview(): "pill" | "open" | null {
  if (process.env.NODE_ENV === "production") return null;
  const mode = new URLSearchParams(window.location.search).get("voicePreview");
  return mode === "pill" || mode === "open" ? mode : null;
}

function subscribeVoicePreview(): () => void {
  return () => {};
}

function noVoicePreview(): null {
  return null;
}

/** Dev-only lines so the transcript card can be reviewed without a live Cartesia session. */
const PREVIEW_LINES: TranscriptLine[] = [
  { turn: 1, role: "user", text: "Why is this bill held?", pending: false },
  { turn: 2, role: "assistant", text: "It is held because the amount is over the auto-pay limit.", pending: false },
  { turn: 3, role: "user", text: "Who has to approve it?", pending: false },
  { turn: 4, role: "assistant", text: "A person still has to approve it. I can't pay it.", pending: false },
  { turn: 5, role: "user", text: "What did the check say?", pending: false },
  { turn: 6, role: "assistant", text: "The amount is above the auto-pay limit, so the bill stays held.", pending: false },
  { turn: 7, role: "user", text: "Can you approve it?", pending: false },
  { turn: 8, role: "assistant", text: "No. A person approves, rejects, or pays. This is the newest line.", pending: false },
];

interface LiveCall {
  stop(): void;
}

export function VoicePanel({ billId }: { billId: string }) {
  const startSession = useAction(api.pipeline.voice.startVoiceSession);
  const router = useRouter();
  const billIdRef = useRef(billId);
  const liveRef = useRef<LiveCall | null>(null);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const preview = useSyncExternalStore(subscribeVoicePreview, voicePreview, noVoicePreview);
  const [sessionTranscriptOpen, setSessionTranscriptOpen] = useState(false);
  const [previewClosed, setPreviewClosed] = useState(false);
  const transcriptOpen = sessionTranscriptOpen || (preview === "open" && !previewClosed);
  const shownLines = lines.length > 0 ? lines : preview ? PREVIEW_LINES : lines;
  const closeRef = useRef<HTMLButtonElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const talkRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const transcriptWasOpen = useRef(false);

  useEffect(() => {
    billIdRef.current = billId;
  }, [billId]);

  useEffect(() => () => liveRef.current?.stop(), []);

  useEffect(() => {
    if (!transcriptOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setPreviewClosed(true);
      setSessionTranscriptOpen((open) => reduceTranscriptOpen(open, "escape"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [transcriptOpen]);

  useEffect(() => {
    if (transcriptOpen) {
      transcriptWasOpen.current = true;
      closeRef.current?.focus();
      return;
    }
    if (!transcriptWasOpen.current) return;
    transcriptWasOpen.current = false;
    (pillRef.current ?? talkRef.current)?.focus();
  }, [transcriptOpen]);

  useEffect(() => {
    if (!transcriptOpen) return;
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [transcriptOpen, shownLines]);

  function hangUp() {
    liveRef.current?.stop();
    liveRef.current = null;
    setStatus("idle");
  }

  async function talk() {
    setProblem(null);
    setStatus("connecting");
    let session: unknown;
    try {
      session = await startSession({});
    } catch {
      setStatus("idle");
      setProblem("Voice is unavailable right now.");
      return;
    }
    const ready = readSession(session);
    if (!ready.ok) {
      setStatus("idle");
      if (ready.reason === "Voice is not configured.") setBlocked(true);
      setProblem(ready.reason);
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch {
      setStatus("idle");
      setProblem("Microphone permission was denied. Allow the mic to talk to Lintel.");
      return;
    }

    let audio: AudioContext;
    try {
      audio = new AudioContext();
      await audio.resume();
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setStatus("idle");
      setProblem("This browser could not open audio.");
      return;
    }

    const ws = new WebSocket(ready.websocket_url);
    const sources: AudioBufferSourceNode[] = [];
    let nextTime = 0;
    let sessionReady = false;
    let closed = false;

    const stop = () => {
      if (closed) return;
      closed = true;
      sessionReady = false;
      for (const node of sources) {
        try { node.stop(); } catch { /* already ended */ }
      }
      sources.length = 0;
      stream.getTracks().forEach((track) => track.stop());
      processor.disconnect();
      void audio.close();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(1000, "session completed");
    };
    liveRef.current = { stop };

    const source = audio.createMediaStreamSource(stream);
    const processor = audio.createScriptProcessor(4096, 1, 1);
    const mute = audio.createGain();
    mute.gain.value = 0;
    source.connect(processor);
    processor.connect(mute);
    mute.connect(audio.destination);
    processor.onaudioprocess = (event) => {
      if (!sessionReady || ws.readyState !== WebSocket.OPEN) return;
      const input = event.inputBuffer.getChannelData(0);
      const down = downsample(new Float32Array(input), audio.sampleRate, SAMPLE_RATE);
      if (down.length === 0) return;
      ws.send(JSON.stringify(audioInputMessage(pcm16ToBase64(floatsToPcm16(down)))));
    };

    function play(audioBase64: string) {
      const samples = pcm16ToFloat(base64ToPcm16(audioBase64));
      if (samples.length === 0) return;
      const buffer = audio.createBuffer(1, samples.length, SAMPLE_RATE);
      buffer.getChannelData(0).set(samples);
      const node = audio.createBufferSource();
      node.buffer = buffer;
      node.connect(audio.destination);
      const startAt = Math.max(audio.currentTime + 0.05, nextTime);
      node.start(startAt);
      nextTime = startAt + buffer.duration;
      sources.push(node);
    }

    function clearPlayback() {
      for (const node of sources) {
        try { node.stop(); } catch { /* already ended */ }
      }
      sources.length = 0;
      nextTime = 0;
    }

    ws.onopen = () => {
      ws.send(JSON.stringify(sessionCreateMessage()));
    };
    ws.onmessage = (message) => {
      const event = parseServerEvent(String(message.data));
      if (event.type === "session_ready") sessionReady = true;
      if (event.type === "audio_output") play(event.audio);
      if (event.type === "audio_output_clear") clearPlayback();
      if (event.type === "client_tool_call") {
        const answer = answerClientTool(event.tool_name, event.parameters, billIdRef.current);
        if (event.expects_response) {
          ws.send(JSON.stringify(clientToolResultMessage(event.tool_call_id, answer.result, answer.isError)));
        }
        if (answer.navigateTo) router.push(answer.navigateTo);
      }
      if (event.type === "error") setProblem(event.message);
      setLines((current) => applyTranscript(current, event));
      setStatus((current) => statusAfter(event, current));
    };
    ws.onerror = () => {
      if (!closed) setProblem("The voice connection failed.");
    };
    ws.onclose = () => {
      stop();
      liveRef.current = null;
      setStatus("idle");
    };
  }

  const label = status === "idle" ? "Talk to Lintel" : "Hang up";
  const showPill = transcriptPillVisible(transcriptOpen, status, shownLines.length);

  function closeTranscript() {
    setPreviewClosed(true);
    setSessionTranscriptOpen((open) => reduceTranscriptOpen(open, "hide"));
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-20 flex w-[min(360px,calc(100vw-1.5rem))] flex-col items-end gap-2 max-sm:bottom-3 max-sm:right-3">
      {problem && (
        <div className="pointer-events-auto max-w-full">
          <ErrorLine>{problem}</ErrorLine>
        </div>
      )}
      {transcriptOpen && (
        <section
          id="voice-transcript"
          role="dialog"
          aria-label="Voice transcript"
          className="pointer-events-auto flex max-h-[min(420px,60vh)] w-full flex-col gap-3 rounded-[16px] border border-white/[0.08] bg-card/70 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.45)] backdrop-blur-md"
        >
          <div className="flex items-center gap-2">
            <h2 className={`${T.label} text-muted`}>Transcript</h2>
            <button
              ref={closeRef}
              type="button"
              onClick={closeTranscript}
              aria-label="Close transcript"
              className={`ml-auto inline-flex size-10 cursor-pointer items-center justify-center rounded-full text-muted hover:text-paper ${FOCUS}`}
            >
              <Icon name="close" />
            </button>
          </div>
          <p className={`${T.small} text-muted`}>Lintel can explain this bill. A person approves, rejects, or pays.</p>
          <ol
            ref={listRef}
            tabIndex={0}
            aria-label="Transcript lines"
            className={`flex max-h-[min(240px,36vh)] flex-col gap-3 overflow-y-auto pr-1 ${FOCUS}`}
          >
            {shownLines.length === 0 && <li className={`${T.small} text-muted`}>Nothing said yet.</li>}
            {shownLines.map((line) => (
              <li key={line.turn}>
                <span className={`${T.label} ${line.role === "assistant" ? "text-lime" : "text-muted"}`}>{line.role === "assistant" ? "Lintel" : "You"}</span>
                <p className={`${T.small} ${line.role === "assistant" ? "text-paper" : "text-muted"}`}>{line.text || (line.pending ? "…" : "")}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
      {showPill && (
        <button
          ref={pillRef}
          type="button"
          onClick={() => setSessionTranscriptOpen((open) => reduceTranscriptOpen(open, "show"))}
          aria-label="Show transcript"
          aria-controls="voice-transcript"
          aria-expanded={false}
          className={`pointer-events-auto inline-flex h-9 cursor-pointer items-center rounded-full border border-white/[0.08] bg-card/75 px-3 text-[13px] font-semibold text-paper shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-md ${FOCUS}`}
        >
          Show transcript
        </button>
      )}
      <div className="pointer-events-auto flex flex-col items-end gap-1">
        <button
          ref={talkRef}
          type="button"
          disabled={blocked}
          aria-label={label}
          onClick={() => { if (status === "idle") void talk(); else hangUp(); }}
          className={`flex items-center gap-2 rounded-full py-1 pl-1 disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`}
        >
          <span className="inline-flex h-10 items-center rounded-full px-4 text-[14px] font-semibold leading-5 text-paper shadow-[inset_0_0_0_1px_rgba(242,241,236,0.3)] max-sm:px-3 max-sm:text-[13px]">
            {label}
          </span>
          <RemOrb state={status} />
        </button>
        <span className={`${T.label} text-muted`} role="status" aria-live="polite">{STATUS_WORD[status]}</span>
      </div>
    </div>
  );
}

function readSession(value: unknown): { ok: true; websocket_url: string } | { ok: false; reason: string } {
  if (!value || typeof value !== "object") return { ok: false, reason: "Voice is unavailable right now." };
  const row = value as Record<string, unknown>;
  if (row.ok === false) return { ok: false, reason: typeof row.reason === "string" ? row.reason : "Voice is not configured." };
  if (row.ok === true && typeof row.websocket_url === "string" && row.websocket_url.startsWith("wss://")) {
    return { ok: true, websocket_url: row.websocket_url };
  }
  return { ok: false, reason: "Voice is unavailable right now." };
}
