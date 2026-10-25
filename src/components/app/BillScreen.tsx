"use client";

/**
 * One bill: the ticket prints on the left (Variation C) while the decision panel on the
 * right waits for the stamp. Verdict and the next action come first; the detail sits in
 * four plain-language tabs: what Lintel checked, what the bill says, what the AI prepared, history.
 */
import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import type { BillView } from "@/types/bill";
import { AgentDraft, ProviderTags } from "../desk/Agent";
import { CHECK_LABEL } from "../desk/contract";
import { Decide } from "../desk/Decide";
import { humanize, OutcomeChip, sortedChecks } from "../desk/Details";
import { AssignControls, Evidence, evidenceTitle, PaymentLine } from "../desk/Evidence";
import { sourceText } from "../desk/Pieces";
import { storyKind, storyOf } from "../desk/story";
import { Button, CARD, ErrorLine, Icon, Money, shortDate, T } from "../desk/ui";
import { useApp } from "./AppProvider";
import { Empty, Loading, Screen, ScreenHeader, Stamp, WhoChip } from "./kit";
import { actorOf, confidenceWord, eventNote, eventTitle, type ActorKind } from "./plain";
import { ReceiptTicket } from "./ReceiptTicket";
import { LiveStory } from "../story/LiveStory";

/** bill id -> the status its ticket was last printed with, this session. A new status prints again. */
const printed = new Map<string, string>();

export function BillScreen({ id }: { id: string }) {
  const { data } = useApp();
  const bill = data.bills.find((b) => b.id === id);
  if (data.loading) return <Screen wide><Loading rows={3} /></Screen>;
  if (!bill) return <Screen><ScreenHeader title="Bill not found" back={{ href: "/inbox", label: "Inbox" }} /><Empty>This bill isn&apos;t on the desk. It may have been reset.</Empty></Screen>;
  return <BillDetail key={bill.id} bill={bill} />;
}

type Tab = "checked" | "says" | "ai" | "history";

function BillDetail({ bill }: { bill: BillView }) {
  const { data, actions } = useApp();
  const [reduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [replay, setReplay] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0, stamped: false });
  const [tab, setTab] = useState<Tab>("checked");
  const [story, setStory] = useState(false);
  const animate = !reduced && printed.get(bill.id) !== bill.status;
  const ready = !animate || progress.stamped;

  const onProgress = useCallback((done: number, total: number, stamped: boolean) => setProgress({ done, total, stamped }), []);
  const onDone = useCallback(() => { printed.set(bill.id, bill.status); setProgress((p) => ({ ...p, stamped: true })); }, [bill.id, bill.status]);

  const next = data.bills.filter((b) => b.status === "HELD" && b.id !== bill.id).at(-1);
  const portfolio = data.portfolio;

  return (
    <Screen wide>
      <ScreenHeader
        back={{ href: "/inbox", label: "Inbox" }}
        title={<span className="flex flex-wrap items-center gap-3"><Stamp status={bill.status} />{bill.vendor_name ?? "Unknown vendor"}<Money value={bill.amount} struck={bill.status === "BLOCKED"} className="text-muted" /></span>}
        sub={[bill.property_name ?? "No property yet", bill.extracted.invoice_number.value && `Invoice ${bill.extracted.invoice_number.value}`, `Due ${shortDate(bill.extracted.due_date.value)}`, sourceText(bill)].filter(Boolean).join(" · ")}
        actions={next && (
          <Link href={`/bills/${encodeURIComponent(next.id)}`} className={`${T.small} flex items-center gap-2 rounded-full px-3 py-2 text-muted outline-none hover:text-paper focus-visible:ring-2 focus-visible:ring-paper`}>
            Next that needs you: <span className="font-semibold text-paper">{next.vendor_name}</span> <Money value={next.amount} /> <Icon name="arrow" />
          </Link>
        )}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,500px)_minmax(0,1fr)]">
        <section className="flex flex-col gap-2 lg:sticky lg:top-[124px] lg:h-[calc(100vh-200px)] lg:min-h-[520px]">
          <div className="min-h-[480px] flex-1 lg:min-h-0">
            <ReceiptTicket key={`${replay}-${bill.status}`} bill={bill} animate={animate} onProgress={onProgress} onDone={onDone} />
          </div>
          <div className="flex items-center gap-2 px-1">
            <span className={`${T.label} flex-1 text-muted`}>Bill ticket · one line per step</span>
            {animate && !progress.stamped ? (
              <Button kind="text" onClick={onDone}>Skip</Button>
            ) : (
              <Button kind="text" disabled={reduced} title={reduced ? "Motion is reduced on this device" : undefined} onClick={() => { printed.delete(bill.id); setProgress({ done: 0, total: 0, stamped: false }); setReplay((r) => r + 1); }}>Print again</Button>
            )}
            <Button kind="text" aria-haspopup="dialog" onClick={() => setStory(true)}>Watch the full story</Button>
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          <DecisionPanel bill={bill} ready={ready} done={progress.done} total={progress.total} />

          <div role="tablist" aria-label="Bill details" className="flex gap-1 border-b border-white/[0.08]">
            <TabButton on={tab === "checked"} onClick={() => setTab("checked")}>What Lintel checked</TabButton>
            <TabButton on={tab === "says"} onClick={() => setTab("says")}>What the bill says</TabButton>
            <TabButton on={tab === "ai"} onClick={() => setTab("ai")}>What the AI prepared</TabButton>
            <TabButton on={tab === "history"} onClick={() => setTab("history")}>History <span className="text-muted">{bill.audit.length}</span></TabButton>
          </div>

          <div role="tabpanel" className={`${CARD} flex flex-col gap-4`}>
            {tab === "checked" && (
              <>
                <CardTitle who="CODE" title="What Lintel checked" sub={evidenceTitle(bill)} />
                <Evidence bill={bill} vendors={portfolio?.vendors ?? []} />
                <AllChecks bill={bill} />
              </>
            )}
            {tab === "says" && <BillSays bill={bill} />}
            {tab === "ai" && (
              <>
                <CardTitle who="AI" title="What the AI prepared" sub={<ProviderTags bill={bill} />} />
                {bill.investigation ? <AgentDraft bill={bill} actions={actions} /> : <p className={`${T.body} text-muted`}>No follow-up needed for this bill.</p>}
                <p className={`${T.small} text-muted`}>The AI drafts after the decision. It can&apos;t change the bill or move money; only a person sends.</p>
              </>
            )}
            {tab === "history" && <History bill={bill} chainIntact={data.auditChainIntact} />}
          </div>
        </section>
      </div>
      {story && <LiveStory replay={bill} onClose={() => setStory(false)} />}
    </Screen>
  );
}

function TabButton({ on, onClick, children }: { on: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={on} onClick={onClick}
      className={`-mb-px cursor-pointer whitespace-nowrap border-b-2 px-3 py-2 text-[14px] leading-5 outline-none focus-visible:ring-2 focus-visible:ring-paper ${on ? "border-paper font-semibold text-paper" : "border-transparent text-muted hover:text-paper"}`}>
      {children}
    </button>
  );
}

function CardTitle({ who, title, sub }: { who: "AI" | "CODE" | "YOU"; title: string; sub?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <WhoChip who={who} />
      <h2 className={`${T.body} font-semibold`}>{title}</h2>
      {sub && <span className={`${T.small} ml-auto flex items-center text-muted`}>{sub}</span>}
    </div>
  );
}

/* ---------- Decision: verdict and the next action first, sticky ---------- */

function DecisionPanel({ bill, ready, done, total }: { bill: BillView; ready: boolean; done: number; total: number }) {
  const { data, actions } = useApp();
  const story = storyOf(bill);
  const held = bill.status === "HELD";
  if (!ready) {
    return (
      <div className={`${CARD} lg:sticky lg:top-[124px] lg:z-10`} aria-live="polite">
        <p className={`${T.label} text-muted`}>Printing… {done} of {total} checks</p>
        <p className={`${T.title} mt-2 text-muted`}>Lintel is going through this bill.</p>
        <p className={`${T.small} mt-1 text-muted`}>Rules run in order. The AI reads and drafts; it never decides.</p>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
          <div className="h-full rounded-full bg-paper transition-[width] duration-200" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
      </div>
    );
  }
  return (
    <div className={`${CARD} flex flex-col gap-3 lg:sticky lg:top-[124px] lg:z-10 ${held ? "shadow-[inset_0_0_0_2px_var(--color-lime)]" : ""}`} aria-live="polite">
      <CardTitle who={held ? "YOU" : "CODE"} title={held ? "What you need to do" : "Outcome"} />
      <p className={T.title}>{story.headline}</p>
      {held ? (
        <>
          <p className={`${T.body} text-muted`}>{story.next}</p>
          {storyKind(bill) === "property" ? (
            <>
              <AssignControls bill={bill} properties={data.portfolio?.properties ?? []} actions={actions} />
              <div className="border-t border-white/[0.08] pt-3"><Decide bill={bill} actions={actions} /></div>
            </>
          ) : <Decide bill={bill} actions={actions} />}
        </>
      ) : bill.status === "CLEARED" ? (
        <>
          <PaymentLine bill={bill} vendors={data.portfolio?.vendors ?? []} />
          <p className={`${T.small} text-muted`}>{bill.resolved_by === "HUMAN" ? "A person approved it. The history has the entry." : "Every check passed, so no one needed to touch it."}</p>
        </>
      ) : (
        <p className={`${T.body} text-muted`}>{story.next}</p>
      )}
    </div>
  );
}

/* ---------- Every check, collapsed under the evidence ---------- */

function AllChecks({ bill }: { bill: BillView }) {
  const checks = sortedChecks(bill);
  const failed = checks.filter((c) => c.outcome === "HALT" || c.outcome === "BLOCK").length;
  return (
    <details className="group border-t border-white/[0.08] pt-3">
      <summary className={`${T.small} flex cursor-pointer list-none items-center gap-2 text-muted outline-none hover:text-paper focus-visible:ring-2 focus-visible:ring-paper`}>
        <Icon name="chevron" className="-rotate-90 transition-transform group-open:rotate-0" />
        All {checks.length} checks · {failed === 0 ? "all passed" : `${failed} stopped it`}
      </summary>
      <ul className="mt-3 flex flex-col">
        {checks.map((c) => (
          <li key={c.id} className="grid grid-cols-[80px_minmax(0,1fr)] gap-x-3 border-t border-white/[0.08] py-2.5 first:border-t-0">
            <span className="pt-0.5"><OutcomeChip outcome={c.outcome} /></span>
            <span className={`${T.small} text-muted`}><span className="font-semibold text-paper">{CHECK_LABEL[c.id]}. </span>{humanize(c.rationale)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/* ---------- What the bill says: fields with Sure / Double-check / Unsure ---------- */

const FIELDS: Array<[string, (b: BillView) => { value: string | number | null; confidence: number; source_snippet: string | null }]> = [
  ["Vendor", (b) => b.extracted.vendor_name],
  ["Invoice", (b) => b.extracted.invoice_number],
  ["Amount", (b) => b.extracted.total_amount],
  ["Due", (b) => b.extracted.due_date],
  ["Service address", (b) => b.extracted.service_address],
  ["Account", (b) => b.extracted.account_number],
  ["Usage", (b) => b.extracted.usage_qty],
];

const WORD_STYLE = { Sure: "bg-ok/15 text-ok", "Double-check": "bg-lime/15 text-lime", Unsure: "bg-bad/15 text-bad" } as const;

function BillSays({ bill }: { bill: BillView }) {
  const doc = bill.source === "DOCUMENT";
  return (
    <>
      <CardTitle who={doc ? "AI" : bill.source === "FEED" ? "CODE" : "YOU"} title="What the bill says" sub={doc ? "Read by Claude · hover a word to see where it came from" : bill.source === "FEED" ? "From the bill feed" : "Typed in by a person"} />
      <dl className="flex flex-col">
        {FIELDS.map(([label, get]) => {
          const f = get(bill);
          let v = f.value === null ? "Not on the bill" : String(f.value);
          if (label === "Amount" && typeof f.value === "number") v = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(f.value);
          if (label === "Due" && typeof f.value === "string") v = shortDate(f.value);
          if (label === "Usage" && f.value !== null) v = `${f.value} ${bill.extracted.usage_unit.value ?? ""}`;
          const word = doc && f.value !== null ? confidenceWord(f.confidence) : null;
          return (
            <div key={label} className="grid grid-cols-[140px_minmax(0,1fr)_auto] items-center gap-3 border-t border-white/[0.08] py-2.5 first:border-t-0">
              <dt className={`${T.small} text-muted`}>{label}</dt>
              <dd className={`${T.body} min-w-0 break-words ${f.value === null ? "text-muted" : ""}`}>{v}</dd>
              {word && (
                <span tabIndex={0} title={f.source_snippet ? `On the bill: “${f.source_snippet}” · ${f.confidence.toFixed(2)}` : `Confidence ${f.confidence.toFixed(2)}`}
                  className={`inline-flex h-6 cursor-help items-center rounded-full px-2.5 text-[12px] font-semibold leading-4 outline-none focus-visible:ring-2 focus-visible:ring-paper ${WORD_STYLE[word]}`}>
                  {word}
                </span>
              )}
            </div>
          );
        })}
      </dl>
      {doc && bill.extracted.extraction_error && <ErrorLine>{bill.extracted.extraction_error}</ErrorLine>}
      {doc && <p className={`${T.small} text-muted`}>Unsure fields stop the bill for a person. Lintel never pays on a partial read.</p>}
    </>
  );
}

/* ---------- History: people and systems in plain words; fingerprints behind Verify ---------- */

const ACTOR_STYLE: Record<ActorKind, string> = {
  AI: "bg-[#a078ff]/15 text-[#c4aaff]",
  CODE: "bg-white/[0.08] text-paper",
  PERSON: "bg-lime/15 text-lime",
  OUTSIDE: "bg-white/[0.04] text-muted",
};
const TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit", second: "2-digit" });

function History({ bill, chainIntact }: { bill: BillView; chainIntact: boolean }) {
  const [verify, setVerify] = useState(false);
  const events = [...bill.audit].sort((a, b) => b.seq - a.seq);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className={`${T.body} font-semibold`}>History</h2>
        <span className={`${T.small} text-muted`}>Newest first · {events.length} steps · nothing can be edited</span>
        <label className={`${T.small} ml-auto flex cursor-pointer items-center gap-2 text-muted`}>
          <input type="checkbox" checked={verify} onChange={(e) => setVerify(e.target.checked)} className="size-4 accent-[var(--color-lime)]" />
          Verify
        </label>
      </div>
      {verify && (
        <p className={`${T.small} flex items-center gap-2 rounded-[10px] bg-bar px-4 py-3 ${chainIntact ? "text-ok" : "text-bad"}`}>
          <Icon name={chainIntact ? "check" : "x"} />
          {chainIntact ? "Chain intact. Each step's fingerprint includes the one before it, so a changed step would break every one after." : "Chain broken. A step was changed after it was written."}
        </p>
      )}
      <ol className="flex flex-col">
        {events.map((e) => {
          const who = actorOf(e, bill);
          const note = humanize(eventNote(e, bill));
          return (
            <li key={e.id} className={`grid items-baseline gap-3 border-t border-white/[0.08] py-2.5 first:border-t-0 ${verify ? "grid-cols-[96px_minmax(0,180px)_minmax(0,1fr)_88px]" : "grid-cols-[96px_minmax(0,180px)_minmax(0,1fr)]"}`}>
              <time dateTime={e.ts} className="font-mono text-[12px] leading-4 text-muted">{TIME.format(new Date(e.ts))}</time>
              <span><span className={`inline-flex h-6 max-w-full items-center truncate rounded-full px-2.5 text-[12px] font-semibold leading-4 ${ACTOR_STYLE[who.kind]}`}>{who.label}</span></span>
              <span className="min-w-0">
                <span className={`${T.small} block font-semibold`}>{eventTitle(e)}</span>
                {note && <span title={note} className={`${T.small} line-clamp-2 text-muted`}>{note}</span>}
              </span>
              {verify && <span className="text-right font-mono text-[12px] leading-4 text-muted" title={e.hash}>{e.hash.slice(0, 8)}</span>}
            </li>
          );
        })}
      </ol>
    </>
  );
}
