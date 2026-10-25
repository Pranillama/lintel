import { describe, expect, it } from "vitest";
import { appendEvents } from "@/audit/append";
import { decisionAuditDrafts } from "@/audit/drafts";
import { decide } from "@/engine/decide";
import { matchBill } from "@/match/matchBill";
import { OPENING_BATCH } from "@/seed/demo-inputs";
import { PROPERTIES, VENDORS } from "@/seed/portfolio";
import { actorOf, confidenceWord, eventNote } from "@/components/app/plain";
import { billTicket, paymentWord, row, stampOf, TICKET_WIDTH } from "@/components/app/ticket";
import type { AuditEvent, BillView } from "@/types/bill";
import { extractedFrom, NOT_RUN, seedLedger } from "../helpers/ledger";

/** Opening-batch bills through the real engine, with the audit rows processBill would write. */
async function bills(): Promise<BillView[]> {
  const ledger = seedLedger();
  return Promise.all(OPENING_BATCH.map(async (r, i) => {
    const extracted = extractedFrom(r.form);
    const match = matchBill(extracted, ledger);
    const decision = decide({ bill_id: r.key, extracted, match, crs: NOT_RUN, ledger });
    const ts = `2026-10-24T16:14:0${i}.000Z`;
    const audit = await appendEvents(null, decisionAuditDrafts({ bill_id: r.key, ts, source: "FEED", source_label: "Saturday intake", extracted, match, crs: NOT_RUN, decision }));
    return {
      id: r.key, created_at: ts, source: "FEED", source_label: "Saturday intake", extracted, match, crs: NOT_RUN, decision,
      status: decision.status, resolved_by: "AUTO", payment: null,
      vendor_name: VENDORS.find((v) => v.id === match.vendor_id)?.name ?? null,
      property_name: PROPERTIES.find((p) => p.id === match.property_id)?.name ?? null,
      amount: extracted.total_amount.value, audit, investigation: null,
    } satisfies BillView;
  }));
}

const byVendor = async (name: string) => (await bills()).find((b) => b.vendor_name === name) as BillView;

describe("bill ticket", () => {
  it("prints one line per audit row, fitted to the paper", async () => {
    const ebmud = await byVendor("EBMUD");
    const lines = billTicket(ebmud);
    expect(lines.filter((l) => l.lcd && l.text.match(/^\S \d\d:\d\d:\d\d /))).toHaveLength(ebmud.audit.length);
    for (const l of lines) expect(l.text.length).toBeLessThanOrEqual(TICKET_WIDTH);
    expect(lines.filter((l) => l.check)).toHaveLength(ebmud.decision.checks.length);
  });

  it("marks the failing check and quotes the engine's numbers and rule", async () => {
    const lines = billTicket(await byVendor("EBMUD"));
    expect(lines.find((l) => l.kind === "hl" && l.text.includes("SPIKE CHECK"))?.text.endsWith("HOLD")).toBe(true);
    expect(lines.some((l) => l.text.includes("+281.0%"))).toBe(true);
    expect(lines.some((l) => l.text.includes("HOLD ABOVE +25%"))).toBe(true);
  });

  it("stamps and pays by the engine's status", async () => {
    const all = await bills();
    const held = all.find((b) => b.status === "HELD" && b.vendor_name === "EBMUD") as BillView;
    const blocked = all.find((b) => b.status === "BLOCKED") as BillView;
    expect(stampOf(held)).toEqual({ word: "NEEDS YOU", sub: "HELD FOR VP FINANCE" });
    expect(paymentWord(held)).toBe("WAITS FOR YOU");
    expect(stampOf(blocked).word).toBe("BLOCKED");
    expect(paymentWord(blocked)).toBe("WON'T BE PAID");
    expect(billTicket(blocked).find((l) => l.text.startsWith("AMOUNT"))?.text.endsWith("$680.00")).toBe(true);
  });

  it("truncates long left text and keeps the right text whole", () => {
    const r = row("A".repeat(60), "RIGHT");
    expect(r).toHaveLength(TICKET_WIDTH);
    expect(r.endsWith(" RIGHT")).toBe(true);
  });
});

describe("plain labels", () => {
  it("says confidence as a word around the engine's floor", () => {
    expect(confidenceWord(0.99)).toBe("Sure");
    expect(confidenceWord(0.9)).toBe("Double-check");
    expect(confidenceWord(0.84)).toBe("Unsure");
  });

  it("names actors as people and systems, never codes", async () => {
    const ebmud = await byVendor("EBMUD");
    const labels = ebmud.audit.map((e) => actorOf(e, ebmud).label);
    expect(labels).toContain("Lintel's rules");
    const approve = { ...ebmud.audit[0], actor: "HUMAN_OPERATOR", action: "HUMAN_APPROVE", rationale: "VP_FINANCE: ok by me", data: { approver: "VP_FINANCE" } } as AuditEvent;
    expect(actorOf(approve, ebmud).label).toBe("A person, as VP Finance");
    expect(eventNote(approve, ebmud)).toBe("ok by me");
  });

  it("says matches with names instead of ids", async () => {
    const ebmud = await byVendor("EBMUD");
    const property = ebmud.audit.find((e) => e.action === "RESOLVE_PROPERTY") as AuditEvent;
    expect(property.rationale).toContain("PROP-");
    expect(eventNote(property, ebmud)).toBe("Shattuck Student Living, by account number.");
  });
});
