"use client";

/**
 * Browser voice on the bill page. Mic audio goes out as PCM, agent audio plays back,
 * and audio_output_clear flushes playback (barge-in). The API key never reaches this file.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button, CARD, ErrorLine, T } from "../desk/ui";
import { WhoChip } from "./kit";
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

interface LiveCall {
  stop(): void;
}

export function VoicePanel({ billId }: { billId: string }) {
  const startSession = useAction(api.pipeline.voice.startVoiceSession);
  const router = useRouter();
  const billIdRef = useRef(billId);
  billIdRef.current = billId;
  const liveRef = useRef<LiveCall | null>(null);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => () => liveRef.current?.stop(), []);

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

  return (
    <section className={`${CARD} flex flex-col gap-3`} aria-label="Talk to Lintel">
      <div className="flex flex-wrap items-center gap-2">
        <WhoChip who="CODE" />
        <h2 className={`${T.body} font-semibold`}>Talk to Lintel</h2>
        <span className={`${T.label} ml-auto text-muted`} aria-live="polite">{STATUS_WORD[status]}</span>
      </div>
      <p className={`${T.small} text-muted`}>Ask why this bill is held. Lintel can explain it. A person approves, rejects, or pays.</p>
      {problem && <ErrorLine>{problem}</ErrorLine>}
      <div>
        {status === "idle" ? (
          <Button kind="secondary" onClick={() => void talk()} disabled={blocked}>Talk to Lintel</Button>
        ) : (
          <Button kind="secondary" onClick={hangUp}>Hang up</Button>
        )}
      </div>
      {lines.length > 0 && (
        <ol className="flex max-h-48 flex-col gap-3 overflow-y-auto border-t border-white/[0.08] pt-3">
          {lines.map((line) => (
            <li key={line.turn}>
              <span className={`${T.label} text-muted`}>{line.role === "assistant" ? "Lintel" : "You"}</span>
              <p className={`${T.small} ${line.role === "assistant" ? "text-paper" : "text-muted"}`}>{line.text || (line.pending ? "…" : "")}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
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
