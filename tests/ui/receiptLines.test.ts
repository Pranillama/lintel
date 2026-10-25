import { describe, expect, it } from "vitest";
import { decide } from "@/engine/decide";
import { computeTotals } from "@/engine/totals";
import { matchBill } from "@/match/matchBill";
import { OPENING_BATCH } from "@/seed/demo-inputs";
import { PROPERTIES, VENDORS } from "@/seed/portfolio";
import { buildReceiptLines, fitRow, LINE_CHARS, receiptStats, sectionAt, type ReceiptLine } from "@/components/receipt/receiptLines";
import type { AuditEvent, BillView, BillsResponse } from "@/types/bill";
import { extractedFrom, NOT_RUN, seedLedger } from "../helpers/ledger";

/** Runs the opening batch through the real engine, the way processBill does for FEED bills. */
function openingBills(): BillView[] {
  const ledger = seedLedger();
  return OPENING_BATCH.map((row, i) => {
    const extracted = extractedFrom(row.form);
    const match = matchBill(extracted, ledger);
    const decision = decide({ bill_id: row.key, extracted, match, crs: NOT_RUN, ledger });
    return {
      id: row.key,
      created_at: `2026-10-24T16:14:0${i}.000Z`,
      source: "FEED",
      source_label: "Saturday intake",
      extracted,
      match,
      crs: NOT_RUN,
      decision,
      status: decision.status,
      resolved_by: "AUTO",
      payment: null,
      vendor_name: VENDORS.find((v) => v.id === match.vendor_id)?.name ?? null,
      property_name: PROPERTIES.find((p) => p.id === match.property_id)?.name ?? null,
      amount: extracted.total_amount.value,
      audit: [],
      investigation: null,
    };
  });
}

function response(bills = openingBills(), intact = true): BillsResponse {
  return { bills, totals: computeTotals(bills), audit_chain_intact: intact };
}

const rows = (lines: ReceiptLine[]) => lines.filter((l): l is Extract<ReceiptLine, { kind: "row" }> => l.kind === "row");
const rowStarting = (lines: ReceiptLine[], prefix: string) => rows(lines).find((r) => r.left.startsWith(prefix));

describe("receipt lines from listBills", () => {
  it("prints every bill with the engine's amount and status", () => {
    const lines = buildReceiptLines(response());
    const pge = rowStarting(lines, "PG&E");
    expect(pge?.right).toBe("$2,290.40");
    const rec = rowStarting(lines, "RECOLOGY");
    expect(rec?.right).toBe("$680.00");
    expect(rec?.strike).toBe(true);
    const ebmud = rowStarting(lines, "EBMUD");
    expect(ebmud?.right).toBe("$5,680.00");
    expect(ebmud?.highlight).toBe(true);
    expect(rows(lines).some((r) => r.right === "NEEDS YOU" && r.left.includes("USAGE SPIKE"))).toBe(true);
    expect(rows(lines).some((r) => r.left.includes("HELD FOR") && r.right === "VP FINANCE")).toBe(true);
  });

  it("takes the totals from the response, not from its own math", () => {
    const res = response();
    res.totals = { ...res.totals, held: 1234.5 };
    const lines = buildReceiptLines(res);
    expect(rowStarting(lines, "NEEDS YOU ·")?.right).toBe("$1,234.50");
    expect(rowStarting(buildReceiptLines(response()), "BLOCKED ·")?.right).toBe("$680.00");
    expect(rowStarting(buildReceiptLines(response()), "CLEARED ·")?.right).toBe("$2,290.40");
  });

  it("counts what the desk did from the decisions", () => {
    const s = receiptStats(openingBills());
    expect(s).toMatchObject({ billsRead: 4, checksRun: 32, duplicatesCaught: 1, spikesFlagged: 1, addressesToTeach: 1, duplicatesPaid: 0, aiMoneyDecisions: 0 });
  });

  it("counts an AI actor on a money action, so the big number cannot lie", () => {
    const bills = openingBills();
    const event = { actor: "AI_INVESTIGATOR", action: "DECISION", hash: "f".repeat(64) } as AuditEvent;
    bills[0] = { ...bills[0], audit: [event] };
    expect(receiptStats(bills).aiMoneyDecisions).toBe(1);
  });

  it("reports a broken audit chain", () => {
    const lines = buildReceiptLines(response(undefined, false));
    expect(lines.some((l) => l.kind === "text" && l.text.includes("BROKEN"))).toBe(true);
  });

  it("prints an empty tab when there are no bills", () => {
    const lines = buildReceiptLines(response([]));
    expect(lines.some((l) => l.kind === "text" && l.text === "NO BILLS ON THIS TAB YET")).toBe(true);
    expect(lines.some((l) => l.kind === "big")).toBe(false);
  });

  it("keeps every row on one 80 mm line", () => {
    for (const r of rows(buildReceiptLines(response()))) expect(r.left.length + r.right.length + 2).toBeLessThanOrEqual(LINE_CHARS);
    expect(fitRow("X".repeat(80), "$1.00")).toMatch(/…$/);
  });

  it("names the section for the caption", () => {
    const lines = buildReceiptLines(response());
    const firstBill = lines.findIndex((l) => l.kind === "row" && l.left.startsWith("PG&E"));
    expect(sectionAt(lines, firstBill)).toBe("BILLS IN · 4");
    expect(sectionAt(lines, 0)).toBeNull();
  });
});
