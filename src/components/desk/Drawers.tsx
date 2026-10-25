"use client";

/** Policy: a read-only sheet over the story, content from getPortfolio. Sheet is shared with the portfolio view. */
import type { ReactNode } from "react";
import { formatUsd } from "@/engine/format";
import type { PortfolioResponse } from "@/types/bill";
import { Icon, T } from "./ui";

export function Sheet({ title, sub, onClose, children }: { title: string; sub: string; onClose(): void; children: ReactNode }) {
  return (
    <aside role="dialog" aria-label={title} className="flex h-full w-[640px] max-w-full flex-col overflow-hidden rounded-[16px] bg-card">
      <header className="flex shrink-0 items-start gap-4 px-6 pb-4 pt-6">
        <div className="min-w-0 flex-1">
          <h2 className={T.title}>{title}</h2>
          <p className={`${T.small} text-muted`}>{sub}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full text-muted outline-none hover:text-paper focus-visible:ring-2 focus-visible:ring-paper">
          <Icon name="close" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>
    </aside>
  );
}

function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-3">
      {[0, 1, 2, 3].map((i) => <div key={i} className="h-4 animate-pulse rounded-full bg-muted/20" style={{ width: `${90 - i * 10}%` }} />)}
    </div>
  );
}

export function PolicySheet({ portfolio, onClose }: { portfolio: PortfolioResponse | undefined; onClose(): void }) {
  return (
    <Sheet title="Policy" sub="Read-only at this desk. The text comes from the same constants the engine runs." onClose={onClose}>
      {!portfolio ? <Loading /> : (
        <div className="flex flex-col gap-6">
          <ol className="flex flex-col">
            {portfolio.policy_text.map((rule, i) => (
              <li key={i} className="grid grid-cols-[24px_1fr] gap-3 border-t border-white/[0.08] py-3 first:border-t-0">
                <span className="font-mono text-[12px] font-semibold leading-6 text-muted">{i + 1}</span>
                <span className={T.body}>{rule}</span>
              </li>
            ))}
          </ol>
          {portfolio.properties.length > 0 && <section className="flex flex-col">
            <h3 className={`${T.label} pb-2 text-muted`}>Contractor auto-pay limits</h3>
            {portfolio.properties.map((p) => (
              <div key={p.id} className="flex items-baseline justify-between gap-4 border-t border-white/[0.08] py-2">
                <span className={T.body}>{p.name}</span>
                <span className={`${T.body} tabular-nums`}>{formatUsd(p.contractor_auto_pay_limit)}</span>
              </div>
            ))}
          </section>}
          <p className={`${T.small} text-muted`}>{portfolio.seats_line}</p>
        </div>
      )}
    </Sheet>
  );
}
