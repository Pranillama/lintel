"use client";

/**
 * The audit log across every bill, newest first, said in words: who did what to which
 * bill. Filters by who acted. Fingerprints (hashes) stay hidden until Verify is on.
 */
import Link from "next/link";
import { useState } from "react";
import type { AuditEvent, BillView } from "@/types/bill";
import { humanize } from "../desk/Details";
import { Icon, T } from "../desk/ui";
import { useApp } from "./AppProvider";
import { Empty, Loading, Screen, ScreenHeader } from "./kit";
import { actorOf, eventNote, eventTitle, type ActorKind } from "./plain";

type Who = "all" | ActorKind;
const WHO: Array<[Who, string]> = [["all", "Everyone"], ["PERSON", "People"], ["CODE", "Lintel's rules"], ["AI", "AI"], ["OUTSIDE", "Outside checks"]];
const ACTOR_STYLE: Record<ActorKind, string> = {
  AI: "bg-[#a078ff]/15 text-[#c4aaff]",
  CODE: "bg-white/[0.08] text-paper",
  PERSON: "bg-lime/15 text-lime",
  OUTSIDE: "bg-white/[0.04] text-muted",
};
const WHEN = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
const PAGE = 60;

export function AuditScreen() {
  const { data } = useApp();
  const [who, setWho] = useState<Who>("all");
  const [verify, setVerify] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const rows: Array<{ e: AuditEvent; bill: BillView; kind: ActorKind; label: string }> = data.bills
    .flatMap((bill) => bill.audit.map((e) => ({ e, bill, ...actorOf(e, bill) })))
    .filter((r) => who === "all" || r.kind === who)
    .sort((a, b) => b.e.ts.localeCompare(a.e.ts) || b.e.seq - a.e.seq);

  return (
    <Screen>
      <ScreenHeader
        title="Audit log"
        sub="Every step on every bill, newest first. Nothing here can be edited or deleted."
        actions={
          <label className={`${T.small} flex cursor-pointer items-center gap-2 rounded-full bg-card px-4 py-2.5 text-muted`}>
            <input type="checkbox" checked={verify} onChange={(e) => setVerify(e.target.checked)} className="size-4 accent-[var(--color-lime)]" />
            Verify fingerprints
          </label>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-full bg-card p-1" role="tablist" aria-label="Who acted">
          {WHO.map(([w, label]) => (
            <button key={w} type="button" role="tab" aria-selected={who === w} onClick={() => { setWho(w); setLimit(PAGE); }}
              className={`h-8 cursor-pointer rounded-full px-3 text-[14px] leading-5 outline-none focus-visible:ring-2 focus-visible:ring-paper ${who === w ? "bg-paper font-semibold text-bar" : "text-muted hover:text-paper"}`}>
              {label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <span className={`${T.small} flex items-center gap-2 ${data.auditChainIntact ? "text-ok" : "font-semibold text-bad"}`}>
          <Icon name={data.auditChainIntact ? "check" : "x"} />
          {data.auditChainIntact ? "Every bill's chain checks out" : "A chain is broken: a step was changed after it was written"}
        </span>
      </div>
      {verify && (
        <p className={`${T.small} rounded-[10px] bg-card px-4 py-3 text-muted`}>
          Each step&apos;s fingerprint is computed from the step and the fingerprint before it, so changing any past step breaks every fingerprint after it. Lintel recomputes them every time this page loads.
        </p>
      )}

      {data.loading ? <Loading /> : rows.length === 0 ? <Empty>{who === "PERSON" ? "No person has acted on a bill yet." : "Nothing yet."}</Empty> : (
        <ol className="overflow-hidden rounded-[16px] bg-card">
          {rows.slice(0, limit).map(({ e, bill, label, kind }) => {
            const note = humanize(eventNote(e, bill));
            return (
              <li key={e.id} className={`grid items-baseline gap-4 border-t border-white/[0.08] px-6 py-3 first:border-t-0 ${verify ? "grid-cols-[150px_190px_minmax(0,1fr)_200px_88px]" : "grid-cols-[150px_190px_minmax(0,1fr)_200px]"}`}>
                <time dateTime={e.ts} className="font-mono text-[12px] leading-4 text-muted">{WHEN.format(new Date(e.ts))}</time>
                <span><span className={`inline-flex h-6 max-w-full items-center truncate rounded-full px-2.5 text-[12px] font-semibold leading-4 ${ACTOR_STYLE[kind]}`}>{label}</span></span>
                <span className="min-w-0">
                  <span className={`${T.small} block font-semibold`}>{eventTitle(e)}</span>
                  {note && <span title={note} className={`${T.small} line-clamp-1 text-muted`}>{note}</span>}
                </span>
                <Link href={`/bills/${encodeURIComponent(bill.id)}`} className={`${T.small} truncate text-muted hover:text-paper`}>
                  {bill.vendor_name ?? "Unknown vendor"}{bill.extracted.invoice_number.value ? ` · ${bill.extracted.invoice_number.value}` : ""}
                </Link>
                {verify && <span className="text-right font-mono text-[12px] leading-4 text-muted" title={e.hash}>{e.hash.slice(0, 8)}</span>}
              </li>
            );
          })}
        </ol>
      )}
      {rows.length > limit && <button type="button" onClick={() => setLimit((l) => l + PAGE)} className={`${T.small} self-start rounded-full px-4 py-2 text-muted shadow-[inset_0_0_0_1px_rgba(242,241,236,0.3)] hover:text-paper`}>Show {Math.min(PAGE, rows.length - limit)} more</button>}
    </Screen>
  );
}
