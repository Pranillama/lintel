import type { AuditEvent } from "@/types/bill";
import { GENESIS_HASH, hashEvent } from "./chain";

type Draft = Omit<AuditEvent, "id" | "seq" | "prev_hash" | "hash">;

/** Assign seq and hashes after the bill's last event. The mutation inserts the result. */
export async function appendEvents(previous: Pick<AuditEvent, "seq" | "hash"> | null, drafts: Draft[]): Promise<AuditEvent[]> {
  const events: AuditEvent[] = [];
  let prevHash = previous?.hash ?? GENESIS_HASH;
  let seq = previous?.seq ?? 0;
  for (const draft of drafts) {
    seq += 1;
    const hashed = { ...draft, seq, prev_hash: prevHash };
    const hash = await hashEvent(prevHash, hashed);
    const event: AuditEvent = { ...hashed, id: `${draft.bill_id}:${seq}`, hash };
    events.push(event);
    prevHash = hash;
  }
  return events;
}
