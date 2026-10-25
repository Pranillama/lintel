import { describe, expect, it } from "vitest";
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
  reviewerSocketUrl,
  sessionCreateMessage,
  statusAfter,
} from "@/voice/session";

describe("voice session messages", () => {
  it("opens the documented browser socket and session", () => {
    expect(reviewerSocketUrl("agent 1", "tok/en")).toBe(
      "wss://api.cartesia.ai/v1/agents/websocket/agent%201?cartesia_version=2026-08-14&access_token=tok%2Fen",
    );
    expect(sessionCreateMessage()).toEqual({
      type: "session_create",
      audio: { input_format: "pcm_16000", output_delivery: "speaking_pace", continuous_input: true },
    });
    expect(audioInputMessage("abc")).toEqual({ type: "audio_input", audio: "abc" });
    expect(clientToolResultMessage("call_1", "{\"bill_id\":\"BILL-1\"}", false).type).toBe("client_tool_result");
  });

  it("parses ready, audio, barge-in, turns, and errors", () => {
    expect(parseServerEvent("{\"type\":\"session_ready\",\"call_id\":\"ac_1\"}")).toEqual({ type: "session_ready", call_id: "ac_1" });
    expect(parseServerEvent("{\"type\":\"audio_output_clear\"}")).toEqual({ type: "audio_output_clear" });
    expect(parseServerEvent("{\"type\":\"turn_output_text_delta\",\"turn\":4,\"role\":\"assistant\",\"text\":\" world\"}")).toEqual({
      type: "turn_output_text_delta",
      turn: 4,
      text: " world",
    });
    expect(parseServerEvent("{\"type\":\"error\",\"code\":\"invalid_event\",\"message\":\"nope\",\"fatal\":false}")).toEqual({
      type: "error",
      message: "nope",
      fatal: false,
    });
    expect(parseServerEvent("not-json").type).toBe("error");
    expect(parseServerEvent("{\"type\":\"dtmf_output\"}").type).toBe("ignore");
  });

  it("builds a transcript from deltas and replaces it with the final turn", () => {
    let lines = applyTranscript([], { type: "turn_started", turn: 2, role: "assistant" });
    lines = applyTranscript(lines, { type: "turn_output_text_delta", turn: 2, text: "Held" });
    lines = applyTranscript(lines, { type: "turn_output_text_delta", turn: 2, text: " for VP Finance." });
    expect(lines[0]?.text).toBe("Held for VP Finance.");
    lines = applyTranscript(lines, { type: "turn_ended", turn: 1, role: "user", text: "Why is EBMUD held?" });
    expect(lines.map((line) => line.text)).toEqual(["Why is EBMUD held?", "Held for VP Finance."]);
    expect(lines[0]?.pending).toBe(false);
    expect(lines[1]?.pending).toBe(true);
    lines = applyTranscript(lines, { type: "turn_ended", turn: 2, role: "assistant", text: "Held for VP Finance." });
    expect(lines[1]?.pending).toBe(false);
    expect(applyTranscript(lines, { type: "audio_output_clear" })).toEqual(lines);
    expect(statusAfter({ type: "audio_output", audio: "xx" }, "listening")).toBe("speaking");
    expect(statusAfter({ type: "audio_output_clear" }, "speaking")).toBe("listening");
  });
});

describe("voice client tools", () => {
  it("returns the open bill and navigates without changing data", () => {
    expect(answerClientTool("get_selected_bill", {}, "BILL-103")).toEqual({
      result: "{\"bill_id\":\"BILL-103\"}",
      isError: false,
      navigateTo: null,
    });
    expect(answerClientTool("show_bill", { bill_id: "BILL 104" }, "BILL-103")).toEqual({
      result: "{\"ok\":true,\"bill_id\":\"BILL 104\"}",
      isError: false,
      navigateTo: "/bills/BILL%20104",
    });
    expect(answerClientTool("show_bill", {}, "BILL-103").isError).toBe(true);
    const refused = answerClientTool("approve", { bill_id: "BILL-103" }, "BILL-103");
    expect(refused.isError).toBe(true);
    expect(refused.navigateTo).toBeNull();
    expect(answerClientTool("show_bill", { bill_id: "../inbox" }, "BILL-103").navigateTo).toBeNull();
  });
});

describe("pcm audio", () => {
  it("round-trips 16-bit samples and averages a downsample", () => {
    const pcm = floatsToPcm16(new Float32Array([0, 1, -1]));
    expect(Array.from(pcm)).toEqual([0, 0, 255, 127, 0, 128]);
    expect(Array.from(pcm16ToFloat(pcm)).map((n) => Math.round(n))).toEqual([0, 1, -1]);
    expect(base64ToPcm16(pcm16ToBase64(pcm))).toEqual(pcm);
    expect(Array.from(downsample(new Float32Array([0, 1, 0.5, 0.5]), 4, 2))).toEqual([0.5, 0.5]);
  });
});
