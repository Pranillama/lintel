/**
 * Investigator. CREAO first when both server env vars are set; any failure
 * falls back to Claude. Draft kind is chosen here, not by the model.
 * pranil-spec §4. Never rejects.
 */
import type {
  ApproverRole,
  DraftAction,
  DraftKind,
  InvestigationBrief,
  InvestigationContext,
  InvestigateFn,
  PropertyId,
  ReasonCode,
} from "@/types/bill";
import { runCreao, type InvestigationOutput } from "@/integrations/creao/client";
import { draftWithClaude } from "./claude";

type Audience = "VENDOR" | "MAINTENANCE" | "OPERATOR" | "MANAGER" | "APPROVER";

interface MappedDraft {
  kind: DraftKind;
  audience: Audience;
  instruction: string;
}

interface ReasonMeta {
  /** Lower rank wins. Same order as decide.ts PRIORITY, then the codes inside each bucket. */
  rank: number;
  mapped: MappedDraft | null;
}

interface DraftPlan {
  reason: ReasonCode;
  kind: DraftKind;
  to: string;
  instruction: string;
}

export const investigate: InvestigateFn = async (ctx) => {
  const started_at = new Date().toISOString();
  const creaoReady = Boolean(process.env.CREAO_API_KEY?.trim() && process.env.CREAO_AGENT_ID?.trim());
  if (creaoReady) {
    try {
      const creao = await runCreao(ctx);
      return doneBrief(ctx, "CREAO", creao.output, creao.creao_run_id, started_at);
    } catch (err) {
      console.error("[investigator] CREAO failed, falling back to Claude", err);
    }
  }
  try {
    const output = await draftWithClaude(ctx, systemPrompt(ctx));
    return doneBrief(ctx, "CLAUDE", output, null, started_at);
  } catch (err) {
    console.error("[investigator] Claude failed", err);
    return {
      bill_id: ctx.bill.id,
      status: "FAILED",
      provider: null,
      summary: "",
      findings: [],
      draft: null,
      creao_run_id: null,
      creao_share_url: null,
      error: errorMessage(err),
      started_at,
      completed_at: new Date().toISOString(),
      draft_sent: false,
    };
  }
};

function doneBrief(
  ctx: InvestigationContext,
  provider: "CREAO" | "CLAUDE",
  output: InvestigationOutput,
  creao_run_id: string | null,
  started_at: string,
): InvestigationBrief {
  return {
    bill_id: ctx.bill.id,
    status: "DONE",
    provider,
    summary: output.summary,
    findings: output.findings,
    draft: applyDraft(ctx, output),
    creao_run_id,
    creao_share_url: null,
    error: null,
    started_at,
    completed_at: new Date().toISOString(),
    draft_sent: false,
  };
}

function applyDraft(ctx: InvestigationContext, output: InvestigationOutput): DraftAction | null {
  const plan = planDraft(ctx);
  if (!plan || !output.draft) return null;
  return {
    kind: plan.kind,
    to: plan.to,
    subject: output.draft.subject,
    body: output.draft.body,
    suggested_property_id: plan.kind === "MATCH_SUGGESTION" ? suggestedPropertyId(ctx, output.draft.suggested_property_id) : null,
  };
}

/** Top reason is the lowest decide.ts priority rank present. An unmapped top reason drafts nothing. */
function planDraft(ctx: InvestigationContext): DraftPlan | null {
  let best: { reason: ReasonCode; meta: ReasonMeta } | null = null;
  for (const reason of ctx.bill.decision.reasons) {
    const meta = reasonMeta(reason);
    if (!best || meta.rank < best.meta.rank) best = { reason, meta };
  }
  if (!best?.meta.mapped) return null;
  return {
    reason: best.reason,
    kind: best.meta.mapped.kind,
    to: audienceLine(ctx, best.meta.mapped.audience),
    instruction: best.meta.mapped.instruction,
  };
}

function reasonMeta(reason: ReasonCode): ReasonMeta {
  switch (reason) {
    case "EXACT_DUPLICATE":
      return mapped(0, "VENDOR_EMAIL", "VENDOR", "Ask whether this invoice duplicates the prior one. Cite both invoice numbers, amounts, and dates.");
    case "FUZZY_DUPLICATE":
      return mapped(1, "VENDOR_EMAIL", "VENDOR", "Ask whether this invoice duplicates the prior one. Cite both invoice numbers, amounts, and dates.");
    case "LINE_SUM_MISMATCH":
      return mapped(2, "VENDOR_EMAIL", "VENDOR", "Ask for a corrected invoice. Cite the line-item sum and the printed total.");
    case "CRS_FLAGGED":
      return { rank: 3, mapped: null };
    case "MISSING_FIELD":
      return { rank: 4, mapped: null };
    case "LOW_CONFIDENCE":
      return { rank: 5, mapped: null };
    case "EXTRACTION_FAILED":
      return { rank: 6, mapped: null };
    case "NEEDS_PROPERTY_MATCH":
      return mapped(7, "MATCH_SUGGESTION", "OPERATOR", "Suggest the property and cite the match evidence. The operator still clicks Assign. Put that property id in suggested_property_id.");
    case "UNKNOWN_VENDOR":
      return mapped(8, "VENDOR_ONBOARDING", "MANAGER", "Request vendor onboarding: W-9, insurance, and verification.");
    case "VENDOR_ACCOUNT_CONFLICT":
      return { rank: 9, mapped: null };
    case "USAGE_SPIKE":
      return mapped(10, "WORK_ORDER", "MAINTENANCE", "Work order for maintenance: suspected leak or meter issue. Cite usage against the baseline and say approval is still required.");
    case "AMOUNT_SPIKE":
      return mapped(11, "WORK_ORDER", "MAINTENANCE", "Work order for maintenance: suspected leak or meter issue. Cite the amount against the baseline and say approval is still required.");
    case "NO_BASELINE":
      return mapped(12, "APPROVAL_REQUEST", "APPROVER", "Summarize the bill and the rule that requires approval. Do not approve it.");
    case "VENDOR_UNVERIFIED":
      return mapped(13, "VENDOR_ONBOARDING", "MANAGER", "Request vendor onboarding: W-9, insurance, and verification.");
    case "CRS_UNAVAILABLE":
      return { rank: 14, mapped: null };
    case "OVER_AUTO_PAY_LIMIT":
      return mapped(15, "APPROVAL_REQUEST", "APPROVER", "Summarize the bill and the auto-pay rule. Do not approve it.");
    case "UTILITY_NOT_ACCOUNT_MATCHED":
      return { rank: 16, mapped: null };
    default: {
      const neverReason: never = reason;
      return neverReason;
    }
  }
}

function mapped(rank: number, kind: DraftKind, audience: Audience, instruction: string): ReasonMeta {
  return { rank, mapped: { kind, audience, instruction } };
}

function audienceLine(ctx: InvestigationContext, audience: Audience): string {
  const property = ctx.property?.name ?? ctx.bill.property_name ?? "the portfolio";
  const vendor = ctx.vendor?.name ?? ctx.bill.vendor_name ?? "the vendor";
  switch (audience) {
    case "VENDOR":
      return `Vendor AP contact, ${vendor}`;
    case "MAINTENANCE":
      return `Maintenance, ${property}`;
    case "OPERATOR":
      return "AP operator";
    case "MANAGER":
      return `Property Manager, ${property}`;
    case "APPROVER":
      return approverLine(ctx.bill.decision.required_approver, property);
    default: {
      const neverAudience: never = audience;
      return neverAudience;
    }
  }
}

function approverLine(role: ApproverRole, property: string): string {
  switch (role) {
    case "VP_FINANCE":
      return `VP Finance, ${property}`;
    case "PROPERTY_MANAGER":
      return `Property Manager, ${property}`;
    case "OPERATOR":
      return `AP operator, ${property}`;
    case "NONE":
      return `AP operator, ${property}`;
    default: {
      const neverRole: never = role;
      return neverRole;
    }
  }
}

function suggestedPropertyId(ctx: InvestigationContext, proposed: string | null): PropertyId | null {
  const allowed = new Map<string, PropertyId>();
  const add = (id: PropertyId | null) => {
    if (id) allowed.set(id, id);
  };
  add(ctx.property?.id ?? null);
  add(ctx.bill.match.property_id);
  for (const candidate of ctx.bill.match.candidates) add(candidate.property_id);
  if (proposed && allowed.has(proposed)) return allowed.get(proposed) ?? null;
  const ranked = [...ctx.bill.match.candidates].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.property_id < b.property_id) return -1;
    if (a.property_id > b.property_id) return 1;
    return 0;
  });
  return ranked[0]?.property_id ?? ctx.bill.match.property_id ?? ctx.property?.id ?? null;
}

function systemPrompt(ctx: InvestigationContext): string {
  const plan = planDraft(ctx);
  const decision = plan
    ? `The top reason on this bill is ${plan.reason}. Write a draft of kind ${plan.kind} addressed to ${plan.to}. ${plan.instruction} suggested_property_id is ${plan.kind === "MATCH_SUGGESTION" ? "a property id taken from the context, or null if none fits" : "null"}.`
    : "This bill's top reason has no follow-up draft. Set draft to null.";
  return [
    "You write an investigation brief for a property accounts-payable operator.",
    "You cannot change the bill, approve it, pay it, or send anything.",
    "Use only facts in the InvestigationContext JSON in the user message. If a fact is missing, say it is not in the context.",
    "Cite amounts, quantities, dates, invoice numbers, and percents exactly as written in the context. Do not recompute them.",
    "Never recommend paying a BLOCKED bill. Blocked bills have no pay control.",
    "Never claim that an email, work order, approval, or any other message was sent.",
    "summary is 2 to 3 sentences.",
    "findings are short evidence bullets. Each bullet cites a fact from the context.",
    "draft.body is under 120 words, plain and professional.",
    "Respond with JSON only, no markdown fences, matching this shape:",
    '{"summary":string,"findings":string[],"draft":{"kind":"VENDOR_EMAIL"|"WORK_ORDER"|"APPROVAL_REQUEST"|"MATCH_SUGGESTION"|"VENDOR_ONBOARDING","to":string,"subject":string,"body":string,"suggested_property_id":string|null}|null}',
    "Which draft to write, by top reason:",
    "EXACT_DUPLICATE or FUZZY_DUPLICATE: VENDOR_EMAIL to the vendor AP contact, asking whether the invoice duplicates the prior one. Cite both invoice numbers, amounts, and dates.",
    "USAGE_SPIKE or AMOUNT_SPIKE: WORK_ORDER to maintenance at the property for a suspected leak or meter issue. Cite usage or amount against the baseline and say approval is still required.",
    "NEEDS_PROPERTY_MATCH: MATCH_SUGGESTION to the AP operator with suggested_property_id and the match evidence. The operator still clicks Assign.",
    "UNKNOWN_VENDOR or VENDOR_UNVERIFIED: VENDOR_ONBOARDING to the property manager, requesting a W-9, insurance, and verification.",
    "OVER_AUTO_PAY_LIMIT or NO_BASELINE: APPROVAL_REQUEST to the required approver, summarizing the bill and the rule.",
    "LINE_SUM_MISMATCH: VENDOR_EMAIL to the vendor AP contact, asking for a corrected invoice. Cite the line sum and the printed total.",
    "Any other top reason: draft is null.",
    decision,
    ctx.bill.status === "BLOCKED" ? "This bill is BLOCKED. Do not recommend paying it." : "Do not tell the operator to pay the bill from this draft.",
  ].join("\n");
}

function errorMessage(err: unknown): string {
  const message = err instanceof Error && err.message ? err.message : "Investigation failed";
  return message.slice(0, 300);
}
