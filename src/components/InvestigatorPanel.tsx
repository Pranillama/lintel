"use client";

import { useState } from "react";
import { humanRefusal } from "@/engine/human";
import type { BillView, DraftKind } from "@/types/bill";
import { errorMessage, type DeskActions } from "./desk";

const DRAFT_LABEL: Record<DraftKind, string> = {
  VENDOR_EMAIL: "Vendor email",
  WORK_ORDER: "Work order",
  APPROVAL_REQUEST: "Approval request",
  MATCH_SUGGESTION: "Match suggestion",
  VENDOR_ONBOARDING: "Vendor onboarding",
};

const STATUS_LABEL = { PENDING: "Queued", RUNNING: "Running", DONE: "Done", FAILED: "Failed" } as const;

/** The investigator's brief. It can draft; only a person can send, and it never changes the status. */
export function InvestigatorPanel({ bill, actions }: { bill: BillView; actions: DeskActions }) {
  const brief = bill.investigation;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!brief) {
    return <p className="flex-1 text-[14px] text-muted">No investigator brief for this bill.</p>;
  }

  const sendRefusal = humanRefusal(bill, "send-draft", brief);
  const working = brief.status === "PENDING" || brief.status === "RUNNING";

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await actions.sendDraft(bill.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2">
        {brief.provider && (
          <span className="label-mono rounded-md px-2 py-0.5 text-[10.5px] font-semibold shadow-[inset_0_0_0_1.5px_currentColor]">
            {brief.provider}
          </span>
        )}
        <span className="text-[12.5px] text-muted">{working ? "Investigating…" : STATUS_LABEL[brief.status]}</span>
        {brief.creao_share_url && (
          <a href={brief.creao_share_url} target="_blank" rel="noopener noreferrer" className="focus-ring ml-auto rounded text-[12.5px] text-muted underline-offset-2 hover:underline">
            View CREAO run ↗
          </a>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1" aria-busy={working}>
        {working && <Skeleton />}
        {brief.status === "FAILED" && <p className="truncate text-[13px] text-muted" title={brief.error ?? undefined}>{brief.error ?? "The investigator did not finish."}</p>}
        {brief.status === "DONE" && (
          <div className="space-y-3">
            {brief.draft && (
              <p className="text-[16px] font-medium leading-snug">
                {DRAFT_LABEL[brief.draft.kind]} · {brief.draft.subject}
              </p>
            )}
            <p className="text-[13.5px] leading-relaxed text-muted">{brief.summary}</p>
            {brief.findings.length > 0 && (
              <ul className="list-disc space-y-1 pl-4 text-[12.5px] leading-snug text-muted">
                {brief.findings.map((finding, i) => <li key={i}>{finding}</li>)}
              </ul>
            )}
            {brief.draft && (
              <div className="rounded-[18px] bg-raised px-4 py-3 text-[12.5px] leading-snug">
                <p className="text-muted">To {brief.draft.to}</p>
                <p title={brief.draft.body} className="mt-1 line-clamp-4 whitespace-pre-line">{brief.draft.body}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-4">
        {brief.status === "DONE" && brief.draft && (
          brief.draft_sent ? (
            <span className="btn btn-outline px-5 py-2.5 text-[14px]" aria-label="Draft sent">Sent ✓</span>
          ) : (
            <button type="button" className="btn btn-light px-5 py-2.5 text-[14px]" disabled={sendRefusal !== null || busy} title={sendRefusal ?? undefined} onClick={send}>
              {busy ? "Sending…" : "Send"}
            </button>
          )
        )}
        <p className="text-[12.5px] text-muted">Agents draft. People send. Code decides.</p>
      </div>
      <p aria-live="polite" className="-mt-2 text-[12px] font-semibold text-paper empty:hidden">{error}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-4 w-2/3 animate-pulse rounded-full bg-raised" />
      <div className="h-3 w-full animate-pulse rounded-full bg-raised" />
      <div className="h-3 w-5/6 animate-pulse rounded-full bg-raised" />
      <div className="h-3 w-3/4 animate-pulse rounded-full bg-raised" />
      <div className="h-16 w-full animate-pulse rounded-[18px] bg-raised" />
    </div>
  );
}
