import { describe, expect, it } from "vitest";
import { reduceTranscriptOpen, transcriptPillVisible } from "@/voice/transcriptDock";

describe("transcript dock", () => {
  it("shows the pill once a session is live or a transcript exists", () => {
    expect(transcriptPillVisible(false, "idle", 0)).toBe(false);
    expect(transcriptPillVisible(false, "connecting", 0)).toBe(true);
    expect(transcriptPillVisible(false, "listening", 0)).toBe(true);
    expect(transcriptPillVisible(false, "speaking", 1)).toBe(true);
    expect(transcriptPillVisible(false, "idle", 2)).toBe(true);
  });

  it("hides the pill while the card is open", () => {
    expect(transcriptPillVisible(true, "listening", 2)).toBe(false);
    expect(transcriptPillVisible(true, "idle", 2)).toBe(false);
  });

  it("opens from the pill and closes on hide or escape", () => {
    expect(reduceTranscriptOpen(false, "show")).toBe(true);
    expect(reduceTranscriptOpen(true, "show")).toBe(true);
    expect(reduceTranscriptOpen(true, "hide")).toBe(false);
    expect(reduceTranscriptOpen(true, "escape")).toBe(false);
    expect(reduceTranscriptOpen(false, "escape")).toBe(false);
  });

  it("leaves session state alone: close only returns the open flag", () => {
    const stillListening = transcriptPillVisible(reduceTranscriptOpen(true, "escape"), "listening", 2);
    expect(stillListening).toBe(true);
    expect(transcriptPillVisible(reduceTranscriptOpen(true, "hide"), "idle", 2)).toBe(true);
  });
});
