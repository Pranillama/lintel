"use client";

import { useState } from "react";
import { humanRefusal } from "@/engine/human";
import type { BillView, PaymentRail } from "@/types/bill";
import { APPROVER_LABEL, errorMessage, type DeskActions } from "./desk";

const RAIL_LABEL: Record<PaymentRail, string> = {
  UTILITY_PORTAL: "Utility portal",
  ACH: "ACH",
  CHECK: "Check",
  X402_USDC: "x402 · USDC",
};

/** Bottom of the decision card. Which controls exist is decided by status and humanRefusal, never by the UI. */
export function ActionBar({ bill, actions }: { bill: BillView; actions: DeskActions }) {
  if (bill.status === "HELD") return <HeldActions bill={bill} actions={actions} />;

  if (bill.status === "BLOCKED") {
    return <p className="rounded-full bg-bar/[0.07] px-4 py-3 text-[14px] font-semibold">Blocked bills cannot be paid.</p>;
  }

  if (bill.status === "REJECTED") {
    return <p className="text-[14px] font-semibold text-muted">Rejected by a person.</p>;
  }

  const payment = bill.payment;
  const rail = payment?.rail ?? bill.decision.rail;
  return (
    <div className="flex min-w-0 items-center gap-3 text-[14px]">
      <span className="font-semibold">{rail ? RAIL_LABEL[rail] : "No rail"}</span>
      {payment && (
        <span className="label-mono shrink-0 rounded-full bg-bar/[0.08] px-2.5 py-1 text-[10.5px] font-semibold">
          {payment.mode === "SIMULATED" ? "Simulated" : "Testnet"}
        </span>
      )}
      {payment?.reference && (
        <span title={payment.reference} className="min-w-0 truncate font-mono text-[12px] text-muted">
          ref {payment.reference}
        </span>
      )}
    </div>
  );
}

function HeldActions({ bill, actions }: { bill: BillView; actions: DeskActions }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approveRefusal = humanRefusal(bill, "approve", bill.investigation);
  const rejectRefusal = humanRefusal(bill, "reject", bill.investigation);
  const helper = approveRefusal ?? rejectRefusal;

  async function run(kind: "approve" | "reject") {
    setBusy(kind);
    setError(null);
    try {
      const trimmed = note.trim() || undefined;
      await (kind === "approve" ? actions.approve(bill.id, trimmed) : actions.reject(bill.id, trimmed));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          className="btn btn-dark px-5 py-2.5 text-[14px]"
          disabled={approveRefusal !== null || busy !== null}
          onClick={() => run("approve")}
        >
          {busy === "approve" ? "Approving…" : `Approve as ${APPROVER_LABEL[bill.decision.required_approver]}`}
        </button>
        <button
          type="button"
          className="btn btn-outline px-5 py-2.5 text-[14px]"
          disabled={rejectRefusal !== null || busy !== null}
          onClick={() => run("reject")}
        >
          {busy === "reject" ? "Rejecting…" : "Reject"}
        </button>
        <label className="min-w-[110px] flex-1">
          <span className="sr-only">Note (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            maxLength={280}
            disabled={busy !== null}
            className="focus-ring w-full rounded-full bg-bar/[0.06] px-4 py-2.5 text-[13px] placeholder:text-muted"
          />
        </label>
      </div>
      {helper && <p title={helper} className="truncate text-[12px] text-muted">{helper}</p>}
      <p aria-live="polite" className="text-[12px] font-semibold empty:hidden">{error}</p>
    </div>
  );
}
