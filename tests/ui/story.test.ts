import { describe, expect, it } from "vitest";
import { appendEvents } from "@/audit/append";
import { decisionAuditDrafts } from "@/audit/drafts";
import { decide } from "@/engine/decide";
import { matchBill } from "@/match/matchBill";
import { OPENING_BATCH } from "@/seed/demo-inputs";
import { PROPERTIES, VENDORS } from "@/seed/portfolio";
import { demoScript } from "@/components/story/demo";
import { liveScript, type LiveInput } from "@/components/story/liveScript";
import type { BillView } from "@/types/bill";
import { extractedFrom, NOT_RUN, seedLedger } from "../helpers/ledger";

/** Opening-batch bills through the real engine, with the audit rows processBill would write. */
async function bills(): Promise<BillView[]> {
  const ledger = seedLedger();
  return Promise.all(OPENING_BATCH.map(async (r, i) => {
    const extracted = extractedFrom(r.form);
    const match = matchBill(extracted, ledger);
    const decision = decide({ bill_id: r.key, extracted, match, crs: NOT_RUN, ledger });
    const ts = `2026-10-24T16:14:0${i}.000Z`;
    const audit = await appendEvents(null, decisionAuditDrafts({ bill_id: r.key, ts, source: "FORM", source_label: null, extracted, match, crs: NOT_RUN, decision }));
    return {
      id: r.key, created_at: ts, source: "FORM", source_label: null, extracted, match, crs: NOT_RUN, decision,
      status: decision.status, resolved_by: "AUTO", payment: null,
      vendor_name: VENDORS.find((v) => v.id === match.vendor_id)?.name ?? null,
      property_name: PROPERTIES.find((p) => p.id === match.property_id)?.name ?? null,
      amount: extracted.total_amount.value, audit, investigation: null,
    } satisfies BillView;
  }));
}

const byVendor = async (name: string) => (await bills()).find((b) => b.vendor_name === name) as BillView;
const input = (bill: BillView | null, more: Partial<LiveInput> = {}): LiveInput => ({ source: "FORM", startedAt: Date.parse("2026-10-24T16:14:00Z"), bill, done: true, stopWaiting: false, ...more });
const upTo = (bill: BillView, action: string): BillView => ({ ...bill, audit: bill.audit.slice(0, bill.audit.findIndex((e) => e.action === action) + 1) });

describe("live receipt story", () => {
  it("prints nothing about the bill until it is stored", () => {
    const s = liveScript(input(null, { source: "DOCUMENT", done: false }));
    expect(s.lines.map((l) => l.cls)).toEqual(["logo", "plain", "mut"]);
    expect(s.waiting).toEqual({ lcd: "CLAUDE IS READING…", item: "read" });
    expect(s.complete).toBe(false);
    expect(s.stamp).toBeNull();
  });

  it("prints only the rows that have arrived, and earlier lines never change", async () => {
    const ebmud = await byVendor("EBMUD");
    const partial = liveScript(input(upTo(ebmud, "RESOLVE_PROPERTY"), { done: false }));
    const full = liveScript(input(ebmud));
    expect(partial.lines.some((l) => l.rule)).toBe(false);
    expect(partial.waiting?.lcd).toBe("RUNNING THE RULES…");
    expect(full.lines.slice(0, partial.lines.length)).toEqual(partial.lines);
  });

  it("counts every rule the engine ran and stamps by its status", async () => {
    const ebmud = await byVendor("EBMUD");
    const s = liveScript(input(ebmud));
    expect(s.lines.filter((l) => l.rule)).toHaveLength(ebmud.decision.checks.length);
    expect(s.complete).toBe(true);
    expect(s.stamp).toEqual({ tone: "review", word: "NEEDS REVIEW", sub: "HELD FOR VP FINANCE" });
    expect(s.lines.find((l) => l.item === "usage")?.label).toBe("Usage +281.0% vs usual");
    expect(s.lines.find((l) => l.item === "route")?.label).toBe("Routed to VP Finance");
    for (const l of s.lines) expect(l.text.length).toBeLessThanOrEqual(44);
  });

  it("waits for the pipeline call and the AI follow-up before stamping", async () => {
    const blocked = (await bills()).find((b) => b.status === "BLOCKED") as BillView;
    expect(liveScript(input(blocked, { done: false })).complete).toBe(false);
    const drafting = { ...blocked, investigation: { bill_id: blocked.id, status: "RUNNING", provider: "CLAUDE", summary: "", findings: [], draft: null, creao_run_id: null, creao_share_url: null, error: null, started_at: blocked.created_at, completed_at: null, draft_sent: false } } satisfies BillView;
    const waiting = liveScript(input(drafting));
    expect(waiting.complete).toBe(false);
    expect(waiting.waiting).toEqual({ lcd: "AI IS DRAFTING…", item: "draft" });
    const gaveUp = liveScript(input(drafting, { stopWaiting: true }));
    expect(gaveUp.complete).toBe(true);
    expect(gaveUp.stamp?.word).toBe("BLOCKED");
    expect(gaveUp.lines.find((l) => l.item === "dup")?.mark).toBe("bd");
  });
});

describe("demo receipt story", () => {
  it("has the three sample endings and fits the paper", () => {
    expect(demoScript("review").stamp?.word).toBe("NEEDS REVIEW");
    expect(demoScript("blocked").stamp?.word).toBe("BLOCKED");
    expect(demoScript("paid").stamp?.word).toBe("APPROVED");
    for (const e of ["review", "blocked", "paid"] as const) for (const l of demoScript(e).lines) expect(l.text.length).toBeLessThanOrEqual(44);
  });
});
