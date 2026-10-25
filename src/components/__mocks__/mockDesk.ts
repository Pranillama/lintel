"use client";

/**
 * MOCK desk for building and previewing the UI without a Convex deployment.
 * Never import this from src/app/page.tsx (ui-context.md: mocks are dev-only).
 *
 * It runs the real engine in the browser: normalizeForm → matchBill → decide, the
 * same audit drafts and SHA-256 chain the backend writes, and humanRefusal for
 * illegal actions. Investigator briefs are canned examples (CREAO runs in Convex).
 */
import { useMemo, useRef, useState } from "react";
import { appendEvents } from "@/audit/append";
import { decisionAuditDrafts } from "@/audit/drafts";
import { decide } from "@/engine/decide";
import { humanRefusal } from "@/engine/human";
import { computeTotals } from "@/engine/totals";
import { normalizeForm } from "@/intake/normalizeForm";
import { matchBill, matchNames } from "@/match/matchBill";
import { OPENING_BATCH } from "@/seed/demo-inputs";
import { ACCOUNTS, HISTORY, PROPERTIES, VENDORS } from "@/seed/portfolio";
import { POLICY_TEXT, REAL_VS_SIMULATED, SEATS_LINE } from "@/seed/policy";
import type {
  AddressAlias,
  AuditEvent,
  BillView,
  CrsResult,
  ExtractedBill,
  InvestigationBrief,
  LedgerSnapshot,
  PaymentInstruction,
  PaymentRail,
  PortfolioResponse,
  ProcessBillInput,
  PropertyId,
} from "@/types/bill";
import type { DeskActions, DeskData } from "../desk/contract";

type Draft = Omit<AuditEvent, "id" | "seq" | "prev_hash" | "hash">;

const NOT_RUN: CrsResult = { outcome: "NOT_RUN", request_id: null, identity_ref: null, signals: [], detail: "Not run." };

export const MOCK_PORTFOLIO: PortfolioResponse = {
  properties: PROPERTIES,
  vendors: VENDORS,
  policy_text: POLICY_TEXT,
  seats_line: SEATS_LINE,
  real_vs_simulated: REAL_VS_SIMULATED,
  flags: { crs_enabled: false, creao_enabled: true, x402_enabled: false, extraction_enabled: true },
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function emptyField<T>() { return { value: null as T | null, confidence: 0, source_snippet: null }; }

/** A document read that failed: the mock cannot call Claude, so it takes the EXTRACTION_FAILED path. */
function failedRead(): ExtractedBill {
  return {
    source: "DOCUMENT",
    vendor_name: emptyField(), invoice_number: emptyField(), account_number: emptyField(), service_address: emptyField(),
    due_date: emptyField(), billing_period_start: emptyField(), billing_period_end: emptyField(), total_amount: emptyField(),
    usage_qty: emptyField(), usage_unit: emptyField(), line_items: [],
    extraction_error: "Mock desk: document reading runs in Convex (extractBill).",
    extraction_model: null,
  };
}

function payment(id: string, rail: PaymentRail): PaymentInstruction {
  return { rail, mode: "SIMULATED", status: "SCHEDULED", reference: `SIM-${rail}-${id}`, idempotency_key: id };
}

/** Example briefs, clearly canned. Real ones come from the investigate action. */
function cannedBrief(bill: BillView, status: InvestigationBrief["status"]): InvestigationBrief | null {
  if (bill.status === "CLEARED" || bill.status === "REJECTED") return null;
  const base = { bill_id: bill.id, provider: "CREAO" as const, creao_run_id: "mock-run", creao_share_url: "https://agent.creao.ai/", error: null, started_at: bill.created_at, draft_sent: false };
  if (status !== "DONE") return { ...base, status, summary: "", findings: [], draft: null, completed_at: null };
  const reasons = bill.decision.reasons;
  if (reasons.includes("USAGE_SPIKE")) {
    return { ...base, status, completed_at: bill.created_at,
      summary: "Usage is almost four times the usual at the same rate. That pattern points to a leak, not a price change.",
      findings: ["Last 3 bills: 40, 42 and 44 CCF.", "Same meter and account on every bill.", "No rate change on file for this account."],
      draft: { kind: "WORK_ORDER", to: "Maintenance, Shattuck Student Living", subject: "Inspect the water main at 2110 Shattuck Ave", body: "The October bill shows 160 CCF against a 42 CCF average at a flat rate. Please check the main line for a leak and report back before we approve payment.", suggested_property_id: null } };
  }
  if (reasons.includes("NEEDS_PROPERTY_MATCH")) {
    return { ...base, status, completed_at: bill.created_at,
      summary: "The street matches Telegraph Hill Lofts, but that building has no unit B.",
      findings: ["This vendor billed Telegraph Hill Lofts in August.", "Units at 1880 Lombard St are 101 to 408."],
      draft: { kind: "MATCH_SUGGESTION", to: "AP operator", subject: "Likely Telegraph Hill Lofts", body: "Assign to Telegraph Hill Lofts if unit B is a typo. The person still decides.", suggested_property_id: "PROP-002" } };
  }
  if (reasons.some((r) => r === "EXACT_DUPLICATE" || r === "FUZZY_DUPLICATE")) {
    return { ...base, status, completed_at: bill.created_at,
      summary: "This looks like a bill we already paid. The vendor should confirm it is not a re-send.",
      findings: [`Matches ${bill.decision.duplicate_of ?? "a prior bill"} for the same property.`],
      draft: { kind: "VENDOR_EMAIL", to: `${bill.vendor_name ?? "Vendor"} billing`, subject: "Possible duplicate invoice", body: "We received an invoice that matches one already paid. Please confirm whether this is a duplicate before we process it.", suggested_property_id: null } };
  }
  return { ...base, status, completed_at: bill.created_at, summary: "Held for a person. The checks list every reason.", findings: [], draft: null };
}

interface DeskState { bills: BillView[]; aliases: AddressAlias[] }

function ledgerFrom(state: DeskState): LedgerSnapshot {
  return { properties: PROPERTIES, vendors: VENDORS, accounts: ACCOUNTS, history: HISTORY, bills: state.bills, aliases: state.aliases };
}

/** Mirrors convex/pipeline/process.ts for FORM, FEED and (failed) DOCUMENT input. */
async function pipeline(input: ProcessBillInput, id: string, ts: string, state: DeskState): Promise<BillView> {
  const extracted = input.kind === "DOCUMENT" ? failedRead() : normalizeForm(input.form, input.kind);
  const ledger = ledgerFrom(state);
  const match = matchBill(extracted, ledger);
  const decision = decide({ bill_id: id, extracted, match, crs: NOT_RUN, ledger });
  const source = input.kind;
  const source_label = input.kind === "FEED" ? input.feed_label : input.kind === "DOCUMENT" ? input.document.filename : null;
  const audit = await appendEvents(null, decisionAuditDrafts({ bill_id: id, ts, source, source_label, extracted, match, crs: NOT_RUN, decision }));
  const bill: BillView = {
    id, created_at: ts, source, source_label, extracted, match, crs: NOT_RUN, decision,
    status: decision.status, resolved_by: "AUTO",
    payment: decision.status === "CLEARED" && decision.rail ? payment(id, decision.rail) : null,
    ...matchNames(extracted, match, ledger),
    amount: extracted.total_amount.value,
    audit, investigation: null,
  };
  return bill;
}

const sortNewest = (bills: BillView[]) => [...bills].sort((a, b) => b.created_at.localeCompare(a.created_at));

/** React hook with the same shape as useConvexDesk. */
export function useMockDesk(): { data: DeskData; actions: DeskActions } {
  const [state, setState] = useState<DeskState>({ bills: [], aliases: [] });
  const stateRef = useRef(state);
  const commit = (next: DeskState) => { stateRef.current = next; setState(next); };
  const counter = useRef(0);

  const actions = useMemo<DeskActions>(() => {
    const find = (billId: string) => {
      const bill = stateRef.current.bills.find((b) => b.id === billId);
      if (!bill) throw new Error("Unknown bill.");
      return bill;
    };
    const replaceBill = (bill: BillView, aliases = stateRef.current.aliases) => {
      commit({ aliases, bills: sortNewest(stateRef.current.bills.map((b) => (b.id === bill.id ? bill : b))) });
      return bill;
    };
    const addEvents = async (bill: BillView, drafts: Draft[]) => [...bill.audit, ...(await appendEvents(bill.audit.at(-1) ?? null, drafts))];
    const investigateLater = (bill: BillView) => {
      if (bill.status === "CLEARED") return;
      setTimeout(() => {
        const current = stateRef.current.bills.find((b) => b.id === bill.id);
        if (current && current.investigation?.status !== "DONE") replaceBill({ ...current, investigation: cannedBrief(current, "DONE") });
      }, 2500);
    };
    const create = async (input: ProcessBillInput) => {
      await wait(500);
      counter.current += 1;
      const id = `LIVE-${String(counter.current).padStart(3, "0")}`;
      const bill = await pipeline(input, id, new Date().toISOString(), stateRef.current);
      const withBrief = { ...bill, investigation: cannedBrief(bill, "PENDING") };
      commit({ ...stateRef.current, bills: sortNewest([withBrief, ...stateRef.current.bills]) });
      investigateLater(withBrief);
      return withBrief;
    };
    return {
      async replay() {
        commit({ bills: [], aliases: [] });
        await wait(700);
        const next: DeskState = { bills: [], aliases: [] };
        for (const [i, row] of OPENING_BATCH.entries()) {
          const ts = `2026-10-24T16:14:0${i}.000Z`;
          const bill = await pipeline({ kind: "FEED", form: row.form, feed_label: "Saturday intake" }, row.key, ts, next);
          const status = bill.decision.reasons.includes("NEEDS_PROPERTY_MATCH") ? "RUNNING" : "DONE";
          next.bills.push({ ...bill, investigation: cannedBrief(bill, status) });
        }
        commit({ ...next, bills: sortNewest(next.bills) });
        next.bills.filter((b) => b.investigation?.status === "RUNNING").forEach(investigateLater);
        return next.bills;
      },
      processForm: (form) => create({ kind: "FORM", form }),
      processDocument: (document) => create({ kind: "DOCUMENT", document }),
      async assign(billId, propertyId, note) {
        await wait(300);
        const bill = find(billId);
        const refusal = humanRefusal(bill, "assign", bill.investigation);
        if (refusal) throw new Error(refusal);
        const property = PROPERTIES.find((p) => p.id === propertyId);
        if (!property) throw new Error("Choose a property.");
        const ts = new Date().toISOString();
        const alias: AddressAlias | null = bill.match.address_key
          ? { address_key: bill.match.address_key, raw_address: bill.extracted.service_address.value ?? "", property_id: property.id as PropertyId, created_at: ts, created_by: "HUMAN_OPERATOR", source_bill_id: bill.id }
          : null;
        const aliases = alias ? [...stateRef.current.aliases.filter((a) => a.address_key !== alias.address_key), alias] : stateRef.current.aliases;
        const match = { ...bill.match, property_id: property.id as PropertyId, method: "HUMAN_ASSIGNED" as const, confidence: 1 };
        const others = stateRef.current.bills.filter((b) => b.id !== bill.id);
        const ledger = ledgerFrom({ bills: others, aliases });
        const decision = decide({ bill_id: bill.id, extracted: bill.extracted, match, crs: bill.crs, ledger });
        const drafts: Draft[] = [
          { bill_id: bill.id, ts, actor: "HUMAN_OPERATOR", action: "HUMAN_ASSIGN_PROPERTY", decision: "PASS", rationale: note ?? `Assigned ${property.name}.`, data: {} },
          ...(alias ? [{ bill_id: bill.id, ts, actor: "HUMAN_ALIAS" as const, action: "ALIAS_STORED" as const, decision: "INFO" as const, rationale: `${alias.address_key} → ${property.id}`, data: {} }] : []),
          ...decision.checks.map((c) => ({ bill_id: bill.id, ts, actor: "DETERMINISTIC_RULE" as const, action: "CHECK" as const, decision: c.outcome === "SKIP" ? ("INFO" as const) : c.outcome, rationale: c.rationale, data: {} })),
          { bill_id: bill.id, ts, actor: "DETERMINISTIC_RULE", action: "DECISION", decision: decision.status === "CLEARED" ? "PASS" : decision.status === "BLOCKED" ? "BLOCK" : "HALT", rationale: decision.why, data: {} },
        ];
        const pay = decision.status === "CLEARED" && decision.rail ? payment(bill.id, decision.rail) : null;
        const next: BillView = { ...bill, match, decision, status: decision.status, resolved_by: "HUMAN", payment: pay, property_name: property.name, audit: await addEvents(bill, drafts) };
        return replaceBill(next, aliases);
      },
      async approve(billId, note) {
        await wait(300);
        const bill = find(billId);
        const refusal = humanRefusal(bill, "approve", bill.investigation);
        if (refusal) throw new Error(refusal);
        const ts = new Date().toISOString();
        const rail = bill.decision.rail ?? (VENDORS.find((v) => v.id === bill.match.vendor_id)?.kind === "ENROLLED_UTILITY" ? "UTILITY_PORTAL" : "ACH");
        const drafts: Draft[] = [
          { bill_id: bill.id, ts, actor: "HUMAN_OPERATOR", action: "HUMAN_APPROVE", decision: "PASS", rationale: `${bill.decision.required_approver}${note ? `: ${note}` : ""}`, data: {} },
          { bill_id: bill.id, ts, actor: "PAYMENT_ROUTER", action: "ROUTE_PAYMENT", decision: "EXECUTE", rationale: `${rail} SIMULATED`, data: {} },
        ];
        return replaceBill({ ...bill, status: "CLEARED", resolved_by: "HUMAN", payment: payment(bill.id, rail), audit: await addEvents(bill, drafts) });
      },
      async reject(billId, note) {
        await wait(300);
        const bill = find(billId);
        const refusal = humanRefusal(bill, "reject", bill.investigation);
        if (refusal) throw new Error(refusal);
        const drafts: Draft[] = [{ bill_id: bill.id, ts: new Date().toISOString(), actor: "HUMAN_OPERATOR", action: "HUMAN_REJECT", decision: "BLOCK", rationale: note ?? "Rejected.", data: {} }];
        return replaceBill({ ...bill, status: "REJECTED", resolved_by: "HUMAN", audit: await addEvents(bill, drafts) });
      },
      async sendDraft(billId) {
        await wait(300);
        const bill = find(billId);
        const refusal = humanRefusal(bill, "send-draft", bill.investigation);
        if (refusal) throw new Error(refusal);
        const drafts: Draft[] = [{ bill_id: bill.id, ts: new Date().toISOString(), actor: "HUMAN_OPERATOR", action: "DRAFT_SENT", decision: "INFO", rationale: bill.investigation?.draft?.subject ?? "Draft sent.", data: {} }];
        return replaceBill({ ...bill, investigation: bill.investigation ? { ...bill.investigation, draft_sent: true } : null, audit: await addEvents(bill, drafts) });
      },
    };
  }, []);

  const data: DeskData = {
    bills: state.bills,
    totals: computeTotals(state.bills),
    auditChainIntact: true,
    portfolio: MOCK_PORTFOLIO,
    loading: false,
  };
  return { data, actions };
}
