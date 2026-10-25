/**
 * Plain-language labels for an operator: confidence as a word, audit actors as
 * people and systems, audit actions as short titles. Display only, never logic.
 */
import { POLICY } from "@/seed/policy";
import type { AuditAction, AuditEvent, BillView, CheckResult, PaymentRail } from "@/types/bill";
import { APPROVER_LABEL, CHECK_LABEL } from "../desk/contract";
import { RAIL_LABEL } from "../desk/story";

export type ConfidenceWord = "Sure" | "Double-check" | "Unsure";

/** Below the engine's own floor is "Unsure" (the engine holds those); the band just above it is "Double-check". */
export function confidenceWord(c: number): ConfidenceWord {
  if (c < POLICY.MIN_FIELD_CONFIDENCE) return "Unsure";
  return c < 0.95 ? "Double-check" : "Sure";
}

export const ACTION_TITLE: Record<AuditAction, string> = {
  INTAKE: "Bill received",
  EXTRACT_FIELDS: "Read the bill",
  RESOLVE_VENDOR: "Found the vendor",
  RESOLVE_PROPERTY: "Matched the property",
  CHECK: "Check",
  VERIFY_VENDOR: "Checked the vendor's identity",
  DECISION: "Decided",
  ROUTE_PAYMENT: "Approved for payment",
  INVESTIGATION_STARTED: "Started a follow-up",
  INVESTIGATION_COMPLETED: "Drafted a follow-up",
  INVESTIGATION_FAILED: "Follow-up failed",
  HUMAN_ASSIGN_PROPERTY: "Assigned a property",
  ALIAS_STORED: "Remembered this address",
  HUMAN_APPROVE: "Approved",
  HUMAN_REJECT: "Rejected",
  DRAFT_SENT: "Sent the draft",
};

const checkId = (e: AuditEvent): CheckResult["id"] | null => {
  const id = e.data.check_id;
  return typeof id === "string" && id in CHECK_LABEL ? (id as CheckResult["id"]) : null;
};

export function eventTitle(e: AuditEvent): string {
  const id = checkId(e);
  return e.action === "CHECK" && id ? `${CHECK_LABEL[id]} check` : ACTION_TITLE[e.action];
}

export type ActorKind = "AI" | "CODE" | "PERSON" | "OUTSIDE";

/** Who did it, as an operator would say it. No login exists, so people are "A person" plus the role they acted as. */
export function actorOf(e: AuditEvent, bill: Pick<BillView, "investigation">): { label: string; kind: ActorKind } {
  switch (e.actor) {
    case "AI_EXTRACTION": return { label: "Claude", kind: "AI" };
    case "AI_INVESTIGATOR": return { label: bill.investigation?.provider === "CREAO" ? "CREAO agent" : "Claude", kind: "AI" };
    case "DETERMINISTIC_RULE": return { label: "Lintel's rules", kind: "CODE" };
    case "PAYMENT_ROUTER": return { label: "Lintel's payment router", kind: "CODE" };
    case "SYSTEM_FEED": return { label: "Bill feed", kind: "CODE" };
    case "CRS_SANDBOX": return { label: "CRS identity check", kind: "OUTSIDE" };
    case "HUMAN_INPUT": return { label: "A person (typed it in)", kind: "PERSON" };
    case "HUMAN_ALIAS": return { label: "A person (taught earlier)", kind: "PERSON" };
    case "HUMAN_OPERATOR": {
      const role = e.data.approver;
      return { label: typeof role === "string" && role in APPROVER_LABEL ? `A person, as ${APPROVER_LABEL[role as keyof typeof APPROVER_LABEL]}` : "A person", kind: "PERSON" };
    }
  }
}

const MATCHED_BY: Record<BillView["match"]["method"], string> = {
  EXACT_ACCOUNT: "by account number",
  ADDRESS: "by address",
  HUMAN_ALIAS: "by an address a person taught",
  HUMAN_ASSIGNED: "by a person",
  UNRESOLVED: "",
};

/**
 * The row's note in words. A few rows store codes and ids for the hash chain
 * (e.g. "EXACT_ACCOUNT PROP-002 1.00"); those are said with the bill's names instead.
 */
export function eventNote(e: AuditEvent, bill: Pick<BillView, "vendor_name" | "property_name" | "match" | "source">): string {
  switch (e.action) {
    case "INTAKE":
      return e.rationale === bill.source ? (bill.source === "FORM" ? "Typed in." : bill.source === "DOCUMENT" ? "Uploaded." : "From the feed.") : e.rationale;
    case "RESOLVE_VENDOR":
      return e.decision === "PASS" ? `It's ${bill.vendor_name ?? "a known vendor"}.` : "Not in the vendor file.";
    case "RESOLVE_PROPERTY":
      return e.decision === "PASS" && bill.property_name ? `${bill.property_name}, ${MATCHED_BY[bill.match.method]}.`.replace(", .", ".") : "No property matched closely enough.";
    case "ROUTE_PAYMENT": {
      const rail = e.rationale.split(" ")[0] as PaymentRail;
      return rail in RAIL_LABEL ? `Via ${RAIL_LABEL[rail]}${e.rationale.includes("LIVE_TESTNET") ? " (testnet)" : ""}.` : e.rationale;
    }
    case "ALIAS_STORED":
      return "The next bill printed this way matches on its own.";
    case "HUMAN_APPROVE": {
      const i = e.rationale.indexOf(": ");
      return i >= 0 ? e.rationale.slice(i + 2) : "";
    }
    default:
      return e.rationale;
  }
}
