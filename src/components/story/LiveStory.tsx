"use client";

/**
 * The receipt story over the whole screen, fed by Convex. For an upload it follows the
 * bill as its audit rows land; for a replay it prints a stored bill's history. Which
 * buttons show at the end comes from humanRefusal, never from the UI.
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { humanRefusal } from "@/engine/human";
import type { BillView, IntakeSource } from "@/types/bill";
import { APPROVER_LABEL, errorMessage } from "../desk/contract";
import { storyKind, storyOf } from "../desk/story";
import { useApp } from "../app/AppProvider";
import { liveScript } from "./liveScript";
import { ReceiptStory, storyButton as b } from "./ReceiptStory";
import type { StoryScript } from "./script";

/** An upload this browser started; the story follows it until the stamp. */
export interface LiveRun {
  key: number;
  source: Extract<IntakeSource, "DOCUMENT" | "FORM">;
  startedAt: number;
  /** Bills already on the desk when the run started, so the new one can be told apart. */
  knownIds: Set<string>;
  filename: string | null;
  invoice: string | null;
  result: BillView | null;
  error: string | null;
}

const FOLLOW_UP_WAIT_MS = 60_000;

function findRunBill(run: LiveRun, bills: BillView[]): BillView | null {
  if (run.result) {
    // The subscription can trail the call's own answer by a beat; the copy with more rows is the newer one.
    const listed = bills.find((x) => x.id === run.result!.id);
    if (!listed || listed.audit.length < run.result.audit.length) return run.result;
    return listed.investigation || !run.result.investigation ? listed : { ...listed, investigation: run.result.investigation };
  }
  return bills.find((x) => !run.knownIds.has(x.id) && (run.filename !== null
    ? x.source === "DOCUMENT" && x.source_label === run.filename
    : x.source === "FORM" && x.extracted.invoice_number.value === run.invoice)) ?? null;
}

export function LiveStory({ run, replay, onClose }: { run?: LiveRun; replay?: BillView; onClose(): void }) {
  const { data } = useApp();
  const bill = replay ? (data.bills.find((x) => x.id === replay.id) ?? replay) : run ? findRunBill(run, data.bills) : null;
  const [stopWaiting, setStopWaiting] = useState(!!replay);
  const [frozen, setFrozen] = useState<{ script: StoryScript; bill: BillView } | null>(null);

  const script = frozen?.script ?? liveScript({
    source: replay?.source ?? run?.source ?? "DOCUMENT",
    startedAt: run?.startedAt ?? 0,
    bill,
    done: !!replay || !!run?.result,
    stopWaiting,
  });
  // Once the ticket is complete it stops changing: later rows (a person approving) belong to the bill page.
  if (script.complete && !frozen && bill) setFrozen({ script, bill });

  const waitingOnFollowUp = !frozen && script.waiting?.item === "draft" && !!run?.result;
  useEffect(() => {
    if (!waitingOnFollowUp) return;
    const t = window.setTimeout(() => setStopWaiting(true), FOLLOW_UP_WAIT_MS);
    return () => window.clearTimeout(t);
  }, [waitingOnFollowUp]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  const error = run?.error ?? null;
  const clock = replay ? replayClock(replay) : run ? { start: run.startedAt } : undefined;

  return (
    <div role="dialog" aria-modal="true" aria-label={replay ? "Replay: how this bill was handled" : "Checking your bill"} className="fixed inset-0 z-50 bg-bar">
      <ReceiptStory
        {...script}
        waiting={error ? { lcd: "STOPPED · SEE MESSAGE" } : script.waiting}
        kicker={replay ? "Replay · one bill, start to finish" : "Live · one bill, start to finish"}
        clock={clock}
        cta={frozen && bill ? <NextStep bill={bill} onClose={onClose} replay={!!replay} /> : null}
        corner={
          <>
            {error && <p role="alert" className={`${b.err} max-w-[300px] text-right`}>Couldn&apos;t finish: {error}</p>}
            <button type="button" onClick={onClose} className={`${b.base} ${b.ghost}`}>{frozen || error ? "Close" : "Close · keeps running"}</button>
          </>
        }
      />
      <p className="sr-only" aria-live="polite">{frozen && bill ? `${script.stamp?.word}. ${storyOf(bill).headline}.` : error ? `Couldn't finish: ${error}` : "Checking the bill."}</p>
    </div>
  );
}

/** Real time from the bill arriving to its last automated row. */
function replayClock(bill: BillView): { start: number; stop: number } {
  const auto = bill.audit.filter((e) => !e.action.startsWith("HUMAN_") && e.action !== "ALIAS_STORED" && e.action !== "DRAFT_SENT");
  const ts = auto.map((e) => Date.parse(e.ts));
  return { start: Math.min(...ts), stop: Math.max(...ts) };
}

function NextStep({ bill, onClose, replay }: { bill: BillView; onClose(): void; replay: boolean }) {
  const router = useRouter();
  const { actions } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const open = () => { onClose(); router.push(`/bills/${encodeURIComponent(bill.id)}`); };
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try { await fn(); open(); } catch (e) { setErr(errorMessage(e)); setBusy(false); }
  };
  const approver = APPROVER_LABEL[bill.decision.required_approver];
  const canApprove = humanRefusal(bill, "approve", bill.investigation) === null;
  const canReject = humanRefusal(bill, "reject", bill.investigation) === null;
  const draft = humanRefusal(bill, "send-draft", bill.investigation) === null ? bill.investigation?.draft ?? null : null;
  const sendLabel = draft?.kind === "VENDOR_EMAIL" ? `Send email to ${bill.vendor_name ?? "the vendor"}` : draft?.kind === "WORK_ORDER" ? "Send the work order" : "Send the drafted follow-up";
  const who = bill.status === "HELD"
    ? bill.decision.reasons.includes("NEEDS_PROPERTY_MATCH") ? "Pick the property to continue" : canApprove ? `Waiting on ${approver}` : storyOf(bill).headline
    : bill.status === "BLOCKED" ? (storyKind(bill) === "duplicate" ? "Duplicates are never paid" : storyOf(bill).headline)
    : bill.status === "CLEARED" ? (bill.resolved_by === "HUMAN" ? "Approved by a person" : "No one needed to touch it")
    : "Rejected. Nothing will be paid.";
  const stay = replay ? onClose : open;
  return (
    <>
      <div className={b.who}>{who}</div>
      {canApprove && <button type="button" disabled={busy} className={`${b.base} ${b.lime}`} onClick={() => act(() => actions.approve(bill.id))}>Approve as {approver}</button>}
      {canReject && <button type="button" disabled={busy} className={`${b.base} ${b.ghost}`} onClick={() => act(() => actions.reject(bill.id))}>Reject</button>}
      {draft && <button type="button" disabled={busy} className={`${b.base} ${canApprove ? b.ghost : b.lime}`} onClick={() => act(() => actions.sendDraft(bill.id))}>{sendLabel}</button>}
      <button type="button" disabled={busy} className={`${b.base} ${canApprove || draft ? b.ghost : b.lime}`} onClick={stay}>{replay ? "Back to the bill" : bill.status === "HELD" && !canApprove ? "Open the bill to decide" : "Open the bill"}</button>
      {err && <p role="alert" className={b.err}>{err}</p>}
    </>
  );
}
