/**
 * Mints a short-lived browser token for the Lintel Reviewer.
 * CARTESIA_API_KEY stays in the Convex environment. The browser only receives the access token.
 */
import { action } from "../_generated/server";
import { reviewerSocketUrl } from "../../src/voice/session";

const TOKEN_URL = "https://api.cartesia.ai/access-token";
const VERSION = "2026-08-14";
const EXPIRES_IN = 300;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export const startVoiceSession = action({
  args: {},
  handler: async () => {
    const key = process.env.CARTESIA_API_KEY;
    const agentId = process.env.CARTESIA_REVIEWER_AGENT_ID;
    if (!key || !agentId) return { ok: false as const, reason: "Voice is not configured." };
    let response: Response;
    try {
      response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Cartesia-Version": VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ grants: { agent: true }, expires_in: EXPIRES_IN }),
      });
    } catch (err) {
      console.error("[voice] access token request failed", err instanceof Error ? err.message : "unknown");
      return { ok: false as const, reason: "Voice is unavailable right now." };
    }
    if (!response.ok) {
      console.error("[voice] access token rejected", response.status);
      return { ok: false as const, reason: "Voice is unavailable right now." };
    }
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      return { ok: false as const, reason: "Voice is unavailable right now." };
    }
    const token = isRecord(parsed) && typeof parsed.token === "string" ? parsed.token : null;
    if (!token) return { ok: false as const, reason: "Voice is unavailable right now." };
    return {
      ok: true as const,
      agent_id: agentId,
      expires_in: EXPIRES_IN,
      websocket_url: reviewerSocketUrl(agentId, token),
    };
  },
});
