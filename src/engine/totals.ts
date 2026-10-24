import { roundUsd } from "@/shared/normalize";
import type { BillRecord, Totals } from "@/types/bill";

/** Sum amount by status. Rejected bills are counted and left out of the three dollar totals. */
export function computeTotals(bills: BillRecord[]): Totals {
  const totals: Totals = {
    blocked: 0,
    held: 0,
    cleared: 0,
    count: { blocked: 0, held: 0, cleared: 0, rejected: 0 },
  };
  for (const bill of bills) {
    const amount = bill.amount ?? 0;
    if (bill.status === "BLOCKED") {
      totals.blocked = roundUsd(totals.blocked + amount);
      totals.count.blocked += 1;
    } else if (bill.status === "HELD") {
      totals.held = roundUsd(totals.held + amount);
      totals.count.held += 1;
    } else if (bill.status === "CLEARED") {
      totals.cleared = roundUsd(totals.cleared + amount);
      totals.count.cleared += 1;
    } else {
      totals.count.rejected += 1;
    }
  }
  return totals;
}
