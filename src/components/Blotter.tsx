import type { ReactNode } from "react";
import { BillRow } from "./BillRow";
import { StatusChip } from "./StatusChip";
import type { BlotterProps } from "./desk";

function SkeletonCard() {
  return (
    <div aria-hidden className="flex min-h-[104px] flex-none items-center gap-4 rounded-card bg-card px-5 py-4">
      <span className="size-[58px] flex-none rounded-full border-2 border-dashed border-raised" />
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="h-3 w-3/5 rounded-full bg-raised" />
        <span className="h-6 w-2/5 rounded-full bg-raised" />
        <span className="h-3 w-1/3 rounded-full bg-raised" />
      </span>
      <StatusChip reading className="flex-none" />
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return <div className="flex min-h-[104px] flex-none items-center rounded-card bg-card px-6 text-[14px] text-muted">{text}</div>;
}

export function Blotter({ bills, tab, selectedId, onSelect, intakeLabel, onReplay, replaying, flashId }: BlotterProps) {
  // `bills` is newest first. The opening batch reads in replay order (oldest first); live bills stay newest first.
  const opening = bills.filter((b) => b.source === "FEED").reverse();
  const live = bills.filter((b) => b.source !== "FEED");

  let body: ReactNode;
  if (replaying) {
    body = (
      <>
        <span className="sr-only" role="status">Replaying the opening bills…</span>
        {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
      </>
    );
  } else if (bills.length === 0) {
    body = <EmptyCard text={tab === "all" ? "No bills yet. Press Replay or test a bill." : "No bills in this view."} />;
  } else {
    body = (
      <>
        {opening.map((b, i) => (
          <BillRow key={b.id} bill={b} selected={b.id === selectedId} onSelect={onSelect} flash={b.id === flashId} revealIndex={i} />
        ))}
        {live.length > 0 && (
          <div className="label-mono flex flex-none items-center gap-2 px-2 pt-1 text-muted">
            <span aria-hidden className="size-1.5 rounded-full bg-paper" />
            Live
          </div>
        )}
        {live.map((b) => (
          <BillRow key={b.id} bill={b} selected={b.id === selectedId} onSelect={onSelect} flash={b.id === flashId} revealIndex={-1} />
        ))}
      </>
    );
  }

  return (
    <section aria-label="Bills" className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-none items-center justify-between px-2 text-[13px] text-muted">
        <span className="truncate">
          {intakeLabel} · {bills.length} {bills.length === 1 ? "bill" : "bills"}
        </span>
        <button
          type="button"
          onClick={onReplay}
          disabled={replaying}
          className="focus-ring flex-none cursor-pointer rounded-full px-3 py-1 text-[13px] text-paper hover:bg-card disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-transparent"
        >
          {replaying ? "Replaying…" : "Replay"}
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">{body}</div>
    </section>
  );
}
