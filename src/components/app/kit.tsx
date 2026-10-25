"use client";

/** Small pieces every app screen shares: header, back link, the status stamp, empty and loading states. */
import Link from "next/link";
import type { ReactNode } from "react";
import type { BillStatus } from "@/types/bill";
import { STATUS_LABEL } from "../desk/contract";
import { Icon, T } from "../desk/ui";

export function Screen({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <main className={`mx-auto flex w-full flex-col gap-6 px-6 py-6 ${wide ? "max-w-[1440px]" : "max-w-[1240px]"}`}>{children}</main>;
}

export function ScreenHeader({ title, sub, back, actions }: { title: ReactNode; sub?: ReactNode; back?: { href: string; label: string }; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-2">
      {back && (
        <Link href={back.href} className={`${T.small} flex w-fit items-center gap-1 rounded-full text-muted outline-none hover:text-paper focus-visible:ring-2 focus-visible:ring-paper`}>
          <Icon name="chevron" className="rotate-90" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1 className={T.title}>{title}</h1>
          {sub && <p className={`${T.small} mt-1 text-muted`}>{sub}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

const STAMP: Record<BillStatus, string> = {
  HELD: "bg-lime text-bar shadow-[inset_0_0_0_1.5px_#0a0a0a]",
  BLOCKED: "text-bad shadow-[inset_0_0_0_1.5px_var(--color-bad)]",
  CLEARED: "text-ok shadow-[inset_0_0_0_1.5px_var(--color-ok)]",
  REJECTED: "text-muted shadow-[inset_0_0_0_1.5px_var(--color-muted)]",
};

/** The receipt's stamp, shrunk for lists: the status word, slightly rotated. */
export function Stamp({ status, children }: { status: BillStatus; children?: ReactNode }) {
  return (
    <span className={`inline-flex h-6 shrink-0 -rotate-2 items-center justify-center whitespace-nowrap rounded-[5px] px-2 font-mono text-[11px] font-bold uppercase leading-4 tracking-[0.08em] ${STAMP[status]}`}>
      {children ?? STATUS_LABEL[status]}
    </span>
  );
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[16px] bg-card p-6">
      <p className={`${T.body} text-muted`}>{children}</p>
      {action}
    </div>
  );
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-16 animate-pulse rounded-[16px] bg-card" />)}
    </div>
  );
}

/** A small "who did this" chip for card titles: AI, CODE, YOU. */
export function WhoChip({ who }: { who: "AI" | "CODE" | "YOU" }) {
  const cls = who === "AI" ? "bg-[#a078ff]/15 text-[#c4aaff]" : who === "YOU" ? "bg-lime/15 text-lime" : "bg-white/[0.08] text-paper";
  return <span className={`inline-flex h-5 items-center rounded-full px-2 font-mono text-[11px] font-bold leading-4 tracking-[0.08em] ${cls}`}>{who}</span>;
}
