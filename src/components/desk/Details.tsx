"use client";

/** Checks and history for one bill. Wide rows in a modal, so nothing wraps one word per line. */
import type { AuditAction, AuditEvent, BillView, CheckOutcome, CheckResult } from "@/types/bill";
import { actorFamily, CHECK_LABEL } from "./contract";
import { failedChecks } from "./story";
import { Icon, Modal, T } from "./ui";

export type DetailsTab = "checks" | "history";

/** snake_case and UPPER_SNAKE codes in engine text read as words: vendor_name -> vendor name, by ADDRESS -> by address. */
export function humanize(text: string): string {
  return text
    .replace(/\b[A-Za-z]+(?:_[A-Za-z]+)+\b/g, (m) => m.replace(/_/g, " ").toLowerCase())
    .replace(/\b(ADDRESS|UNRESOLVED)\b/g, (m) => m.toLowerCase());
}

export function checksSummary(bill: BillView): string {
  const failed = failedChecks(bill);
  const n = bill.decision.checks.length;
  if (failed.length === 0) return `${n} checks · all passed`;
  return `${n} checks · ${failed.length} failed: ${failed.map((c) => CHECK_LABEL[c.id]).join(", ")}`;
}

const OUTCOME: Record<CheckOutcome, { word: string; icon: "check" | "alert" | "x" | "slash"; cls: string; rank: number }> = {
  BLOCK: { word: "Block", icon: "x", cls: "bg-bad/15 text-bad", rank: 0 },
  HALT: { word: "Hold", icon: "alert", cls: "bg-bad/15 text-bad", rank: 1 },
  PASS: { word: "Pass", icon: "check", cls: "bg-ok/15 text-ok", rank: 2 },
  SKIP: { word: "Skip", icon: "slash", cls: "text-muted shadow-[inset_0_0_0_1px_rgba(140,140,134,0.45)]", rank: 3 },
};

function OutcomeChip({ outcome }: { outcome: CheckOutcome }) {
  const o = OUTCOME[outcome];
  return (
    <span className={`inline-flex h-6 items-center gap-1 rounded-full pl-1.5 pr-2.5 text-[12px] font-semibold leading-4 ${o.cls}`}>
      <Icon name={o.icon} className="size-[14px]" /> {o.word}
    </span>
  );
}

const ACTION: Record<AuditAction, string> = {
  INTAKE: "Bill received",
  EXTRACT_FIELDS: "Fields read",
  RESOLVE_VENDOR: "Vendor found",
  RESOLVE_PROPERTY: "Property found",
  CHECK: "Check",
  VERIFY_VENDOR: "Vendor verified",
  DECISION: "Decision",
  ROUTE_PAYMENT: "Payment routed",
  INVESTIGATION_STARTED: "Investigator started",
  INVESTIGATION_COMPLETED: "Investigator finished",
  INVESTIGATION_FAILED: "Investigator failed",
  HUMAN_ASSIGN_PROPERTY: "Property assigned",
  ALIAS_STORED: "Address remembered",
  HUMAN_APPROVE: "Approved",
  HUMAN_REJECT: "Rejected",
  DRAFT_SENT: "Draft sent",
};

const TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

function eventTitle(e: AuditEvent): string {
  const id = e.data.check_id;
  if (e.action === "CHECK" && typeof id === "string" && id in CHECK_LABEL) return `${CHECK_LABEL[id as CheckResult["id"]]} check`;
  return ACTION[e.action];
}

/** Every check and the hash-chained history for one bill, in a modal with two tabs. */
export function DetailsModal({ bill, tab, chainIntact, onTab, onClose }: { bill: BillView; tab: DetailsTab; chainIntact: boolean; onTab(tab: DetailsTab): void; onClose(): void }) {
  const checks = [...bill.decision.checks].sort((a, b) => OUTCOME[a.outcome].rank - OUTCOME[b.outcome].rank);
  const events = [...bill.audit].sort((a, b) => a.seq - b.seq);
  const tabBtn = (t: DetailsTab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === t}
      onClick={() => onTab(t)}
      className={`h-10 cursor-pointer whitespace-nowrap rounded-full px-4 text-[14px] font-semibold leading-5 outline-none focus-visible:ring-2 focus-visible:ring-paper ${tab === t ? "bg-paper text-bar" : "text-muted hover:text-paper"}`}
    >
      {label}
    </button>
  );
  return (
    <Modal
      title={bill.vendor_name ?? "Unknown vendor"}
      sub={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{bill.extracted.invoice_number.value ?? "No invoice number"}</span>
          <span className={`flex items-center gap-1.5 ${chainIntact ? "text-ok" : "text-bad"}`}>
            <Icon name={chainIntact ? "check" : "x"} /> Hash chain {chainIntact ? "intact" : "broken"}
          </span>
        </span>
      }
      aside={
        <div className="flex items-center gap-1 rounded-full bg-bar p-1" role="tablist" aria-label="Details">
          {tabBtn("checks", `Checks · ${checks.length}`)}
          {tabBtn("history", `History · ${events.length}`)}
        </div>
      }
      onClose={onClose}
    >
      {tab === "checks" ? (
        <div className="flex flex-col gap-4">
          <p className={`${T.body} text-muted`}><span className="text-paper">Engine sentence: </span>{bill.decision.why}</p>
          <ul className="flex flex-col">
            {checks.map((c) => (
              <li key={c.id} className="grid grid-cols-[88px_1fr] items-start gap-x-4 gap-y-1 border-t border-white/[0.08] py-3 first:border-t-0 first:pt-0 sm:grid-cols-[88px_180px_1fr]">
                <span className="pt-0.5"><OutcomeChip outcome={c.outcome} /></span>
                <span className={`${T.body} font-semibold`}>{CHECK_LABEL[c.id]}</span>
                <span className={`${T.body} col-start-2 text-muted sm:col-start-3`}>{humanize(c.rationale)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ol className="flex flex-col">
          {events.map((e) => (
            <li key={e.id} className="grid grid-cols-[72px_1fr] items-baseline gap-4 border-t border-white/[0.08] py-2 first:border-t-0 first:pt-0 sm:grid-cols-[80px_72px_1fr_96px]">
              <time dateTime={e.ts} className="font-mono text-[12px] leading-4 text-muted tabular-nums">{TIME.format(new Date(e.ts))}</time>
              <span className={`${T.label} hidden sm:block ${actorFamily(e.actor) === "HUMAN" ? "text-paper" : "text-muted"}`}>{actorFamily(e.actor)}</span>
              <span className="flex min-w-0 flex-col">
                <span className={`${T.body} font-semibold`}>{eventTitle(e)}</span>
                <span className={`${T.small} text-muted`}>{humanize(e.rationale)}</span>
              </span>
              <span className="hidden text-right font-mono text-[12px] leading-4 text-muted sm:block" title={e.hash}>{e.hash.slice(0, 8)}</span>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
