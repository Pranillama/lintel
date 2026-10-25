import { formatPct, formatQty, formatUsd } from "@/engine/format";
import type { BillView } from "@/types/bill";

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

const UNIT_LABEL: Record<string, string> = { KWH: "kWh", CCF: "CCF", THERM: "therms", YD3: "yd³" };

function numbers(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((n): n is number => typeof n === "number") : [];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/** Reads the SPIKE check's seeded baseline. Null when there is nothing to draw. */
export function spikeSeries(bill: BillView): Series | null {
  const spike = bill.decision.checks.find((c) => c.id === "SPIKE");
  if (!spike) return null;
  const d = spike.data;
  const usage = bill.extracted.usage_qty.value;
  const usageBase = numbers(d.baseline_usage);
  const amountBase = numbers(d.baseline_amounts);
  const thresholdPct = numberOrNull(d.threshold_pct);
  if (usageBase.length > 0 && usage !== null) {
    return {
      kind: "usage",
      baseline: [...usageBase].reverse(),
      current: usage,
      unit: typeof d.usage_unit === "string" ? UNIT_LABEL[d.usage_unit] ?? d.usage_unit : "",
      avg: numberOrNull(d.baseline_avg_usage),
      variancePct: numberOrNull(d.usage_variance_pct),
      thresholdPct,
    };
  }
  if (amountBase.length > 0 && bill.amount !== null) {
    return {
      kind: "amount",
      baseline: [...amountBase].reverse(),
      current: bill.amount,
      unit: "",
      avg: numberOrNull(d.baseline_avg_amount),
      variancePct: numberOrNull(d.amount_variance_pct),
      thresholdPct,
    };
  }
  return null;
}

/** Seeded baseline bars plus this bill, all drawn to one shared scale. Plain divs. */
export function UsageBars({ series, tone }: { series: Series; tone: "lime" | "dark" }) {
  const fmt = (n: number) => (series.kind === "usage" ? formatQty(n) : formatUsd(n));
  const values = [...series.baseline, series.current];
  const max = Math.max(...values, 0) || 1;
  const labels = series.baseline.map((_, i) => `−${series.baseline.length - i}`).concat("Now");
  const lime = tone === "lime";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="card-title">{series.kind === "usage" ? "Usage" : "Amount"}</h3>
          <span className={`label-mono rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${lime ? "bg-bar text-lime" : "bg-raised text-muted"}`}>
            Seeded baseline
          </span>
        </div>
        {series.variancePct !== null && (
          <p className="text-[34px] font-light leading-none tabular-nums">{formatPct(series.variancePct)}</p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 items-end gap-4">
        <div className="flex h-full min-h-0 flex-1 items-end justify-around gap-3" role="list" aria-label="Seeded baseline and this bill">
          {values.map((value, i) => {
            const isCurrent = i === values.length - 1;
            const fill = isCurrent ? (lime ? "bg-bar" : "bg-paper") : lime ? "bg-bar/15" : "bg-raised";
            return (
              <div key={i} role="listitem" aria-label={`${labels[i]}: ${fmt(value)} ${series.unit}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                <span className={`text-[12px] font-semibold tabular-nums ${isCurrent ? "" : "opacity-80"}`}>{fmt(value)}</span>
                <div className="flex min-h-0 w-full max-w-16 flex-1 items-end">
                  <div className={`min-h-2 w-full rounded-full ${fill}`} style={{ height: `${(value / max) * 100}%` }} />
                </div>
                <span className="text-[12px] opacity-70">{labels[i]}</span>
              </div>
            );
          })}
        </div>
        {(series.avg !== null || series.thresholdPct !== null) && (
          <p className="w-24 shrink-0 pb-6 text-[12.5px] leading-snug">
            {series.avg !== null && <>vs {fmt(series.avg)} {series.unit} avg.</>}
            {series.thresholdPct !== null && <> Threshold +{series.thresholdPct}%.</>}
          </p>
        )}
      </div>
    </div>
  );
}
