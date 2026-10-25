"use client";

/**
 * The ONE evidence block for a bill, chosen by its verdict. Renders engine
 * numbers verbatim (check data, match candidates, payment); computes nothing.
 * The caller supplies the card; this is the content.
 */
import { useState } from "react";
import { formatPct, formatQty, formatUsd } from "@/engine/format";
import { humanRefusal } from "@/engine/human";
import { POLICY } from "@/seed/policy";
import type { BillView, Property, Vendor } from "@/types/bill";
import { CHECK_LABEL, errorMessage, type DeskActions } from "./contract";
import { humanize } from "./Details";
import { check, failedChecks, MATCH_NEEDS, num, RAIL_LABEL, splitUnit, storyKind, str } from "./story";
import { Button, ErrorLine, Icon, Money, shortDate, T, Tag } from "./ui";

const UNIT: Record<string, string> = { KWH: "kWh", CCF: "CCF", THERM: "therms", YD3: "yd³" };

interface Series {
  kind: "usage" | "amount";
  /** Oldest first. */
  baseline: number[];
  current: number;
  unit: string;
  avg: number | null;
  variancePct: number | null;
  thresholdPct: number | null;
}

function numbers(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((n): n is number => typeof n === "number") : [];
}

/** Reads the SPIKE check's baseline. Null when there is nothing to draw. */
function spikeSeries(bill: BillView): Series | null {
  const d = check(bill, "SPIKE")?.data;
  if (!d) return null;
  const usage = bill.extracted.usage_qty.value;
  const usageBase = numbers(d.baseline_usage);
  const amountBase = numbers(d.baseline_amounts);
  const thresholdPct = num(d.threshold_pct);
  if (usageBase.length > 0 && usage !== null) {
    return { kind: "usage", baseline: [...usageBase].reverse(), current: usage, unit: str(d.usage_unit) ?? "", avg: num(d.baseline_avg_usage), variancePct: num(d.usage_variance_pct), thresholdPct };
  }
  if (amountBase.length > 0 && bill.amount !== null) {
    return { kind: "amount", baseline: [...amountBase].reverse(), current: bill.amount, unit: "", avg: num(d.baseline_avg_amount), variancePct: num(d.amount_variance_pct), thresholdPct };
  }
  return null;
}

export function evidenceTitle(bill: BillView): string {
  switch (storyKind(bill)) {
    case "spike": return "Usage vs the last 3 bills";
    case "duplicate": return "Already paid vs this bill";
    case "property": return "Address on the bill";
    case "vendor": return "Vendor trust";
    case "linesum": return "Line items vs printed total";
    case "unread": return "What the reader got";
    case "policy": return "Auto-pay limit";
    case "learned": return "Taught once, now automatic";
    case "cleared": return "Why it cleared";
    default: return "What failed";
  }
}

export function Evidence({ bill, vendors }: { bill: BillView; vendors: Vendor[] }) {
  switch (storyKind(bill)) {
    case "spike": return <SpikeEvidence bill={bill} />;
    case "duplicate": return <DuplicateEvidence bill={bill} />;
    case "property": return <PropertyEvidence bill={bill} />;
    case "vendor": return <VendorEvidence bill={bill} vendors={vendors} />;
    case "linesum": return <LineSumEvidence bill={bill} />;
    case "learned": return <LearnedEvidence bill={bill} />;
    case "cleared": return <PaymentEvidence bill={bill} />;
    default: return <FailedEvidence bill={bill} />;
  }
}

/* ---------- Spike: baseline bars + this bill ---------- */

function SpikeEvidence({ bill }: { bill: BillView }) {
  const series = spikeSeries(bill);
  if (!series) return <FailedEvidence bill={bill} />;
  const unit = series.kind === "usage" ? (UNIT[series.unit] ?? series.unit) : "";
  const fmt = (n: number) => (series.kind === "usage" ? formatQty(n) : formatUsd(n));
  const values = [...series.baseline, series.current];
  const max = Math.max(...values, 1);
  const n = series.baseline.length;
  const labels = series.baseline.map((_, i) => (n - i === 1 ? "Last bill" : `${n - i} bills ago`)).concat("This bill");
  const h = 80;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-4" role="list" aria-label="Past bills and this bill">
        {values.map((v, i) => {
          const current = i === values.length - 1;
          return (
            <div key={i} role="listitem" className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex w-full flex-col items-center justify-end gap-2" style={{ height: h + 28 }}>
                <span className={`${T.small} tabular-nums whitespace-nowrap ${current ? "font-semibold" : "text-muted"}`}>
                  {fmt(v)}{unit && ` ${unit}`}
                </span>
                <div
                  className={`w-full max-w-20 rounded-[10px] ${current ? "bg-paper" : "bg-muted/30"}`}
                  style={{ height: Math.max((v / max) * h, 8) }}
                />
              </div>
              <span className={`${T.small} whitespace-nowrap ${current ? "text-paper" : "text-muted"}`}>{labels[i]}</span>
            </div>
          );
        })}
      </div>
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.08] pt-4 ${T.small} text-muted`}>
        {series.avg !== null && <span>Usual <span className="text-paper tabular-nums">{fmt(series.avg)}{unit && ` ${unit}`}</span></span>}
        {series.variancePct !== null && <span>This bill <span className="text-paper tabular-nums">{formatPct(series.variancePct)}</span></span>}
        {series.thresholdPct !== null && <span>Rule: hold above +{series.thresholdPct}%</span>}
        <span className="ml-auto"><Tag>Paid history</Tag></span>
      </div>
    </div>
  );
}

/* ---------- Duplicate: side by side ---------- */

function DuplicateEvidence({ bill }: { bill: BillView }) {
  const exact = check(bill, "EXACT_DUPLICATE");
  const fuzzy = check(bill, "FUZZY_DUPLICATE");
  const e = exact?.outcome === "BLOCK" ? exact.data : null;
  const f = fuzzy?.outcome === "BLOCK" ? fuzzy.data : null;
  const priorInvoice = str(e?.matched_invoice) ?? str(f?.prior_invoice);
  const priorAmount = num(e?.matched_amount) ?? num(f?.prior_amount);
  const priorDue = str(e?.matched_due) ?? str(f?.prior_due);
  const priorPaid = str(e?.matched_paid_on) ?? str(f?.prior_paid_on);
  const days = num(e?.days_apart) ?? num(f?.days_apart);
  const pct = num(f?.amount_delta_pct);

  const rows: Array<[string, string, string, boolean]> = [
    ["Invoice", priorInvoice ?? "None", bill.extracted.invoice_number.value ?? "None", priorInvoice === bill.extracted.invoice_number.value],
    ["Amount", priorAmount !== null ? formatUsd(priorAmount) : "None", bill.amount !== null ? formatUsd(bill.amount) : "None", priorAmount === bill.amount],
    ["Due", shortDate(priorDue), shortDate(bill.extracted.due_date.value), false],
    ["Status", priorPaid ? `Paid ${shortDate(priorPaid)}` : "Cleared", "Blocked", false],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[96px_1fr_1fr] gap-x-4">
        <span />
        <span className={`${T.label} pb-2 text-muted`}>Already paid</span>
        <span className={`${T.label} pb-2 text-muted`}>This bill</span>
        {rows.map(([label, a, b, same]) => (
          <div key={label} className="contents">
            <span className="border-t border-white/[0.08] py-3 text-[14px] leading-6 text-muted">{label}</span>
            <span className={`${T.body} border-t border-white/[0.08] py-3 tabular-nums`}>{a}</span>
            <span className={`${T.body} flex items-center gap-2 border-t border-white/[0.08] py-3 tabular-nums`}>
              {b}
              {same && <span className="text-muted"><Icon name="check" /></span>}
            </span>
          </div>
        ))}
      </div>
      <p className={`${T.small} border-t border-white/[0.08] pt-4 text-muted`}>
        {pct !== null && <><span className="text-paper">{pct === 0 ? "Same amount" : `${pct.toFixed(1)}% apart`}</span> (rule: within {POLICY.FUZZY_DUP_AMOUNT_PCT}%) · </>}
        {days !== null && <><span className="text-paper">due {days} days apart</span>{pct !== null && ` (rule: within ${POLICY.FUZZY_DUP_WINDOW_DAYS})`} · </>}
        same vendor and property
      </p>
    </div>
  );
}

/* ---------- Needs property: address + inline assign ---------- */

function PropertyEvidence({ bill }: { bill: BillView }) {
  const top = bill.match.candidates[0];
  const raw = bill.extracted.service_address.source_snippet ?? bill.extracted.service_address.value;
  const [street, unit] = raw ? splitUnit(raw) : ["No service address", null];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex min-w-0 flex-col gap-2">
        <span className={`${T.label} text-muted`}>Printed on the bill</span>
        <p className={`${T.title} flex flex-wrap items-center gap-2`}>
          <span>{street}</span>
          {unit && <mark className="rounded-[10px] bg-transparent px-2 text-paper shadow-[inset_0_0_0_2px_var(--color-lime)]">{unit}</mark>}
        </p>
        {unit && <p className={`${T.small} text-muted`}>The street matches; unit {unit} doesn&apos;t.</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <span className={`${T.label} text-muted`}>Best guess</span>
        {top ? (
          <>
            <p className={T.title}>{top.property_name}</p>
            <p className={`${T.small} text-muted`}>
              Match <span className="text-paper tabular-nums">{top.score.toFixed(2)}</span>, needs {MATCH_NEEDS.toFixed(2)} to assign itself.
            </p>
          </>
        ) : (
          <p className={`${T.body} text-muted`}>No property is close.</p>
        )}
      </div>
    </div>
  );
}

/** Assign to the best guess (the primary action) or pick another property. */
export function AssignControls({ bill, properties, actions, stacked = false }: { bill: BillView; properties: Property[]; actions: DeskActions; stacked?: boolean }) {
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const top = bill.match.candidates[0];
  const refusal = humanRefusal(bill, "assign", bill.investigation);

  async function assign(id: string) {
    setBusy(true);
    setError(null);
    try {
      await actions.assign(bill.id, id);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={`flex gap-3 ${stacked ? "flex-col items-stretch" : "flex-wrap items-center"}`}>
        {top && (
          <Button
            kind="primary"
            className={stacked ? "h-auto! min-h-10 whitespace-normal! py-2 text-center" : ""}
            disabled={busy || refusal !== null}
            onClick={() => assign(top.property_id)}
          >
            {busy ? "Assigning…" : `Assign to ${top.property_name}`}
          </Button>
        )}
        <label className="flex min-w-0">
          <span className="sr-only">Assign to another property</span>
          <select
            value={other}
            disabled={busy || refusal !== null}
            onChange={(e) => {
              setOther(e.target.value);
              if (e.target.value) void assign(e.target.value);
            }}
            className="h-10 w-full min-w-0 cursor-pointer rounded-full bg-transparent px-4 text-[14px] font-semibold text-paper shadow-[inset_0_0_0_1px_rgba(242,241,236,0.3)] outline-none focus-visible:ring-2 focus-visible:ring-paper"
          >
            <option value="" className="bg-card">Another property…</option>
            {properties.filter((p) => p.id !== top?.property_id).map((p) => (
              <option key={p.id} value={p.id} className="bg-card">{p.name}</option>
            ))}
          </select>
        </label>
      </div>
      {bill.match.address_key && (
        <p className={`${T.small} text-muted`}>
          Lintel will remember <span className="font-mono text-paper">{bill.match.address_key}</span> for the next bill.
        </p>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
    </div>
  );
}

/* ---------- Vendor trust ---------- */

const CRS_TEXT = {
  PASS: "Passed",
  FLAGGED: "Flagged",
  UNAVAILABLE: "Didn't answer",
  NOT_RUN: "Not run (CRS is off at this desk)",
} as const;

const KIND_TEXT = {
  ENROLLED_UTILITY: "Enrolled utility",
  KNOWN_CONTRACTOR: "Onboarded contractor",
  UNVERIFIED_CONTRACTOR: "In the file, identity not verified",
} as const;

function VendorEvidence({ bill, vendors }: { bill: BillView; vendors: Vendor[] }) {
  const vendor = vendors.find((v) => v.id === bill.match.vendor_id);
  const policy = check(bill, "POLICY");
  const limit = num(policy?.data.limit);
  const rows: Array<[string, string, boolean]> = [
    ["Vendor file", vendor ? KIND_TEXT[vendor.kind] : "Not in the vendor file", vendor?.kind !== "UNVERIFIED_CONTRACTOR" && !!vendor],
    ["CRS identity check", CRS_TEXT[bill.crs.outcome], bill.crs.outcome === "PASS"],
    ...(limit !== null ? [["Auto-pay limit", `${formatUsd(limit)} at ${bill.property_name ?? "this property"}`, policy?.outcome === "PASS"] as [string, string, boolean]] : []),
  ];
  return (
    <div className="flex flex-col">
      {rows.map(([label, value, ok]) => (
        <div key={label} className="flex items-center gap-4 border-b border-white/[0.08] py-3 last:border-b-0">
          <span className={`${T.small} w-40 shrink-0 text-muted`}>{label}</span>
          <span className={`${T.body} min-w-0 flex-1`}>{value}</span>
          <span className={ok ? "text-ok" : "text-bad"} aria-label={ok ? "OK" : "Not OK"}><Icon name={ok ? "check" : "alert"} /></span>
        </div>
      ))}
      {bill.crs.signals.length > 0 && (
        <ul className={`${T.small} mt-2 flex flex-wrap gap-2`}>
          {bill.crs.signals.map((s) => (
            <li key={s} className={`inline-flex h-6 items-center gap-1 rounded-full pl-1.5 pr-2 ${T.label} ${bill.crs.outcome === "FLAGGED" ? "bg-bad/15 text-bad" : "text-muted shadow-[inset_0_0_0_1px_rgba(140,140,134,0.45)]"}`}>
              <Icon name="alert" className="size-[14px]" /> {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Line sum ---------- */

function LineSumEvidence({ bill }: { bill: BillView }) {
  const d = check(bill, "LINE_SUM")?.data ?? {};
  return (
    <div className="flex flex-col">
      {bill.extracted.line_items.map((l, i) => (
        <div key={i} className="flex items-center justify-between gap-4 border-b border-white/[0.08] py-3">
          <span className={`${T.body} min-w-0`}>{l.description}</span>
          <Money value={l.amount} className={T.body} />
        </div>
      ))}
      <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] py-3 font-semibold">
        <span className={T.body}>Lines add up to</span>
        <Money value={num(d.line_sum)} className={T.body} />
      </div>
      <div className="flex items-center justify-between gap-4 py-3">
        <span className={`${T.body} text-muted`}>Printed total</span>
        <Money value={num(d.total)} className={T.body} />
      </div>
    </div>
  );
}

/* ---------- Learned alias ---------- */

function LearnedEvidence({ bill }: { bill: BillView }) {
  const taughtNow = bill.match.method === "HUMAN_ASSIGNED";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`${T.title} font-mono`}>{bill.match.address_key ?? bill.extracted.service_address.value}</span>
        <Icon name="arrow" className="text-muted" />
        <span className={T.title}>{bill.property_name}</span>
      </div>
      <p className={`${T.body} text-muted`}>
        {taughtNow
          ? "A person assigned this address once. Lintel stored it, so the next bill printed the same way matches on its own."
          : "A person taught this address on an earlier bill. This one matched by that alias at 1.00, then passed every check."}
      </p>
    </div>
  );
}

/* ---------- Cleared: approved for payment ---------- */

export function PaymentLine({ bill, vendors }: { bill: BillView; vendors: Vendor[] }) {
  // Bills saved before simulated payments were removed can still carry a SIMULATED record; only a testnet one is shown.
  const live = bill.payment?.mode === "LIVE_TESTNET" ? bill.payment : null;
  const rail = bill.decision.rail ?? vendors.find((v) => v.id === bill.match.vendor_id)?.default_rail ?? null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className={`${T.body} font-semibold`}>Approved for payment</span>
      {rail && <span className={`${T.small} text-muted`}>via {RAIL_LABEL[live?.rail ?? rail]}</span>}
      {live && <Tag>Testnet · {live.status.toLowerCase()}</Tag>}
      {live?.reference && <span className="w-full break-all font-mono text-[12px] leading-4 text-muted" title={live.reference}>Ref {live.reference}</span>}
    </div>
  );
}

function PaymentEvidence({ bill }: { bill: BillView }) {
  const spike = check(bill, "SPIKE");
  const amountPct = num(spike?.data.amount_variance_pct);
  const avg = num(spike?.data.baseline_avg_amount);
  const limit = num(check(bill, "POLICY")?.data.limit);
  const facts: Array<[string, string]> = [
    ["Matched by", bill.match.method === "EXACT_ACCOUNT" ? `Account ${bill.extracted.account_number.value ?? ""}` : `Address at ${bill.match.confidence.toFixed(2)}`],
    ...(spike?.outcome === "PASS" && amountPct !== null && avg !== null ? [["Vs usual", `${formatPct(amountPct)} vs ${formatUsd(avg)} avg`] as [string, string]] : []),
    ...(limit !== null ? [["Auto-pay limit", `Under ${formatUsd(limit)}`] as [string, string]] : []),
    ["Duplicates", "None found"],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-y-4">
        {facts.map(([k, v]) => (
          <div key={k} className="flex min-w-0 flex-col gap-1">
            <span className={`${T.small} text-muted`}>{k}</span>
            <span className={`${T.body} tabular-nums`}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Fallback: the failed checks verbatim ---------- */

function FailedEvidence({ bill }: { bill: BillView }) {
  const failed = failedChecks(bill);
  if (failed.length === 0) return <p className={`${T.body} text-muted`}>{bill.decision.why}</p>;
  return (
    <div className="flex flex-col">
      {failed.map((c) => (
        <div key={c.id} className="flex flex-col gap-1 border-b border-white/[0.08] py-3 last:border-b-0">
          <span className={`${T.body} font-semibold`}>{CHECK_LABEL[c.id]}</span>
          <span className={`${T.small} text-muted`}>{humanize(c.rationale)}</span>
        </div>
      ))}
    </div>
  );
}
