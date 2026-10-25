"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsd } from "@/engine/format";
import type { TotalsBarProps } from "./desk";

type Amounts = { blocked: number; held: number; cleared: number };

const ZERO: Amounts = { blocked: 0, held: 0, cleared: 0 };
const COUNT_UP_MS = 1200;

/**
 * Totals always come from props. While counting up, only the in-between frames are
 * interpolated; the last frame hands back to the prop values.
 */
function useCountUp(target: Amounts | undefined, enabled: boolean): Amounts | null {
  const [frame, setFrame] = useState<Amounts | null>(null);
  const prev = useRef<Amounts>(ZERO);

  useEffect(() => {
    if (!target) return;
    const from = prev.current;
    prev.current = target;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const same = from.blocked === target.blocked && from.held === target.held && from.cleared === target.cleared;
    if (!enabled || reduced || same) return;

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_UP_MS);
      const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
      if (t >= 1) {
        setFrame(null);
        return;
      }
      setFrame({
        blocked: from.blocked + (target.blocked - from.blocked) * e,
        held: from.held + (target.held - from.held) * e,
        cleared: from.cleared + (target.cleared - from.cleared) * e,
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setFrame(null);
    };
  }, [target?.blocked, target?.held, target?.cleared, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return frame;
}

function Meter({ label, value, share, blocked }: { label: string; value: number; share: number; blocked?: boolean }) {
  return (
    <div className="flex w-[220px] flex-col gap-2.5 min-[1400px]:w-[250px]">
      <div className="flex items-baseline justify-between text-[17px]">
        <span>{label}</span>
        <span className={`tabular-nums ${blocked ? "text-muted line-through" : "text-paper"}`}>{formatUsd(value)}</span>
      </div>
      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-raised">
        <div className={`h-full rounded-full ${blocked ? "bg-muted" : "bg-paper"}`} style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}

export function TotalsBar({ totals, auditChainIntact, intakeLabel, countUp }: TotalsBarProps) {
  const target = totals ? { blocked: totals.blocked, held: totals.held, cleared: totals.cleared } : undefined;
  const frame = useCountUp(target, countUp);
  const shown = frame ?? target ?? ZERO;
  // Visual share of the three buckets for the meter fills only; never printed.
  const sum = target ? target.blocked + target.held + target.cleared : 0;
  const share = (v: number) => (sum > 0 ? v / sum : 0);

  return (
    <section aria-label="Totals" className="flex items-end gap-x-12 pl-7">
      <h1 className="w-min flex-none text-[50px] font-medium [@media(max-height:820px)]:text-[42px] leading-[1] tracking-[-0.01em]">{intakeLabel}</h1>
      <div className="flex flex-none flex-col gap-1">
        <span className="text-[15px]">Needs you</span>
        <div className="flex items-center gap-4">
          <span className={`text-[66px] font-light leading-none [@media(max-height:820px)]:text-[56px] tracking-[-0.02em] tabular-nums ${totals ? "text-lime" : "text-muted"}`}>
            {formatUsd(shown.held).replace("$", "")}
          </span>
          <span className="rounded-full bg-raised px-3 py-1.5 text-[12px] font-semibold text-muted">USD</span>
        </div>
      </div>
      <div className="ml-auto flex flex-none items-start gap-12 pb-2">
        <Meter label="Blocked" value={shown.blocked} share={share(shown.blocked)} blocked />
        <div className="flex flex-col gap-1.5">
          <Meter label="Cleared" value={shown.cleared} share={share(shown.cleared)} />
          <span className={`text-[12px] ${auditChainIntact ? "text-muted" : "font-bold text-paper"}`}>
            Audit chain {auditChainIntact ? "✓ intact" : "✗ broken"}
          </span>
        </div>
      </div>
    </section>
  );
}
