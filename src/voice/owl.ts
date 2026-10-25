/**
 * Owl mascot poses. Presentation only: the voice session still owns status.
 */
import type { VoiceStatus } from "@/voice/session";

export const IDLE_SLEEP_MS = 8000;
export const BEAK_RMS_THRESHOLD = 0.045;
export const BEAK_RMS_GAIN = 5.5;
export const BEAK_LEVEL_MIX = 0.35;

export type OwlPose = "idle" | "sleepy" | "connecting" | "listening" | "thinking" | "speaking" | "disabled";

export type OwlEyes = "open" | "sleepy" | "wide" | "up" | "closed";
export type OwlWing = "rest" | "cup" | "gesture";
export type OwlHead = "rest" | "tilt" | "shake";
export type OwlWaves = "none" | "ear" | "beak";
export type OwlBlink = "none" | "normal" | "fast";
export type OwlBeak = "closed" | "level" | "flap";

export interface OwlMotion {
  breathe: boolean;
  blink: OwlBlink;
  wing: OwlWing;
  waves: OwlWaves;
  eyes: OwlEyes;
  head: OwlHead;
  dots: boolean;
  beak: OwlBeak;
}

export function idleSleepy(elapsedMs: number, hovering: boolean): boolean {
  if (hovering) return false;
  return elapsedMs >= IDLE_SLEEP_MS;
}

export function owlPose(input: {
  status: VoiceStatus;
  blocked: boolean;
  sleepy: boolean;
  awaitingAgent: boolean;
}): OwlPose {
  if (input.blocked) return "disabled";
  if (input.status === "connecting") return "connecting";
  if (input.awaitingAgent && (input.status === "listening" || input.status === "speaking")) return "thinking";
  if (input.status === "speaking") return "speaking";
  if (input.status === "listening") return "listening";
  if (input.sleepy) return "sleepy";
  return "idle";
}

const MOTION: Record<OwlPose, OwlMotion> = {
  idle: { breathe: true, blink: "normal", wing: "rest", waves: "none", eyes: "open", head: "rest", dots: false, beak: "closed" },
  sleepy: { breathe: true, blink: "none", wing: "rest", waves: "none", eyes: "sleepy", head: "rest", dots: false, beak: "closed" },
  connecting: { breathe: false, blink: "none", wing: "rest", waves: "none", eyes: "wide", head: "shake", dots: false, beak: "closed" },
  listening: { breathe: true, blink: "normal", wing: "cup", waves: "ear", eyes: "open", head: "tilt", dots: false, beak: "closed" },
  thinking: { breathe: false, blink: "normal", wing: "rest", waves: "none", eyes: "up", head: "rest", dots: true, beak: "closed" },
  speaking: { breathe: true, blink: "fast", wing: "gesture", waves: "beak", eyes: "open", head: "rest", dots: false, beak: "level" },
  disabled: { breathe: false, blink: "none", wing: "rest", waves: "none", eyes: "closed", head: "rest", dots: false, beak: "closed" },
};

/** Reduced motion keeps blinks and the beak, and drops body, head, and wing motion. */
export function owlMotion(pose: OwlPose, reducedMotion: boolean, hasAnalyser: boolean): OwlMotion {
  const motion = MOTION[pose];
  const beak: OwlBeak = pose === "speaking" ? (hasAnalyser ? "level" : "flap") : "closed";
  if (!reducedMotion) return { ...motion, beak };
  return {
    ...motion,
    breathe: false,
    wing: "rest",
    head: "rest",
    beak,
  };
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
