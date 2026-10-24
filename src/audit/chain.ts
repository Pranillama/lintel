import type { AuditEvent } from "@/types/bill";

export const GENESIS_HASH = "0".repeat(64);

export async function hashEvent(
  _prevHash: string,
  _event: Pick<AuditEvent, "bill_id" | "seq" | "ts" | "actor" | "action" | "decision" | "rationale">,
): Promise<string> {
  throw new Error("Not implemented");
}

export async function verifyChain(_events: AuditEvent[]): Promise<boolean> {
  throw new Error("Not implemented");
}
