import type { AuditEvent } from "@/types/bill";

export const GENESIS_HASH = "0".repeat(64);

type HashInput = Pick<AuditEvent, "bill_id" | "seq" | "ts" | "actor" | "action" | "decision" | "rationale">;

/**
 * sha256(prev_hash|bill_id|seq|ts|actor|action|decision|rationale).
 * Web Crypto so a Convex mutation can hash inside the same transaction.
 */
export async function hashEvent(prevHash: string, event: HashInput): Promise<string> {
  const payload = [prevHash, event.bill_id, String(event.seq), event.ts, event.actor, event.action, event.decision, event.rationale].join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyChain(events: AuditEvent[]): Promise<boolean> {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  let prev = GENESIS_HASH;
  for (const event of ordered) {
    if (event.prev_hash !== prev) return false;
    const hash = await hashEvent(event.prev_hash, event);
    if (hash !== event.hash) return false;
    prev = event.hash;
  }
  return true;
}
