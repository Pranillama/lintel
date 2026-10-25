/**
 * Browser voice session, pure pieces.
 * Wire format checked against the Cartesia Agent WebSocket reference on Oct 25, 2026.
 * Agent audio uses the same PCM layout as input_format. Unknown session_create fields are rejected.
 */

export const CARTESIA_VERSION = "2026-08-14";
export const INPUT_FORMAT = "pcm_16000";
export const SAMPLE_RATE = 16_000;

export interface TranscriptLine {
  turn: number;
  role: "user" | "assistant";
  text: string;
  pending: boolean;
}

export type VoiceStatus = "idle" | "connecting" | "listening" | "speaking";

export type ServerEvent =
  | { type: "session_ready"; call_id: string }
  | { type: "audio_output"; audio: string }
  | { type: "audio_output_clear" }
  | { type: "client_tool_call"; tool_call_id: string; tool_name: string; parameters: Record<string, unknown>; expects_response: boolean }
  | { type: "turn_started"; turn: number; role: "user" | "assistant" }
  | { type: "turn_output_text_delta"; turn: number; text: string }
  | { type: "turn_ended"; turn: number; role: "user" | "assistant"; text: string }
  | { type: "error"; message: string; fatal: boolean }
  | { type: "ignore" };

export interface ToolAnswer {
  result: string;
  isError: boolean;
  /** App path to open. The caller navigates. This function does not. */
  navigateTo: string | null;
}

export function reviewerSocketUrl(agentId: string, accessToken: string): string {
  return `wss://api.cartesia.ai/v1/agents/websocket/${encodeURIComponent(agentId)}?cartesia_version=${CARTESIA_VERSION}&access_token=${encodeURIComponent(accessToken)}`;
}

export function sessionCreateMessage(): {
  type: "session_create";
  audio: { input_format: typeof INPUT_FORMAT; output_delivery: "speaking_pace"; continuous_input: true };
} {
  return {
    type: "session_create",
    audio: {
      input_format: INPUT_FORMAT,
      output_delivery: "speaking_pace",
      continuous_input: true,
    },
  };
}

export function audioInputMessage(audio: string): { type: "audio_input"; audio: string } {
  return { type: "audio_input", audio };
}

export function clientToolResultMessage(toolCallId: string, result: string, isError: boolean): {
  type: "client_tool_result";
  tool_call_id: string;
  result: string;
  is_error: boolean;
} {
  return { type: "client_tool_result", tool_call_id: toolCallId, result, is_error: isError };
}

export function parseServerEvent(raw: string): ServerEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { type: "error", message: "Unreadable voice message.", fatal: false };
  }
  if (!isRecord(parsed) || typeof parsed.type !== "string") return { type: "ignore" };
  switch (parsed.type) {
    case "session_ready":
      return typeof parsed.call_id === "string" ? { type: "session_ready", call_id: parsed.call_id } : { type: "ignore" };
    case "audio_output":
      return typeof parsed.audio === "string" ? { type: "audio_output", audio: parsed.audio } : { type: "ignore" };
    case "audio_output_clear":
      return { type: "audio_output_clear" };
    case "client_tool_call": {
      if (typeof parsed.tool_call_id !== "string" || typeof parsed.tool_name !== "string" || !isRecord(parsed.parameters)) {
        return { type: "ignore" };
      }
      return {
        type: "client_tool_call",
        tool_call_id: parsed.tool_call_id,
        tool_name: parsed.tool_name,
        parameters: parsed.parameters,
        expects_response: parsed.expects_response === true,
      };
    }
    case "turn_started": {
      const role = roleOf(parsed.role);
      return typeof parsed.turn === "number" && role ? { type: "turn_started", turn: parsed.turn, role } : { type: "ignore" };
    }
    case "turn_output_text_delta":
      return typeof parsed.turn === "number" && typeof parsed.text === "string"
        ? { type: "turn_output_text_delta", turn: parsed.turn, text: parsed.text }
        : { type: "ignore" };
    case "turn_ended": {
      const role = roleOf(parsed.role);
      return typeof parsed.turn === "number" && typeof parsed.text === "string" && role
        ? { type: "turn_ended", turn: parsed.turn, role, text: parsed.text }
        : { type: "ignore" };
    }
    case "error":
      return {
        type: "error",
        message: typeof parsed.message === "string" ? parsed.message : "Voice error.",
        fatal: parsed.fatal === true,
      };
    default:
      return { type: "ignore" };
  }
}

export function applyTranscript(lines: TranscriptLine[], event: ServerEvent): TranscriptLine[] {
  if (event.type === "turn_started") {
    const rest = lines.filter((line) => line.turn !== event.turn);
    return byTurn([...rest, { turn: event.turn, role: event.role, text: "", pending: true }]);
  }
  if (event.type === "turn_output_text_delta") {
    const existing = lines.some((line) => line.turn === event.turn);
    const next = existing
      ? lines.map((line) => (line.turn === event.turn ? { ...line, role: "assistant" as const, text: line.text + event.text } : line))
      : [...lines, { turn: event.turn, role: "assistant" as const, text: event.text, pending: true }];
    return byTurn(next);
  }
  if (event.type === "turn_ended") {
    const existing = lines.some((line) => line.turn === event.turn);
    const next = existing
      ? lines.map((line) => (line.turn === event.turn ? { turn: event.turn, role: event.role, text: event.text, pending: false } : line))
      : [...lines, { turn: event.turn, role: event.role, text: event.text, pending: false }];
    return byTurn(next);
  }
  return lines;
}

export function statusAfter(event: ServerEvent, current: VoiceStatus): VoiceStatus {
  if (event.type === "session_ready" || event.type === "audio_output_clear") return "listening";
  if (event.type === "audio_output") return "speaking";
  if (event.type === "turn_started") return event.role === "assistant" ? "speaking" : "listening";
  if (event.type === "turn_ended") return "listening";
  return current;
}

/** Client tools only. Anything else, including approve or pay, is an error and does not navigate. */
export function answerClientTool(toolName: string, parameters: Record<string, unknown>, selectedBillId: string): ToolAnswer {
  if (toolName === "get_selected_bill") {
    return { result: JSON.stringify({ bill_id: selectedBillId }), isError: false, navigateTo: null };
  }
  if (toolName === "show_bill") {
    const billId = safeBillId(parameters.bill_id);
    if (!billId) return { result: "Missing bill id.", isError: true, navigateTo: null };
    return {
      result: JSON.stringify({ ok: true, bill_id: billId }),
      isError: false,
      navigateTo: `/bills/${encodeURIComponent(billId)}`,
    };
  }
  return { result: "That tool is not available. A person handles changes to a bill.", isError: true, navigateTo: null };
}

export function floatsToPcm16(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return out;
}

export function pcm16ToFloat(pcm: Uint8Array): Float32Array {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const samples = new Float32Array(Math.floor(pcm.byteLength / 2));
  for (let i = 0; i < samples.length; i++) {
    const value = view.getInt16(i * 2, true);
    samples[i] = value < 0 ? value / 0x8000 : value / 0x7fff;
  }
  return samples;
}

export function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || fromRate <= 0 || toRate <= 0) return input;
  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += input[j] ?? 0;
      count += 1;
    }
    out[i] = count === 0 ? 0 : sum / count;
  }
  return out;
}

export function pcm16ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0);
  return btoa(binary);
}

export function base64ToPcm16(audio: string): Uint8Array {
  const binary = atob(audio);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function safeBillId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!id || id.length > 80 || id.includes("/") || id.includes("\\") || id.includes("..")) return null;
  return id;
}

function roleOf(value: unknown): "user" | "assistant" | null {
  return value === "user" || value === "assistant" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function byTurn(lines: TranscriptLine[]): TranscriptLine[] {
  return [...lines].sort((a, b) => a.turn - b.turn);
}
