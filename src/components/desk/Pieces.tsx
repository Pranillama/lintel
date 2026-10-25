"use client";

/** Where a bill came from, as one quiet line. */
import type { BillView } from "@/types/bill";

export function sourceText(bill: BillView): string {
  if (bill.source === "FEED") return `${bill.source_label ?? "Feed"} feed`;
  if (bill.source === "DOCUMENT") return `Upload · ${bill.source_label ?? "document"}`;
  return "Typed in";
}
