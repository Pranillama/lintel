"use client";

/** Check outcomes as icon + word chips, and engine text made readable. */
import type { BillView, CheckOutcome, CheckResult } from "@/types/bill";
import { CHECK_LABEL } from "./contract";
import { failedChecks } from "./story";
import { Icon } from "./ui";

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

/** Failed checks first, then passes, then skips. */
export function sortedChecks(bill: BillView): CheckResult[] {
  return [...bill.decision.checks].sort((a, b) => OUTCOME[a.outcome].rank - OUTCOME[b.outcome].rank);
}

export function OutcomeChip({ outcome }: { outcome: CheckOutcome }) {
  const o = OUTCOME[outcome];
  return (
    <span className={`inline-flex h-6 items-center gap-1 rounded-full pl-1.5 pr-2.5 text-[12px] font-semibold leading-4 ${o.cls}`}>
      <Icon name={o.icon} className="size-[14px]" /> {o.word}
    </span>
  );
}
