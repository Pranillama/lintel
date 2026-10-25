"use client";

/** Where a bill came from, as one quiet line. */
import type { BillView } from "@/types/bill";
import { shortDate, T } from "./ui";

export function sourceText(bill: BillView): string {
  if (bill.source === "FEED") return `${bill.source_label ?? "Feed"} feed`;
  if (bill.source === "DOCUMENT") return `Upload · ${bill.source_label ?? "document"}`;
  return "Typed in Test a bill";
}

/** Property · invoice · due · source, one quiet line. */
export function CameInLine({ bill, withSource = true }: { bill: BillView; withSource?: boolean }) {
  const parts = [
    bill.property_name ?? "No property yet",
    bill.extracted.invoice_number.value ? `Invoice ${bill.extracted.invoice_number.value}` : null,
    bill.extracted.due_date.value ? `Due ${shortDate(bill.extracted.due_date.value)}` : null,
    withSource ? sourceText(bill) : null,
  ].filter(Boolean);
  return (
    <p className={`${T.small} text-muted`}>
      {parts.map((p, i) => <span key={i}>{i > 0 && <span aria-hidden> · </span>}{p}</span>)}
    </p>
  );
}
