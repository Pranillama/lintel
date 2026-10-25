"use client";

import type { ReactNode } from "react";
import type { Totals } from "@/types/bill";
import type { DeskView } from "./contract";
import { Button, Icon, Money, T } from "./ui";

/** Slim top bar: brand, the two views, Policy and Test a bill. Totals live in the insight strip below. */
export function TopBar({ view, onView, policyOpen, onPolicy, testOpen, onTest }: {
  view: DeskView;
  onView(view: DeskView): void;
  policyOpen: boolean;
  onPolicy(): void;
  testOpen: boolean;
  onTest(): void;
}) {
  const tab = (v: DeskView, label: string) => (
    <button
      type="button"
      aria-current={view === v ? "page" : undefined}
      onClick={() => onView(v)}
      className={`flex h-10 cursor-pointer items-center rounded-full px-4 text-[14px] leading-5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-paper ${view === v ? "bg-white/[0.08] font-semibold text-paper" : "text-muted hover:text-paper"}`}
    >
      {label}
    </button>
  );
  return (
    <header className="flex h-16 shrink-0 items-center gap-8 border-b border-white/[0.08] px-6">
      <button type="button" onClick={() => onView("desk")} className="shrink-0 cursor-pointer rounded-[10px] text-[24px] font-semibold leading-8 tracking-[-0.02em] outline-none focus-visible:ring-2 focus-visible:ring-paper">
        Lintel
      </button>
      <nav aria-label="Views" className="flex min-w-0 flex-1 items-center gap-1">
        {tab("desk", "Desk")}
        {tab("portfolio", "Properties & vendors")}
      </nav>
      <Button kind="text" aria-pressed={policyOpen} onClick={onPolicy}>Policy</Button>
      <Button kind="solid" aria-pressed={testOpen} onClick={onTest}>
        <Icon name="plus" /> Test a bill
        <kbd className="ml-1 rounded-[4px] px-1 font-mono text-[12px] leading-4 text-bar/60 shadow-[inset_0_0_0_1px_rgba(10,10,10,0.25)]">J</kbd>
      </Button>
    </header>
  );
}

/** One quiet line under the navbar: the three totals and the audit chain. */
export function InsightStrip({ totals, chainIntact, loading }: { totals: Totals | undefined; chainIntact: boolean; loading: boolean }) {
  const t = loading ? undefined : totals;
  return (
    <div className="flex h-10 shrink-0 items-center gap-6 overflow-x-auto border-b border-white/[0.08] bg-card/40 px-6 [scrollbar-width:none]">
      <span className={`${T.label} shrink-0 text-muted`}>Today</span>
      <Total icon={<span className="size-2 rounded-full bg-lime" />} label="Needs you" value={t?.held} count={t?.count.held} strong />
      <Total icon={<Icon name="x" className="text-bad" />} label="Blocked" value={t?.blocked} count={t?.count.blocked} />
      <Total icon={<Icon name="check" className="text-ok" />} label="Cleared" value={t?.cleared} count={t?.count.cleared} />
      <span className="flex-1" />
      <span title="Every bill's audit log is hash-chained and re-verified on load" className={`${T.small} flex shrink-0 items-center gap-1 ${chainIntact ? "text-muted" : "font-semibold text-bad"}`}>
        <Icon name={chainIntact ? "check" : "x"} className={chainIntact ? "text-ok" : ""} />
        {chainIntact ? "Audit chain intact" : "Audit chain broken"}
      </span>
    </div>
  );
}

function Total({ icon, label, value, count, strong = false }: { icon: ReactNode; label: string; value: number | undefined; count: number | undefined; strong?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="flex size-4 items-center justify-center">{icon}</span>
      <span className={`${T.small} ${strong ? "text-paper" : "text-muted"}`}>{label}</span>
      <Money value={value ?? 0} className={`${T.small} font-semibold ${strong ? "text-paper" : "text-muted"}`} />
      {count !== undefined && <span className={`${T.small} text-muted`}>· {count}</span>}
    </div>
  );
}
