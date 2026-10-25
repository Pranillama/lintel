import { describe, expect, it } from "vitest";
import {
  BEAK_RMS_THRESHOLD,
  IDLE_SLEEP_MS,
  beakOpenFromLevel,
  idleSleepy,
  owlMotion,
  owlPose,
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

describe("owl pose", () => {
  const base = { blocked: false, sleepy: false, awaitingAgent: false };

  it("maps each voice state onto a pose", () => {
    expect(owlPose({ ...base, status: "idle" })).toBe("idle");
    expect(owlPose({ ...base, status: "idle", sleepy: true })).toBe("sleepy");
    expect(owlPose({ ...base, status: "connecting" })).toBe("connecting");
    expect(owlPose({ ...base, status: "listening" })).toBe("listening");
    expect(owlPose({ ...base, status: "listening", awaitingAgent: true })).toBe("thinking");
    expect(owlPose({ ...base, status: "speaking", awaitingAgent: true })).toBe("thinking");
    expect(owlPose({ ...base, status: "speaking" })).toBe("speaking");
    expect(owlPose({ ...base, status: "speaking", blocked: true })).toBe("disabled");
  });
});

describe("owl motion", () => {
  it("cups a wing while listening and opens the beak from audio while speaking", () => {
    expect(owlMotion("listening", false, false)).toMatchObject({ wing: "cup", waves: "ear", head: "tilt", blink: "normal" });
    expect(owlMotion("speaking", false, true)).toMatchObject({ beak: "level", blink: "fast", wing: "gesture", waves: "beak" });
    expect(owlMotion("speaking", false, false).beak).toBe("flap");
    expect(owlMotion("thinking", false, false)).toMatchObject({ eyes: "up", dots: true });
    expect(owlMotion("connecting", false, false)).toMatchObject({ eyes: "wide", head: "shake" });
    expect(owlMotion("sleepy", false, false).eyes).toBe("sleepy");
    expect(owlMotion("disabled", false, false)).toMatchObject({ eyes: "closed", breathe: false });
  });

  it("keeps blinks and the beak when motion is reduced", () => {
    const speaking = owlMotion("speaking", true, true);
    expect(speaking.blink).toBe("fast");
    expect(speaking.beak).toBe("level");
    expect(speaking.breathe).toBe(false);
    expect(speaking.wing).toBe("rest");
    expect(speaking.head).toBe("rest");
    expect(owlMotion("listening", true, false)).toMatchObject({ blink: "normal", wing: "rest", head: "rest", waves: "ear" });
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
