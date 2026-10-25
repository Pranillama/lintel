/**
 * Speakable facts for one stored bill.
 * Pure: no model, no clock, no IO. Dollars come from the engine's formatter.
 * The voice agent may repeat this object. It is not a decision.
 */
import { formatUsd } from "@/engine/format";
import type { ApproverRole, BillRecord, BillStatus, CheckResult, Decision } from "@/types/bill";

/** How many engine sentences to hand the caller. The first is decision.why. */
export const MAX_REASONS = 3;

export interface BillFacts {
  bill_id: string;
  vendor: string | null;
  property: string | null;
  /** "$5,680.00", or null when the stored amount is null. */
  amount: string | null;
  status: BillStatus;
  /** Plain-English engine sentences. reasons[0] is decision.why, verbatim. */
  reasons: string[];
  /** "VP Finance", "Property manager", "Operator", or null when nobody is required. */
  required_approver: string | null;
  /** Who acts next. Always a person, or nobody, never the voice agent. */
  next_step: string;
}

const APPROVER_LABEL: Record<ApproverRole, string | null> = {
  NONE: null,
  OPERATOR: "Operator",
  PROPERTY_MANAGER: "Property manager",
  VP_FINANCE: "VP Finance",
};

export function buildBillFacts(bill: BillRecord): BillFacts {
  const required = APPROVER_LABEL[bill.decision.required_approver];
  return {
    bill_id: bill.id,
    vendor: bill.vendor_name,
    property: bill.property_name,
    amount: bill.amount === null ? null : formatUsd(bill.amount),
    status: bill.status,
    reasons: speakableReasons(bill.decision),
    required_approver: required,
    next_step: nextStep(bill.status, required),
  };
}

export function speakableReasons(decision: Decision): string[] {
  const reasons: string[] = [];
  const why = decision.why.trim();
  if (why) reasons.push(why);
  for (const check of decision.checks) {
    if (reasons.length >= MAX_REASONS) break;
    const line = failingLine(check);
    if (!line) continue;
    if (reasons.some((existing) => existing.includes(line))) continue;
    reasons.push(line);
  }
  return reasons.length > 0 ? reasons : ["No reason was stored."];
}

function failingLine(check: CheckResult): string | null {
  if (check.outcome !== "HALT" && check.outcome !== "BLOCK") return null;
  const text = check.rationale.trim();
  return text.length > 0 ? text : null;
}

function nextStep(status: BillStatus, approver: string | null): string {
  switch (status) {
    case "CLEARED":
      return "Cleared for payment. No one needs to approve it.";
    case "HELD":
      return approver
        ? `Held for ${approver}. A person has to approve or reject it.`
        : "Held for a person. A person has to approve or reject it.";
    case "BLOCKED":
      return "Blocked. This bill will not be paid. A person owns the exception.";
    case "REJECTED":
      return "A person rejected this bill. Nothing will be paid.";
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}
