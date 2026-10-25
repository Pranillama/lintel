import type { BillRecord, InvestigationBrief, ReasonCode } from "@/types/bill";
import { PRIORITY_2 } from "./decide";

export type HumanKind = "assign" | "approve" | "reject" | "send-draft";

/** Returns the drawer message when the action is illegal. master-spec §5.2 and anmol-spec §4. */
export function humanRefusal(
  bill: Pick<BillRecord, "status" | "decision">,
  kind: HumanKind,
  brief: Pick<InvestigationBrief, "status" | "draft"> | null,
): string | null {
  // A drafted follow-up belongs to an open exception: sendable while HELD or BLOCKED, stale once a person resolved it.
  if (kind === "send-draft") {
    if (brief?.status !== "DONE" || brief.draft === null) return "There is no draft to send.";
    if (bill.status !== "HELD" && bill.status !== "BLOCKED") return "This bill is resolved, so the draft is out of date.";
    return null;
  }
  if (bill.status === "BLOCKED") return "Blocked bills have no pay or approve control.";
  if (kind === "assign") {
    if (bill.status !== "HELD" || !bill.decision.reasons.includes("NEEDS_PROPERTY_MATCH")) {
      return "Assign is only for a held bill that needs a property.";
    }
    return null;
  }
  if (kind === "approve") {
    if (bill.status !== "HELD") return "Approve is only for a held bill.";
    if (bill.decision.reasons.some((code) => PRIORITY_2.includes(code))) {
      return "Fields and property must be trusted before approval.";
    }
    return null;
  }
  if (bill.status !== "HELD") return "Reject is only for a held bill.";
  return null;
}

export function hasPriority2(reasons: ReasonCode[]): boolean {
  return reasons.some((code) => PRIORITY_2.includes(code));
}
