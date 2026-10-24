"use client";

import { useState } from "react";
import { formatPct } from "@/engine/format";
import type { BillView, CheckResult } from "@/types/bill";
import { ActionBar } from "./ActionBar";
import { AuditTimeline } from "./AuditTimeline";
import type { DetailPaneProps } from "./desk";
import { checksSummary, GuardrailTable } from "./GuardrailTable";
import { InvestigatorPanel } from "./InvestigatorPanel";
import { LearnedAddress, MatchAssignCards, MatchPanel } from "./MatchPanel";
import { Money } from "./Money";
import { StatusChip } from "./StatusChip";
import { spikeSeries, UsageBars } from "./UsageBars";

const GRID = "grid h-full min-h-0 grid-cols-2 grid-rows-2 gap-[14px]";

/** Right side of the desk: 2 × 2 bento cells for the selected bill. Renders engine output verbatim. */
export function DetailPane({ bill, properties, actions, auditChainIntact }: DetailPaneProps) {
  if (!bill) {
    return (
      <div className={GRID}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card justify-center">
            {i === 0 && <p className="text-[17px] text-muted">Select a bill to see why it was decided.</p>}
          </div>
        ))}
      </div>
    );
  }
  // Keyed by bill so the toggles reset when the selection changes, but not on live updates.
  return <BillDetail key={bill.id} bill={bill} properties={properties} actions={actions} auditChainIntact={auditChainIntact} />;
}

function BillDetail({ bill, properties, actions, auditChainIntact }: DetailPaneProps & { bill: BillView }) {
  const [showChecks, setShowChecks] = useState(false);
  const needsMatch = bill.status === "HELD" && bill.decision.reasons.includes("NEEDS_PROPERTY_MATCH");

  if (needsMatch && !showChecks) {
    return (
      <div className={GRID}>
        <DecisionCard bill={bill} actions={actions} wide onToggle={() => setShowChecks(true)} toggleLabel="Checks & history" />
        <MatchAssignCards bill={bill} properties={properties} actions={actions} />
      </div>
    );
  }

  return (
    <div className={GRID}>
      <DecisionCard bill={bill} actions={actions} />
      {needsMatch ? (
        <section className="card card-lime justify-between">
          <h3 className="card-title">This bill needs a property</h3>
          <button type="button" className="btn btn-dark self-start px-5 py-3 text-[14px]" onClick={() => setShowChecks(false)}>
            Back to assign
          </button>
        </section>
      ) : (
        <TopRight bill={bill} />
      )}
      <section className="card" aria-label="Checks">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="card-title">{bill.decision.checks.length} checks</h3>
          <span className="text-[13px] text-muted">{checksSummary(bill.decision.checks)}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <GuardrailTable checks={bill.decision.checks} />
        </div>
      </section>
      <StepCard bill={bill} actions={actions} auditChainIntact={auditChainIntact} />
    </div>
  );
}

function sourceTag(bill: BillView): string {
  if (bill.source === "FORM") return "FORM";
  return bill.source_label ? `${bill.source} · ${bill.source_label}` : bill.source;
}

function DecisionCard({
  bill,
  actions,
  wide = false,
  onToggle,
  toggleLabel,
}: {
  bill: BillView;
  actions: DetailPaneProps["actions"];
  wide?: boolean;
  onToggle?: () => void;
  toggleLabel?: string;
}) {
  return (
    <section className={`card card-light ${wide ? "col-span-2" : ""}`} aria-label="Decision">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="card-title truncate" title={bill.vendor_name ?? undefined}>{bill.vendor_name ?? "Unknown vendor"}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[13px] text-bar/60">
            <span>{bill.property_name ?? "Unmatched"}</span>
            <span aria-hidden>·</span>
            <span className="truncate">{sourceTag(bill)}</span>
            {bill.resolved_by === "HUMAN" && (
              <span className="ml-1 rounded-full bg-bar px-2 py-0.5 text-[11px] font-semibold text-paper">Resolved by you</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Money value={bill.amount} struck={bill.status === "BLOCKED"} className="text-[34px] font-light leading-none" />
          <StatusChip status={bill.status} />
        </div>
      </div>
      <p className={`min-h-0 flex-1 overflow-y-auto leading-snug ${wide ? "text-[18px]" : "text-[17px]"}`}>{bill.decision.why}</p>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <ActionBar bill={bill} actions={actions} />
        </div>
        {onToggle && (
          <button type="button" className="btn btn-outline shrink-0 px-5 py-2.5 text-[14px]" onClick={onToggle}>
            {toggleLabel}
          </button>
        )}
      </div>
    </section>
  );
}

function TopRight({ bill }: { bill: BillView }) {
  const duplicate = blockingDuplicate(bill);
  if (bill.status === "BLOCKED" && duplicate) {
    return (
      <section className="card" aria-label="Duplicate comparison">
        <LooksLike bill={bill} check={duplicate} />
      </section>
    );
  }
  if (bill.match.method === "HUMAN_ASSIGNED" || bill.match.method === "HUMAN_ALIAS") {
    return (
      <section className="card" aria-label="Learned address">
        <LearnedAddress match={bill.match} propertyName={bill.property_name} />
      </section>
    );
  }
  const series = spikeSeries(bill);
  if (series) {
    const lime = bill.status === "HELD";
    return (
      <section className={`card ${lime ? "card-lime" : ""}`} aria-label="Usage against baseline">
        <UsageBars series={series} tone={lime ? "lime" : "dark"} />
      </section>
    );
  }
  return (
    <section className="card" aria-label="Match">
      <MatchPanel match={bill.match} />
    </section>
  );
}

function blockingDuplicate(bill: BillView): CheckResult | undefined {
  const blocked = bill.decision.checks.filter((c) => c.outcome === "BLOCK");
  return blocked.find((c) => c.id === "EXACT_DUPLICATE") ?? blocked.find((c) => c.id === "FUZZY_DUPLICATE");
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

/** Prior bill vs this bill, using only the duplicate check's own numbers. */
function LooksLike({ bill, check }: { bill: BillView; check: CheckResult }) {
  const d = check.data;
  const exact = check.id === "EXACT_DUPLICATE";
  const prior = {
    amount: num(exact ? d.matched_amount : d.prior_amount),
    invoice: str(exact ? d.matched_invoice : d.prior_invoice),
    due: str(exact ? d.matched_due : d.prior_due),
    paidOn: str(exact ? d.matched_paid_on : d.prior_paid_on),
  };
  const deltaPct = num(d.amount_delta_pct);
  const days = num(d.days_apart);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="card-title">Looks like</h3>
        <p className="text-right">
          {exact ? (
            <span className="text-[30px] font-light leading-none">Same invoice</span>
          ) : deltaPct !== null ? (
            <>
              <span className="text-[34px] font-light leading-none tabular-nums">{formatPct(deltaPct).replace("+", "")}</span>
              <span className="ml-2 text-[14px] text-muted">apart</span>
            </>
          ) : null}
        </p>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
        <Compare
          tone="dark"
          label={prior.paidOn ? `Already paid ${prior.paidOn}` : "Prior bill"}
          amount={prior.amount}
          lines={[prior.invoice, prior.due ? `due ${prior.due}` : null]}
        />
        <Compare
          tone="light"
          label="This bill"
          amount={bill.amount}
          struck
          lines={[bill.extracted.invoice_number.value, bill.extracted.due_date.value ? `due ${bill.extracted.due_date.value}` : null]}
        />
      </div>
      {days !== null && <p className="text-[12.5px] text-muted">Due {days} days apart.</p>}
    </div>
  );
}

function Compare({ tone, label, amount, lines, struck = false }: { tone: "dark" | "light"; label: string; amount: number | null; lines: Array<string | null>; struck?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-[22px] px-4 py-3.5 ${tone === "light" ? "bg-paper text-bar" : "bg-raised"}`}>
      <p className="truncate text-[12.5px] opacity-60">{label}</p>
      <Money value={amount} struck={struck} className="text-[clamp(20px,2vw,28px)] font-light leading-tight" />
      <p className="truncate font-mono text-[11.5px] opacity-60">{lines.filter(Boolean).join(" · ")}</p>
    </div>
  );
}

type Step = "next" | "history";

function StepCard({ bill, actions, auditChainIntact }: { bill: BillView; actions: DetailPaneProps["actions"]; auditChainIntact: boolean }) {
  const [picked, setPicked] = useState<Step | null>(null);
  // Until the person picks, follow the brief: it may arrive after the bill.
  const step: Step = picked ?? (bill.investigation ? "next" : "history");
  const tabs: Array<[Step, string]> = [["next", "Next step"], ["history", "History"]];

  return (
    <section className="card" aria-label={step === "next" ? "Next step" : "History"}>
      <div role="tablist" aria-label="Next step or history" className="flex shrink-0 gap-1.5">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={step === key}
            onClick={() => setPicked(key)}
            className={`focus-ring rounded-full px-4 py-1.5 text-[14px] ${step === key ? "bg-paper font-medium text-bar" : "text-muted hover:text-paper"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="flex min-h-0 flex-1 flex-col">
        {step === "next" ? (
          <InvestigatorPanel bill={bill} actions={actions} />
        ) : (
          <AuditTimeline events={bill.audit} auditChainIntact={auditChainIntact} />
        )}
      </div>
    </section>
  );
}
