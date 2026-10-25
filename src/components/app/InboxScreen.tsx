"use client";

/**
 * Inbox: every bill, grouped by what the engine decided, needs-you first.
 * Group totals come from listBills' Totals (only shown unfiltered); the UI only counts rows.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { BillStatus, BillView } from "@/types/bill";
import { APPROVER_LABEL } from "../desk/contract";
import { storyKind, storyOf } from "../desk/story";
import { Icon, Money, shortDate, T } from "../desk/ui";
import { useApp, type PendingUpload } from "./AppProvider";
import { Empty, Loading, Screen, Stamp } from "./kit";

type Filter = "all" | "held" | "blocked" | "cleared" | "rejected";
const FILTERS: Array<[Filter, string, BillStatus | null]> = [
  ["all", "All", null], ["held", "Needs you", "HELD"], ["blocked", "Blocked", "BLOCKED"], ["cleared", "Cleared", "CLEARED"], ["rejected", "Rejected", "REJECTED"],
];
const GROUPS: Array<{ status: BillStatus; title: string; hint: string; tone: string }> = [
  { status: "HELD", title: "Needs you", hint: "Oldest first", tone: "text-lime" },
  { status: "BLOCKED", title: "Blocked · won't be paid", hint: "No approval needed", tone: "text-bad" },
  { status: "CLEARED", title: "Cleared", hint: "Approved for payment", tone: "text-ok" },
  { status: "REJECTED", title: "Rejected", hint: "A person said no", tone: "text-muted" },
];

export const TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });

const asFilter = (s: string | undefined): Filter => (FILTERS.some(([f]) => f === s) ? (s as Filter) : "all");

export function InboxScreen({ status, upload }: { status?: string; upload: boolean }) {
  const { data, pending, setUploadOpen } = useApp();
  const [filter, setFilter] = useState<Filter>(asFilter(status));
  const [property, setProperty] = useState("");
  const [vendor, setVendor] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => { if (upload) setUploadOpen(true); }, [upload, setUploadOpen]);

  const q = query.trim().toLowerCase();
  const narrowed = property !== "" || vendor !== "" || q !== "";
  const bills = data.bills.filter((b) =>
    (!property || b.match.property_id === property) &&
    (!vendor || b.match.vendor_id === vendor) &&
    (!q || [b.vendor_name, b.property_name, b.extracted.invoice_number.value, b.extracted.service_address.value].some((s) => s?.toLowerCase().includes(q))));
  const count = (s: BillStatus | null) => bills.filter((b) => s === null || b.status === s).length;
  const groups = GROUPS.filter((g) => filter === "all" || FILTERS.find(([f]) => f === filter)?.[2] === g.status);
  const portfolio = data.portfolio;

  return (
    <Screen wide>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex min-w-0 flex-col gap-5">
          <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className={T.title}>Inbox</h1>
            <p className={`${T.small} text-muted`}>Bills that need a person come first.</p>
          </header>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-full bg-card p-1" role="tablist" aria-label="Status">
              {FILTERS.map(([f, label, s]) => (
                <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                  className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[14px] leading-5 outline-none focus-visible:ring-2 focus-visible:ring-paper ${filter === f ? "bg-paper font-semibold text-bar" : "text-muted hover:text-paper"}`}>
                  {label} <span className={filter === f ? "text-bar/60" : ""}>{count(s)}</span>
                </button>
              ))}
            </div>
            <span className="flex-1" />
            <Select label="Property" value={property} onChange={setProperty} options={(portfolio?.properties ?? []).map((p) => [p.id, p.name])} />
            <Select label="Vendor" value={vendor} onChange={setVendor} options={(portfolio?.vendors ?? []).map((v) => [v.id, v.name])} />
            <label className="w-48">
              <span className="sr-only">Search</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search bills…"
                className="h-10 w-full rounded-full bg-card px-4 text-[14px] text-paper outline-none placeholder:text-muted focus:shadow-[inset_0_0_0_1px_rgba(242,241,236,0.5)]" />
            </label>
          </div>

          {data.loading ? <Loading /> : data.bills.length === 0 && pending.length === 0 ? (
            <Empty action={
              <div className="flex gap-2">
                {portfolio && portfolio.properties.length === 0 && <Link href="/properties" className="inline-flex h-10 items-center rounded-full px-4 text-[14px] font-semibold text-paper shadow-[inset_0_0_0_1px_rgba(242,241,236,0.3)]">Add properties first</Link>}
                <button type="button" onClick={() => setUploadOpen(true)} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-paper px-4 text-[14px] font-semibold text-bar"><Icon name="upload" /> Upload a bill</button>
              </div>
            }>No bills yet. Upload one and Lintel will read it, check it, and file it here.</Empty>
          ) : (
            <div className="flex flex-col gap-6">
              {pending.length > 0 && filter === "all" && <ProcessingGroup pending={pending} />}
              {groups.map((g) => {
                const rows = bills.filter((b) => b.status === g.status);
                if (g.status === "HELD") rows.reverse();
                if (rows.length === 0 && (g.status === "REJECTED" || filter === "all")) return null;
                const total = narrowed ? undefined : g.status === "HELD" ? data.totals?.held : g.status === "BLOCKED" ? data.totals?.blocked : g.status === "CLEARED" ? data.totals?.cleared : undefined;
                return (
                  <section key={g.status} aria-label={g.title} className="flex flex-col gap-2">
                    <div className="flex items-baseline gap-3 px-1">
                      <h2 className={`${T.label} ${g.tone}`}>{g.title}</h2>
                      <span className="font-mono text-[12px] font-semibold text-paper">{rows.length}{total !== undefined && <> · <Money value={total} /></>}</span>
                      <span className={`${T.small} ml-auto text-muted`}>{g.hint}</span>
                    </div>
                    {rows.length === 0 ? <p className={`${T.small} rounded-[16px] bg-card px-5 py-4 text-muted`}>Nothing here.</p> : (
                      <ul className="overflow-hidden rounded-[16px] bg-card">
                        {rows.map((b) => <Row key={b.id} bill={b} />)}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </section>

        <TodaysTab bills={data.bills} pending={pending} />
      </div>
    </Screen>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange(v: string): void; options: Array<[string, string]> }) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="h-10 max-w-40 cursor-pointer rounded-full bg-card px-4 text-[14px] text-paper outline-none focus-visible:ring-2 focus-visible:ring-paper">
        <option value="">{label}: All</option>
        {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
  );
}

function owner(bill: BillView): { text: string; you: boolean } {
  if (bill.status === "HELD") return { text: APPROVER_LABEL[bill.decision.required_approver], you: true };
  if (bill.status === "CLEARED") return { text: bill.resolved_by === "HUMAN" ? "By a person" : "Automatic", you: false };
  if (bill.status === "REJECTED") return { text: "Rejected", you: false };
  return { text: "No action", you: false };
}

function Row({ bill }: { bill: BillView }) {
  const story = storyOf(bill);
  const who = owner(bill);
  const guess = storyKind(bill) === "property" ? bill.match.candidates[0] : undefined;
  return (
    <li className="border-t border-white/[0.08] first:border-t-0">
      <Link href={`/bills/${encodeURIComponent(bill.id)}`}
        className={`grid grid-cols-[104px_minmax(0,1fr)_minmax(0,200px)_64px_140px_110px] items-center gap-4 px-5 py-4 outline-none transition-colors hover:bg-white/[0.04] focus-visible:bg-white/[0.06] ${bill.status === "HELD" ? "shadow-[inset_3px_0_0_var(--color-lime)]" : ""}`}>
        <span><Stamp status={bill.status} /></span>
        <span className="min-w-0">
          <span className={`${T.body} block truncate font-semibold`}>{bill.vendor_name ?? "Unknown vendor"}</span>
          <span className={`${T.small} block truncate text-muted`}>{story.headline}</span>
        </span>
        <span className={`${T.small} min-w-0 truncate ${bill.property_name && !guess ? "" : "text-muted"}`}>
          {guess ? `Best guess: ${guess.property_name}` : bill.property_name ?? "No property yet"}
        </span>
        <span className={`${T.small} text-muted`}>{shortDate(bill.extracted.due_date.value)}</span>
        <span className={`${T.label} truncate ${who.you ? "text-lime" : "text-muted"}`}>{who.text}</span>
        <Money value={bill.amount} struck={bill.status === "BLOCKED"} className={`${T.body} text-right font-semibold`} />
      </Link>
    </li>
  );
}

function ProcessingGroup({ pending }: { pending: PendingUpload[] }) {
  return (
    <section aria-label="Processing now" className="flex flex-col gap-2">
      <div className="flex items-baseline gap-3 px-1">
        <h2 className={`${T.label} text-paper`}>Processing now</h2>
        <span className="font-mono text-[12px] font-semibold">{pending.length}</span>
        <span className={`${T.small} ml-auto text-muted`}>Opens with its receipt when done</span>
      </div>
      <ul className="overflow-hidden rounded-[16px] bg-card">
        {pending.map((p) => (
          <li key={p.key} className="flex items-center gap-4 border-t border-white/[0.08] px-5 py-4 first:border-t-0">
            <span className="inline-flex h-6 items-center rounded-[5px] px-2 font-mono text-[11px] font-bold tracking-[0.08em] shadow-[inset_0_0_0_1.5px_#555]">READING</span>
            <span className="min-w-0 flex-1">
              <span className={`${T.body} block truncate font-semibold`}>{p.label}</span>
              <span className="mt-2 block h-1 w-56 overflow-hidden rounded-full bg-white/[0.08]"><span className="block h-full w-1/3 animate-pulse rounded-full bg-paper" /></span>
            </span>
            <span className={`${T.small} text-muted`}>Reading, matching, checking…</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A thermal-paper strip of today's bills, newest first: the printer, in miniature. */
function TodaysTab({ bills, pending }: { bills: BillView[]; pending: PendingUpload[] }) {
  const recent = bills.slice(0, 8);
  if (recent.length === 0 && pending.length === 0) return null;
  return (
    <aside aria-label="Today's tab" className="hidden flex-col gap-3 xl:flex">
      <span className={`${T.label} text-muted`}>Today&apos;s tab</span>
      <div className="relative rounded-[3px] bg-[#f6f4ec] px-5 pb-6 pt-4 font-mono text-[12.5px] leading-5 text-[#1b1b1b] shadow-[0_20px_40px_rgba(0,0,0,0.5)]">
        <p className="text-center font-sans text-[18px] font-bold tracking-[0.02em]">LINTEL</p>
        <p className="text-center text-[#8a877c]">AP DESK · TODAY</p>
        <hr className="my-2 border-t-[1.5px] border-dashed border-[#c9c5b8]" />
        {pending.map((p) => (
          <p key={p.key} className="flex justify-between gap-2"><span className="truncate">NOW {p.label.toUpperCase()}</span><span>…</span></p>
        ))}
        {recent.map((b) => (
          <Link key={b.id} href={`/bills/${encodeURIComponent(b.id)}`} className="block rounded-[2px] outline-none hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-[#1b1b1b]">
            <span className="flex justify-between gap-2">
              <span className={`truncate ${b.status === "HELD" ? "bg-lime" : ""}`}>{TIME.format(new Date(b.created_at))} {(b.vendor_name ?? "UNKNOWN").toUpperCase()}</span>
              <Money value={b.amount} struck={b.status === "BLOCKED"} className={b.status === "HELD" ? "bg-lime" : ""} />
            </span>
            <span className="block truncate pl-3 text-[#8a877c]">{b.status === "HELD" ? "NEEDS YOU" : b.status} · {storyOf(b).row.toUpperCase()}</span>
          </Link>
        ))}
        <hr className="my-2 border-t-[1.5px] border-dashed border-[#c9c5b8]" />
        <p className="flex justify-between font-bold"><span>AI DECISIONS ON MONEY</span><span>0</span></p>
      </div>
    </aside>
  );
}
