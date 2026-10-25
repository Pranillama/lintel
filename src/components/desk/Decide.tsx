"use client";

/** Approve / Reject for a HELD bill. Which controls exist comes from humanRefusal, never from the UI. */
import { useState } from "react";
import { hasPriority2, humanRefusal } from "@/engine/human";
import type { BillView } from "@/types/bill";
import { APPROVER_LABEL, errorMessage, type DeskActions } from "./contract";
import { Button, ErrorLine, Icon } from "./ui";

export function Decide({ bill, actions }: { bill: BillView; actions: DeskActions }) {
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (bill.status !== "HELD") return null;

  const approveRefusal = humanRefusal(bill, "approve", bill.investigation);
  const showApprove = !(approveRefusal && hasPriority2(bill.decision.reasons));

  async function run(kind: "approve" | "reject") {
    setBusy(kind);
    setError(null);
    try {
      const n = note.trim() || undefined;
      await (kind === "approve" ? actions.approve(bill.id, n) : actions.reject(bill.id, n));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {showApprove && (
          <Button kind="primary" disabled={busy !== null || approveRefusal !== null} onClick={() => run("approve")}>
            {busy === "approve" ? "Approving…" : `Approve as ${APPROVER_LABEL[bill.decision.required_approver]}`}
          </Button>
        )}
        <Button kind="secondary" disabled={busy !== null} onClick={() => run("reject")}>
          {busy === "reject" ? "Rejecting…" : showApprove ? "Reject" : "Reject bill"}
        </Button>
        {!noteOpen && <Button kind="text" onClick={() => setNoteOpen(true)}><Icon name="plus" /> Note</Button>}
      </div>
      {noteOpen && (
        <input
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note for the log (optional)"
          maxLength={280}
          className="h-10 w-full rounded-[10px] bg-bar px-4 text-[14px] text-paper shadow-[inset_0_0_0_1px_rgba(242,241,236,0.15)] outline-none placeholder:text-muted focus:shadow-[inset_0_0_0_1px_rgba(242,241,236,0.6)]"
        />
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
    </div>
  );
}
