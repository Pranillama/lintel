import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { appendEvents } from "../../src/audit/append";
import { investigate } from "../../src/agents/investigator/investigate";
import { nextInvestigationStart } from "../../src/agents/investigator/spacing";
import { POLICY_TEXT } from "../../src/seed/policy";
import type { AuditEvent, InvestigationBrief, InvestigationContext } from "../../src/types/bill";
import { billById, eventsFor, loadLedger, readBill, saveBrief, saveEvents } from "../lib/records";
import { internal } from "../_generated/api";

/** Stores a PENDING brief and returns how long to wait before running it (CREAO spacing; 0 without CREAO). */
export const markPending = internalMutation({
  args: { billId: v.string(), ts: v.string() },
  handler: async (ctx, args): Promise<number> => {
    const now = Date.now();
    let start = now;
    if (process.env.CREAO_API_KEY?.trim() && process.env.CREAO_AGENT_ID?.trim()) {
      // One transaction, so two bills landing together still get different slots.
      const recent = await ctx.db.query("investigations").order("desc").take(10);
      const planned = recent.map((row) => Date.parse((JSON.parse(row.record) as InvestigationBrief).started_at));
      start = nextInvestigationStart(now, planned.filter((t) => !Number.isNaN(t)));
    }
    const brief: InvestigationBrief = {
      bill_id: args.billId,
      status: "PENDING",
      provider: null,
      summary: "",
      findings: [],
      draft: null,
      creao_run_id: null,
      creao_share_url: null,
      error: null,
      started_at: start === now ? args.ts : new Date(start).toISOString(),
      completed_at: null,
      draft_sent: false,
    };
    await saveBrief(ctx, brief);
    return start - now;
  },
});

export const run = internalAction({
  args: { billId: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.pipeline.investigate.begin, { billId: args.billId });
    const context = await ctx.runQuery(internal.pipeline.investigate.context, { billId: args.billId });
    if (!context) return;
    let brief: InvestigationBrief;
    try {
      brief = await investigate(context);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Investigation failed.";
      brief = {
        bill_id: args.billId,
        status: "FAILED",
        provider: null,
        summary: "",
        findings: [],
        draft: null,
        creao_run_id: null,
        creao_share_url: null,
        error: message,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        draft_sent: false,
      };
    }
    await ctx.runMutation(internal.pipeline.investigate.finish, { brief: JSON.stringify(brief) });
  },
});

export const begin = internalMutation({
  args: { billId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("investigations").withIndex("by_billId", (q) => q.eq("billId", args.billId)).unique();
    if (!row) return;
    const brief = JSON.parse(row.record) as InvestigationBrief;
    brief.status = "RUNNING";
    await ctx.db.patch(row._id, { status: "RUNNING", record: JSON.stringify(brief) });
    const previous = await eventsFor(ctx, args.billId);
    const draft: Omit<AuditEvent, "id" | "seq" | "prev_hash" | "hash"> = {
      bill_id: args.billId,
      ts: new Date().toISOString(),
      actor: "AI_INVESTIGATOR",
      action: "INVESTIGATION_STARTED",
      decision: "INFO",
      rationale: "Investigation started.",
      data: {},
    };
    await saveEvents(ctx, await appendEvents(previous.at(-1) ?? null, [draft]));
  },
});

export const context = internalQuery({
  args: { billId: v.string() },
  handler: async (ctx, args): Promise<InvestigationContext | null> => {
    const row = await billById(ctx, args.billId);
    if (!row) return null;
    const bill = readBill(row.record);
    const ledger = await loadLedger(ctx);
    const property = ledger.properties.find((item) => item.id === bill.match.property_id) ?? null;
    const vendor = ledger.vendors.find((item) => item.id === bill.match.vendor_id) ?? null;
    const history = ledger.history
      .filter((item) => item.property_id === bill.match.property_id && item.vendor_id === bill.match.vendor_id)
      .sort((a, b) => (a.due_date < b.due_date ? 1 : -1))
      .slice(0, 6);
    const related = ledger.bills
      .filter((item) => item.id !== bill.id && (item.match.vendor_id === bill.match.vendor_id || item.match.property_id === bill.match.property_id))
      .slice(0, 6)
      .map((item) => ({
        id: item.id,
        status: item.status,
        amount: item.amount,
        vendor_name: item.vendor_name,
        property_name: item.property_name,
        created_at: item.created_at,
      }));
    return { bill, property, vendor, history, related_bills: related, policy_text: POLICY_TEXT };
  },
});

export const finish = internalMutation({
  args: { brief: v.string() },
  handler: async (ctx, args) => {
    const brief = JSON.parse(args.brief) as InvestigationBrief;
    const row = await billById(ctx, brief.bill_id);
    if (!row) return;
    const before = readBill(row.record).status;
    await saveBrief(ctx, brief);
    const previous = await eventsFor(ctx, brief.bill_id);
    const draft: Omit<AuditEvent, "id" | "seq" | "prev_hash" | "hash"> = {
      bill_id: brief.bill_id,
      ts: brief.completed_at ?? new Date().toISOString(),
      actor: "AI_INVESTIGATOR",
      action: brief.status === "FAILED" ? "INVESTIGATION_FAILED" : "INVESTIGATION_COMPLETED",
      decision: brief.status === "FAILED" ? "HALT" : "INFO",
      rationale: brief.status === "FAILED" ? brief.error ?? "Investigation failed." : brief.summary,
      data: { provider: brief.provider, creao_run_id: brief.creao_run_id },
    };
    await saveEvents(ctx, await appendEvents(previous.at(-1) ?? null, [draft]));
    const afterRow = await billById(ctx, brief.bill_id);
    if (!afterRow || readBill(afterRow.record).status !== before) {
      throw new Error("Investigation changed the bill status.");
    }
  },
});
