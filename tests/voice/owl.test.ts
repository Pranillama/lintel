import { describe, expect, it } from "vitest";
import {
  BEAK_RMS_THRESHOLD,
  IDLE_SLEEP_MS,
  beakOpenFromLevel,
  idleSleepy,
  orbFace,
  smoothLevel,
  timeDomainRms,
} from "@/voice/owl";

describe("idle to sleepy", () => {
  it("waits 8s, then sleeps, and wakes on hover", () => {
    expect(idleSleepy(0, false)).toBe(false);
    expect(idleSleepy(IDLE_SLEEP_MS - 1, false)).toBe(false);
    expect(idleSleepy(IDLE_SLEEP_MS, false)).toBe(true);
    expect(idleSleepy(20_000, true)).toBe(false);
  });
});

describe("orb face", () => {
  const base = { blocked: false, sleepy: false, hasAnalyser: false };

  it("blinks slowly until speech, then opens the beak from audio", () => {
    expect(orbFace({ ...base, status: "idle" })).toEqual({ lids: "open", blink: "normal", beak: "closed" });
    expect(orbFace({ ...base, status: "listening" })).toMatchObject({ lids: "open", blink: "normal", beak: "closed" });
    expect(orbFace({ ...base, status: "speaking", hasAnalyser: true })).toEqual({ lids: "open", blink: "fast", beak: "level" });
    expect(orbFace({ ...base, status: "speaking" }).beak).toBe("flap");
  });

  it("half-closes when sleepy and shuts when disabled", () => {
    expect(orbFace({ ...base, status: "idle", sleepy: true })).toEqual({ lids: "sleepy", blink: "none", beak: "closed" });
    expect(orbFace({ ...base, status: "speaking", blocked: true, hasAnalyser: true })).toEqual({ lids: "closed", blink: "none", beak: "closed" });
  });

  it("keeps blinks and the beak when motion is reduced", () => {
    expect(orbFace({ ...base, status: "speaking", hasAnalyser: true })).toMatchObject({ blink: "fast", beak: "level" });
    expect(orbFace({ ...base, status: "idle" }).blink).toBe("normal");
  });
});

describe("beak from audio level", () => {
  it("treats silence as a closed beak and clamps loud peaks", () => {
    expect(beakOpenFromLevel(0)).toBe(0);
    expect(beakOpenFromLevel(BEAK_RMS_THRESHOLD)).toBe(0);
    expect(beakOpenFromLevel(BEAK_RMS_THRESHOLD + 0.1)).toBeGreaterThan(0);
    expect(beakOpenFromLevel(BEAK_RMS_THRESHOLD + 0.1)).toBeLessThan(1);
    expect(beakOpenFromLevel(2)).toBe(1);
    expect(beakOpenFromLevel(Number.NaN)).toBe(0);
  });

  it("reads RMS from analyser bytes and smooths it", () => {
    expect(timeDomainRms([])).toBe(0);
    expect(timeDomainRms([128, 128, 128])).toBe(0);
    expect(timeDomainRms([0, 255])).toBeGreaterThan(0.99);
    expect(smoothLevel(0, 1, 0.5)).toBeCloseTo(0.5);
    expect(smoothLevel(0.2, 0.2, 0.35)).toBeCloseTo(0.2);
  });
});
