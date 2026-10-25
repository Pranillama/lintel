"use client";

import { useState, type ReactNode } from "react";
import type { Totals } from "@/types/bill";
import type { DrawerKind } from "./contract";
import { Button, Icon, Money, T } from "./ui";

/**
 * Slim top bar: brand + tagline, the three totals, the audit chain, a quiet
 * operator menu (Policy, Real vs simulated, Replay) and Test a bill.
 */
export function TopBar({ totals, chainIntact, replaying, onTest, testOpen, onDrawer, onReplay }: {
  totals: Totals | undefined;
  chainIntact: boolean;
  replaying: boolean;
  onTest(): void;
  testOpen: boolean;
  onDrawer(kind: DrawerKind): void;
  onReplay(): void;
}) {
  const t = replaying ? undefined : totals;
  return (
    <header className="flex h-16 shrink-0 items-center gap-6 border-b border-white/[0.08] px-6">
      <div className="flex shrink-0 items-baseline gap-3">
        <span className="text-[24px] font-semibold leading-8 tracking-[-0.02em]">Lintel</span>
        <span className={`${T.label} hidden text-muted min-[1600px]:inline`}>AI reads · Code decides · Human owns</span>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-6">
        <Total icon={<span className="size-2 rounded-full bg-lime" />} label="Needs you" value={t?.held} count={t?.count.held} strong />
        <Total icon={<Icon name="x" className="text-bad" />} label="Blocked" value={t?.blocked} count={t?.count.blocked} />
        <Total icon={<Icon name="check" className="text-ok" />} label="Cleared" value={t?.cleared} count={t?.count.cleared} />
        <span title="Every bill's audit log is hash-chained and re-verified on load" className={`${T.small} flex shrink-0 items-center gap-1 ${chainIntact ? "text-muted" : "font-semibold text-bad"}`}>
          <Icon name={chainIntact ? "check" : "x"} className={chainIntact ? "text-ok" : ""} />
          {chainIntact ? "Chain intact" : "Chain broken"}
        </span>
      </div>
      <OperatorMenu onDrawer={onDrawer} onReplay={onReplay} replaying={replaying} />
      <Button kind="solid" aria-pressed={testOpen} onClick={onTest}>
        <Icon name="plus" /> Test a bill
        <kbd className="ml-1 rounded-[4px] px-1 font-mono text-[12px] leading-4 text-bar/60 shadow-[inset_0_0_0_1px_rgba(10,10,10,0.25)]">J</kbd>
      </Button>
    </header>
  );
}

function Total({ icon, label, value, count, strong = false }: { icon: ReactNode; label: string; value: number | undefined; count: number | undefined; strong?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="flex size-4 items-center justify-center">{icon}</span>
      <span className={`${T.small} ${strong ? "text-paper" : "text-muted"}`}>{label}</span>
      <Money value={value ?? 0} className={`${T.small} font-semibold ${strong ? "text-paper" : "text-muted"}`} />
      {count !== undefined && <span className={`${T.small} hidden text-muted min-[1360px]:inline`}>· {count}</span>}
    </div>
  );
}

function OperatorMenu({ onDrawer, onReplay, replaying }: { onDrawer(kind: DrawerKind): void; onReplay(): void; replaying: boolean }) {
  const [open, setOpen] = useState(false);
  const item = "flex h-10 w-full cursor-pointer items-center rounded-[10px] px-3 text-left text-[14px] leading-5 outline-none hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-paper disabled:cursor-not-allowed disabled:opacity-40";
  const pick = (fn: () => void) => () => { setOpen(false); fn(); };
  return (
    <div
      className="relative"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}
    >
      <Button kind="text" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        How it works <Icon name="chevron" />
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-20 flex w-60 flex-col rounded-[16px] bg-card p-2 shadow-[0_16px_48px_rgba(0,0,0,0.6),inset_0_0_0_1px_rgba(255,255,255,0.08)]">
          <button role="menuitem" type="button" className={item} onClick={pick(() => onDrawer("policy"))}>Policy</button>
          <button role="menuitem" type="button" className={item} onClick={pick(() => onDrawer("rvs"))}>Real vs simulated</button>
          <div className="my-1 border-t border-white/[0.08]" />
          <button role="menuitem" type="button" className={`${item} text-muted`} disabled={replaying} onClick={pick(onReplay)}>
            Replay Saturday intake
          </button>
        </div>
      )}
    </div>
  );
}
