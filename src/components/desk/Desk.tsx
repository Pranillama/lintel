"use client";

/**
 * The AP desk. One bill is told as a four-step story, left to right:
 * Read in -> Code decided -> Agent drafted -> You decide.
 * A strip of bill tabs switches the story; Details (checks + history) sits
 * full width under the cards. Works with the Convex desk or the mock desk.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { BillStatus, BillView, FieldWithConfidence } from "@/types/bill";
import { AgentDraft, ProviderTags } from "./Agent";
import type { DeskActions, DeskData } from "./contract";
import { Decide } from "./Decide";
import { checksSummary, DetailsModal, type DetailsTab } from "./Details";
import { PolicySheet } from "./Drawers";
import { AssignControls, Evidence, evidenceTitle, PaymentLine } from "./Evidence";
import { CameInLine } from "./Pieces";
import { Portfolio } from "./Portfolio";
import { storyKind, storyOf } from "./story";
import { TestBill } from "./TestBill";
import { InsightStrip, TopBar } from "./TopBar";
import { Button, CARD, ErrorLine, Icon, Money, shortDate, StatusChip, StatusMark, T } from "./ui";
import { useDesk, type DeskHints, type DeskState } from "./useDesk";

const ORDER: Record<BillStatus, number> = { HELD: 0, BLOCKED: 1, CLEARED: 2, REJECTED: 3 };

export function Desk({ data, actions, hints }: { data: DeskData; actions: DeskActions; hints?: DeskHints }) {
  const desk = useDesk(data, actions, hints);
  const { bills, selected, loading, view, testOpen, setTestOpen, drawer, setDrawer } = desk;
  const overlay = testOpen || drawer !== null;
  const close = () => { setTestOpen(false); setDrawer(null); };
  const noPortfolio = data.portfolio !== undefined && data.portfolio.properties.length === 0;

  return (
    <main className="relative flex h-screen min-h-[640px] flex-col bg-bar text-paper">
      <TopBar
        view={view}
        onView={(v) => { close(); desk.setView(v); }}
        policyOpen={drawer === "policy"}
        onPolicy={() => { setTestOpen(false); setDrawer(drawer === "policy" ? null : "policy"); }}
        testOpen={testOpen}
        onTest={() => { setDrawer(null); setTestOpen(true); }}
      />
      <InsightStrip totals={data.totals} chainIntact={data.auditChainIntact} loading={loading} />

      {view === "portfolio" ? (
        <Portfolio data={data} actions={actions} onBill={desk.select} covered={overlay} />
      ) : (
        <>
          <BillTabs bills={bills} selectedId={selected?.id ?? null} flashId={desk.flashId} loading={loading} onSelect={desk.select} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? <StorySkeleton /> : selected ? (
              <Story key={selected.id} bill={selected} desk={desk} />
            ) : (
              <div className="flex flex-col items-start gap-4 px-6 py-12">
                <p className={T.hero}>No bills on the desk.</p>
                <p className={`${T.body} text-muted`}>
                  {noPortfolio ? "Add your properties and vendors first, so bills can be matched." : "Upload a bill or type one in to run it through the checks."}
                </p>
                <div className="flex gap-2">
                  {noPortfolio && <Button kind="solid" onClick={() => desk.setView("portfolio")}>Add properties &amp; vendors</Button>}
                  <Button kind={noPortfolio ? "secondary" : "solid"} onClick={() => setTestOpen(true)}><Icon name="plus" /> Test a bill</Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {overlay && (
        <div className="absolute inset-x-0 bottom-0 top-16 z-10 flex justify-end bg-bar/70 p-4" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          {testOpen && (
            <TestBill className="h-full w-[560px] max-w-full" actions={actions} bills={bills} onClose={close} onLanded={desk.landed} onView={(b) => desk.select(b.id)} />
          )}
          {drawer === "policy" && <PolicySheet portfolio={data.portfolio} onClose={close} />}
        </div>
      )}
    </main>
  );
}

/* ---------- Bill tabs: one row, scrolls sideways with a fade when it overflows ---------- */

function BillTabs({ bills, selectedId, flashId, loading, onSelect }: { bills: BillView[]; selectedId: string | null; flashId: string | null; loading: boolean; onSelect(id: string): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const tabs = [...bills].sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  // Fade whichever edge has more tabs behind it. Re-measured on resize, scroll, and when tabs are added.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    el.addEventListener("scroll", sync, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener("scroll", sync); };
  }, [tabs.length, loading]);

  // Keep the selected tab in view (new bills from Test a bill land off-screen).
  useEffect(() => {
    if (!selectedId) return;
    ref.current?.querySelector(`[data-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [selectedId, bills.length]);

  if (!loading && tabs.length === 0) return null;

  const mask = edges.left && edges.right
    ? "[mask-image:linear-gradient(to_right,transparent,black_48px,black_calc(100%-48px),transparent)]"
    : edges.right ? "[mask-image:linear-gradient(to_right,black_calc(100%-48px),transparent)]"
      : edges.left ? "[mask-image:linear-gradient(to_right,transparent,black_48px)]" : "";

  return (
    <nav aria-label="Bills" className="shrink-0 border-b border-white/[0.08]">
      <div ref={ref} className={`flex items-center gap-2 overflow-x-auto px-6 py-3 [scrollbar-width:none] ${mask}`}>
        {loading && [0, 1, 2, 3].map((i) => (
          <span key={i} className="flex h-10 w-48 shrink-0 animate-pulse items-center gap-2 rounded-full bg-card pl-2">
            <span className="size-6 rounded-full bg-muted/20" />
            <span className={`${T.small} text-muted`}>Loading…</span>
          </span>
        ))}
        {!loading && tabs.map((b) => {
          const on = b.id === selectedId;
          return (
            <button
              key={b.id}
              data-id={b.id}
              type="button"
              onClick={() => onSelect(b.id)}
              aria-current={on}
              className={`flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full pl-2 pr-4 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-paper ${on ? "bg-paper text-bar" : "bg-card hover:bg-white/[0.08]"} ${b.id === flashId ? "ring-2 ring-paper ring-offset-2 ring-offset-bar" : ""}`}
            >
              <StatusMark status={b.status} solid={on} />
              <span className={`${T.small} font-semibold`}>{b.vendor_name ?? "Unknown vendor"}</span>
              <Money value={b.amount} struck={b.status === "BLOCKED"} className={`${T.small} ${on ? "text-bar/60" : "text-muted"}`} />
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ---------- The story ---------- */

function Story({ bill, desk }: { bill: BillView; desk: DeskState }) {
  const story = storyOf(bill);
  const held = bill.status === "HELD";
  const agent = bill.investigation !== null && (held || bill.status === "BLOCKED" || bill.investigation.draft_sent);
  const [details, setDetails] = useState<DetailsTab | null>(null);
  const properties = desk.data.portfolio?.properties ?? [];
  const vendors = desk.data.portfolio?.vendors ?? [];

  const humanLabel = held ? "You decide" : bill.status === "REJECTED" || bill.resolved_by === "HUMAN" ? "A person decided" : "No human needed";

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <StatusChip status={bill.status} />
          <h1 className={`${T.title} min-w-0 flex-1`}>{bill.vendor_name ?? "Unknown vendor"}</h1>
          <Money value={bill.amount} struck={bill.status === "BLOCKED"} className={T.title} />
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p className={T.hero}>{story.headline}</p>
          <CameInLine bill={bill} />
        </div>
      </header>

      {/* Four columns from 1280px, two by two on tablets and small laptops, stacked on phones. */}
      <ol className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${agent ? "xl:grid-cols-[1fr_1.45fr_1.2fr_1fr]" : "xl:grid-cols-[1fr_1.45fr_0.75fr_1.2fr]"}`}>
        <Step n={1} label={bill.source === "DOCUMENT" ? "AI read" : "Read in"} state="done" sub={bill.source === "DOCUMENT" ? `Intake agent · ${bill.source_label ?? "document"}` : bill.source === "FEED" ? `${bill.source_label ?? "Feed"} record` : "Typed in Test a bill"}>
          <ReadFields bill={bill} />
        </Step>

        <Step n={2} label="Code decided" state="done" sub={evidenceTitle(bill)}>
          <Evidence bill={bill} vendors={vendors} />
          <DetailsLink onClick={() => setDetails("checks")}>{checksSummary(bill)}</DetailsLink>
        </Step>

        <Step n={3} label="Agent drafted" state={agent ? (bill.investigation?.status === "DONE" ? "done" : "now") : "none"} sub={agent ? <ProviderTags bill={bill} /> : undefined}>
          {agent ? <AgentDraft bill={bill} actions={desk.actions} /> : <p className={`${T.body} text-muted`}>No follow-up needed.</p>}
        </Step>

        <Step n={4} label={humanLabel} state={held ? "you" : "done"}>
          {held ? (
            <>
              <p className={T.body}>{story.next}</p>
              {storyKind(bill) === "property" ? (
                <>
                  <AssignControls bill={bill} properties={properties} actions={desk.actions} stacked />
                  <div className="border-t border-white/[0.08] pt-4"><Decide bill={bill} actions={desk.actions} /></div>
                </>
              ) : (
                <Decide bill={bill} actions={desk.actions} />
              )}
            </>
          ) : bill.status === "CLEARED" ? (
            <>
              <PaymentLine bill={bill} vendors={vendors} />
              <p className={`${T.small} text-muted`}>{bill.resolved_by === "HUMAN" ? "Resolved by a person. The log has the entry." : "Every check passed, so no one needed to touch it."}</p>
            </>
          ) : (
            <p className={T.body}>{story.next}</p>
          )}
          <DetailsLink onClick={() => setDetails("history")}>History · {bill.audit.length} entries</DetailsLink>
        </Step>
      </ol>

      {details && (
        <DetailsModal bill={bill} tab={details} chainIntact={desk.data.auditChainIntact} onTab={setDetails} onClose={() => setDetails(null)} />
      )}
    </div>
  );
}

/** The quiet link at the foot of a card that opens the Details modal. */
function DetailsLink({ children, onClick }: { children: ReactNode; onClick(): void }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={onClick}
      className="group mt-auto flex min-h-12 w-full cursor-pointer items-center gap-2 border-t border-white/[0.08] pt-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-paper"
    >
      <span className={`${T.small} min-w-0 flex-1 text-muted group-hover:text-paper`}>{children}</span>
      <Icon name="chevron" className="-rotate-90 text-muted group-hover:text-paper" />
    </button>
  );
}

type StepState = "done" | "now" | "you" | "none";

function Step({ n, label, state, sub, children }: { n: number; label: string; state: StepState; sub?: ReactNode; children: ReactNode }) {
  const you = state === "you";
  return (
    <li className={`${CARD} flex min-w-0 flex-col gap-4 ${you ? "shadow-[inset_0_0_0_2px_var(--color-lime)]" : ""}`}>
      <div className="flex min-h-8 items-center gap-2">
        <span className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-semibold leading-4 ${state === "done" ? "bg-paper text-bar" : "text-paper shadow-[inset_0_0_0_1px_rgba(242,241,236,0.6)]"} ${state === "none" ? "opacity-50" : ""}`}>{n}</span>
        <span className={`${T.label} min-w-0 flex-1 ${you ? "text-paper" : "text-muted"}`}>{label}</span>
      </div>
      {sub && <div className={`${T.small} -mt-2 flex text-muted`}>{sub}</div>}
      {children}
    </li>
  );
}

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const FIELDS: Array<[string, (b: BillView) => FieldWithConfidence<string | number>]> = [
  ["Vendor", (b) => b.extracted.vendor_name],
  ["Invoice", (b) => b.extracted.invoice_number],
  ["Account", (b) => b.extracted.account_number],
  ["Address", (b) => b.extracted.service_address],
  ["Amount", (b) => b.extracted.total_amount],
  ["Due", (b) => b.extracted.due_date],
  ["Usage", (b) => b.extracted.usage_qty],
];

function ReadFields({ bill }: { bill: BillView }) {
  const doc = bill.source === "DOCUMENT";
  return (
    <div className="flex flex-col">
      <dl className="flex flex-col">
        {FIELDS.map(([label, get]) => {
          const f = get(bill);
          let v = f.value === null ? "Not on the bill" : String(f.value);
          if (label === "Amount" && typeof f.value === "number") v = USD.format(f.value);
          if (label === "Due" && typeof f.value === "string") v = shortDate(f.value);
          if (label === "Usage" && f.value !== null) v = `${f.value} ${bill.extracted.usage_unit.value ?? ""}`;
          const low = doc && f.value !== null && f.confidence < 0.85;
          return (
            <div key={label} className="grid grid-cols-[72px_1fr] items-baseline gap-3 border-t border-white/[0.08] py-2 first:border-t-0">
              <dt className={`${T.small} text-muted`}>{label}</dt>
              <dd className={`${T.small} min-w-0 break-words ${f.value === null ? "text-muted" : ""}`}>
                {v}
                {doc && f.value !== null && <span className={low ? "font-semibold text-bad" : "text-muted"}> · {f.confidence.toFixed(2)}</span>}
              </dd>
            </div>
          );
        })}
      </dl>
      {doc && bill.extracted.extraction_error && <div className="border-t border-white/[0.08] pt-3"><ErrorLine>{bill.extracted.extraction_error}</ErrorLine></div>}
    </div>
  );
}

function StorySkeleton() {
  return (
    <div className="flex flex-col gap-6 px-6 py-6" aria-busy="true" aria-label="Loading bills">
      <div className="h-8 w-64 animate-pulse rounded-full bg-card" />
      <div className="h-12 w-[560px] max-w-full animate-pulse rounded-full bg-card" />
      <div className="grid grid-cols-[1fr_1.45fr_1.2fr_1fr] gap-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-80 animate-pulse rounded-[16px] bg-card" />)}
      </div>
    </div>
  );
}
