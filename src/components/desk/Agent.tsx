"use client";

/** The investigator's brief and draft. It drafts; only a person sends; it never changes the status. */
import { useEffect, useState } from "react";
import { humanRefusal } from "@/engine/human";
import type { BillView, DraftKind } from "@/types/bill";
import { errorMessage, type DeskActions } from "./contract";
import { humanize } from "./Details";
import { Button, ErrorLine, Icon, Modal, T, Tag } from "./ui";

const DRAFT_LABEL: Record<DraftKind, string> = {
  VENDOR_EMAIL: "Email to vendor",
  WORK_ORDER: "Work order",
  APPROVAL_REQUEST: "Approval request",
  MATCH_SUGGESTION: "Match suggestion",
  VENDOR_ONBOARDING: "Vendor onboarding",
};

/** Provider + quiet run chip. The CREAO API gives no public run URL, so no link. */
export function ProviderTags({ bill }: { bill: BillView }) {
  const brief = bill.investigation;
  if (!brief?.provider) return null;
  return (
    <span className="flex items-center gap-2">
      <Tag>{brief.provider}</Tag>
      {brief.provider === "CREAO" && brief.creao_run_id && <Tag title={brief.creao_run_id}>Run {brief.creao_run_id.slice(0, 8)}</Tag>}
    </span>
  );
}

function useElapsed(since: string | undefined, running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [running]);
  return since ? Math.max(0, Math.round((now - new Date(since).getTime()) / 1000)) : 0;
}

export function AgentDraft({ bill, actions }: { bill: BillView; actions: DeskActions }) {
  const brief = bill.investigation;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const working = brief?.status === "PENDING" || brief?.status === "RUNNING";
  const elapsed = useElapsed(brief?.started_at, working);
  if (!brief) return null;

  // Sendable while the exception is open (HELD or BLOCKED); the engine says why not otherwise.
  const refusal = humanRefusal(bill, "send-draft", brief);

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

  // Shown in the card and in the draft modal; both reflect the same sent state.
  const sendControl = brief.draft_sent ? (
    <span className={`${T.small} inline-flex h-10 items-center gap-2 rounded-full bg-ok/15 px-4 font-semibold text-ok`}><Icon name="check" /> Sent by you</span>
  ) : refusal === null ? (
    <Button kind="secondary" disabled={busy} onClick={send}>
      <Icon name="send" /> {busy ? "Sending…" : "Send"}
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-4" aria-busy={working}>
      {working && (
        <div className="flex flex-col gap-3" aria-label="Investigating">
          <p className={`${T.small} text-muted`}>Pulling history and drafting a follow-up… {elapsed}s</p>
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-muted/20" />
          <div className="h-4 w-full animate-pulse rounded-full bg-muted/20" />
          <div className="h-4 w-5/6 animate-pulse rounded-full bg-muted/20" />
        </div>
      )}
      {brief.status === "FAILED" && <ErrorLine>{brief.error ?? "The investigator did not finish."}</ErrorLine>}
      {brief.status === "DONE" && (
        <>
          {/* Real briefs run long: three lines here, the whole brief in the modal. */}
          <p className={`${T.body} line-clamp-3`}>{brief.summary}</p>
          {!brief.draft && (
            <Button kind="text" aria-haspopup="dialog" className="self-start px-0!" onClick={() => setOpen(true)}>Read full brief</Button>
          )}
          {brief.draft && (
            <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-4">
              <div className="flex min-w-0 items-start gap-3">
                <Icon name="doc" className="mt-1 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className={`${T.body} font-semibold`}>{brief.draft.subject}</p>
                  <p className={`${T.small} text-muted`}>{DRAFT_LABEL[brief.draft.kind]} · {brief.draft.to}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {sendControl}
                <Button kind="text" aria-haspopup="dialog" onClick={() => setOpen(true)}>Read draft</Button>
              </div>
              {!brief.draft_sent && refusal && <p className={`${T.small} text-muted`}>{refusal}</p>}
            </div>
          )}
          {error && <ErrorLine>{error}</ErrorLine>}
          {open && (
            <Modal
              title={brief.draft ? brief.draft.subject : "Investigator brief"}
              sub={brief.draft ? `${DRAFT_LABEL[brief.draft.kind]} · ${brief.draft.to}` : bill.vendor_name ?? undefined}
              aside={<ProviderTags bill={bill} />}
              footer={
                brief.draft ? (
                  <>
                    {sendControl}
                    <p className={`${T.small} min-w-0 flex-1 text-muted`}>
                      {!brief.draft_sent && refusal ? refusal : "Agents draft. People send. Nothing leaves the app (simulated)."}
                    </p>
                    {error && <ErrorLine>{error}</ErrorLine>}
                  </>
                ) : undefined
              }
              onClose={() => setOpen(false)}
            >
              <div className="flex flex-col gap-6">
                <section className="flex flex-col gap-2">
                  <h3 className={`${T.label} text-muted`}>What the agent found</h3>
                  <p className={T.body}>{brief.summary}</p>
                  {brief.findings.length > 0 && (
                    <ul className={`${T.small} flex list-disc flex-col gap-1 pl-5 text-muted`}>
                      {brief.findings.map((f, i) => <li key={i}>{humanize(f)}</li>)}
                    </ul>
                  )}
                </section>
                {brief.draft && (
                  <section className="flex flex-col gap-2">
                    <h3 className={`${T.label} text-muted`}>Draft</h3>
                    <p className={`${T.body} whitespace-pre-line rounded-[10px] bg-bar p-4`}>{brief.draft.body}</p>
                  </section>
                )}
              </div>
            </Modal>
          )}
        </>
      )}
    </div>
  );
}
