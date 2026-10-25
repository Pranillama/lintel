import type { Actor, AuditEvent, CrsResult, Decision, ExtractedBill, IntakeSource, MatchResult } from "@/types/bill";

type Draft = Omit<AuditEvent, "id" | "seq" | "prev_hash" | "hash">;

/** Audit rows for one decision, in the order anmol-spec §4 requires. */
export function decisionAuditDrafts(input: {
  bill_id: string;
  ts: string;
  source: IntakeSource;
  source_label: string | null;
  extracted: ExtractedBill;
  match: MatchResult;
  crs: CrsResult;
  decision: Decision;
}): Draft[] {
  const { bill_id, ts, source, extracted, match, crs, decision } = input;
  const base = { bill_id, ts, data: {} as Record<string, unknown> };
  const intakeActor: Actor = source === "DOCUMENT" ? "AI_EXTRACTION" : source === "FEED" ? "SYSTEM_FEED" : "HUMAN_INPUT";
  const drafts: Draft[] = [
    { ...base, actor: intakeActor, action: "INTAKE", decision: "INFO", rationale: input.source_label ?? source },
    {
      ...base,
      actor: source === "DOCUMENT" ? "AI_EXTRACTION" : "DETERMINISTIC_RULE",
      action: "EXTRACT_FIELDS",
      decision: extracted.extraction_error ? "HALT" : "PASS",
      rationale: extracted.extraction_error ?? "Fields stored.",
    },
    {
      ...base,
      actor: "DETERMINISTIC_RULE",
      action: "RESOLVE_VENDOR",
      decision: match.vendor_id ? "PASS" : "HALT",
      rationale: match.vendor_id ? `${match.vendor_match} ${match.vendor_id}` : "Unknown vendor.",
    },
    {
      ...base,
      actor: match.method === "HUMAN_ALIAS" ? "HUMAN_ALIAS" : "DETERMINISTIC_RULE",
      action: "RESOLVE_PROPERTY",
      decision: match.property_id ? "PASS" : "HALT",
      rationale: match.property_id ? `${match.method} ${match.property_id} ${match.confidence.toFixed(2)}` : "Unresolved property.",
    },
  ];
  for (const check of decision.checks) {
    drafts.push({
      ...base,
      actor: "DETERMINISTIC_RULE",
      action: "CHECK",
      decision: check.outcome === "SKIP" ? "INFO" : check.outcome,
      rationale: check.rationale,
      data: { check_id: check.id, ...check.data },
    });
  }
  if (crs.outcome !== "NOT_RUN") {
    drafts.push({
      ...base,
      actor: "CRS_SANDBOX",
      action: "VERIFY_VENDOR",
      decision: crs.outcome === "PASS" ? "PASS" : crs.outcome === "FLAGGED" ? "BLOCK" : "HALT",
      rationale: crs.detail,
    });
  }
  drafts.push({
    ...base,
    actor: "DETERMINISTIC_RULE",
    action: "DECISION",
    decision: decision.status === "BLOCKED" ? "BLOCK" : decision.status === "CLEARED" ? "PASS" : "HALT",
    rationale: decision.why,
  });
  if (decision.status === "CLEARED" && decision.rail) {
    drafts.push({
      ...base,
      actor: "PAYMENT_ROUTER",
      action: "ROUTE_PAYMENT",
      decision: "EXECUTE",
      rationale: `${decision.rail} APPROVED_FOR_PAYMENT`,
    });
  }
  return drafts;
}
