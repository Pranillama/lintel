/**
 * Transcript card open/close. Closing the card does not end the voice session;
 * the session status and the lines stay with the caller.
 */
import type { VoiceStatus } from "@/voice/session";

export type TranscriptDockAction = "show" | "hide" | "escape";

export function reduceTranscriptOpen(open: boolean, action: TranscriptDockAction): boolean {
  return action === "show";
}

/** The pill is up once a session has left idle, or once any transcript lines exist, and the card is closed. */
export function transcriptPillVisible(open: boolean, status: VoiceStatus, lineCount: number): boolean {
  if (open) return false;
  return status !== "idle" || lineCount > 0;
}
