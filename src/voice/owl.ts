/**
 * Owl-face math for the lime orb. Presentation only: the voice session still owns status.
 * Beak open amount is the same RMS mapping as the full owl mascot.
 */
import type { VoiceStatus } from "@/voice/session";

export const IDLE_SLEEP_MS = 8000;
export const BEAK_RMS_THRESHOLD = 0.045;
export const BEAK_RMS_GAIN = 5.5;
export const BEAK_LEVEL_MIX = 0.35;

export type OrbLids = "open" | "sleepy" | "closed";
export type OrbBlink = "none" | "normal" | "fast";
export type OrbBeak = "closed" | "level" | "flap";

export interface OrbFace {
  lids: OrbLids;
  blink: OrbBlink;
  beak: OrbBeak;
}

export function idleSleepy(elapsedMs: number, hovering: boolean): boolean {
  if (hovering) return false;
  return elapsedMs >= IDLE_SLEEP_MS;
}

/** Reduced motion still returns blinks and the beak. Body motion is dropped in CSS. */
export function orbFace(input: {
  status: VoiceStatus;
  blocked: boolean;
  sleepy: boolean;
  hasAnalyser: boolean;
}): OrbFace {
  if (input.blocked) return { lids: "closed", blink: "none", beak: "closed" };
  const blink: OrbBlink = input.sleepy ? "none" : input.status === "speaking" ? "fast" : "normal";
  const lids: OrbLids = input.sleepy ? "sleepy" : "open";
  const beak: OrbBeak = input.status === "speaking" ? (input.hasAnalyser ? "level" : "flap") : "closed";
  return { lids, blink, beak };
}

/** Byte time-domain samples are 0–255, with silence at 128. */
export function timeDomainRms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const centered = ((samples[i] ?? 128) - 128) / 128;
    sum += centered * centered;
  }
  return Math.sqrt(sum / samples.length);
}

/** 0 is a closed beak. Levels at or under the threshold stay closed. */
export function beakOpenFromLevel(rms: number, threshold = BEAK_RMS_THRESHOLD, gain = BEAK_RMS_GAIN): number {
  if (!Number.isFinite(rms) || rms <= threshold) return 0;
  return Math.min(1, (rms - threshold) * gain);
}

export function smoothLevel(previous: number, sample: number, mix = BEAK_LEVEL_MIX): number {
  const from = Number.isFinite(previous) ? previous : 0;
  const to = Number.isFinite(sample) ? sample : 0;
  const weight = Math.min(1, Math.max(0, mix));
  return from + (to - from) * weight;
}
