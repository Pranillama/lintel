import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { query } from "../_generated/server";
import { verifyChain } from "../../src/audit/chain";
import { computeTotals } from "../../src/engine/totals";
import { POLICY_TEXT, SEATS_LINE } from "../../src/seed/policy";
import type { BillView } from "../../src/types/bill";
import { briefFor, eventsFor, loadLedger, readBill } from "../lib/records";

async function viewOf(ctx: Parameters<typeof eventsFor>[0], record: string): Promise<BillView> {
  const bill = readBill(record);
  const audit = await eventsFor(ctx, bill.id);
  return { ...bill, audit, investigation: await briefFor(ctx, bill.id) };
}

export const listBills = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("bills").withIndex("by_createdAt").order("desc").take(200);
    const bills = await Promise.all(rows.map((row) => viewOf(ctx, row.record)));
    let audit_chain_intact = true;
    for (const bill of bills) {
      if (!(await verifyChain(bill.audit))) audit_chain_intact = false;
    }
    return { bills, totals: computeTotals(bills), audit_chain_intact };
  },
});

export const getBill = query({
  args: { billId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("bills").withIndex("by_billId", (q) => q.eq("billId", args.billId)).unique();
    if (!row) return null;
    return await viewOf(ctx, row.record);
  },
});

/** The original uploaded file for a bill, or null for typed and feed bills. The storage id lives on the INTAKE audit row. */
export const getBillDocument = query({
  args: { billId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("bills").withIndex("by_billId", (q) => q.eq("billId", args.billId)).unique();
    if (!row) return null;
    const intake = (await eventsFor(ctx, args.billId)).find((e) => e.action === "INTAKE");
    const storageId = intake?.data.storage_id;
    if (typeof storageId !== "string") return null;
    const id = storageId as Id<"_storage">;
    const url = await ctx.storage.getUrl(id);
    if (!url) return null;
    const file = await ctx.db.system.get("_storage", id);
    return { url, media_type: file?.contentType ?? null, filename: readBill(row.record).source_label };
  },
});

export const getPortfolio = query({
  args: {},
  handler: async (ctx) => {
    const ledger = await loadLedger(ctx);
    const flag = (name: string) => process.env[name] === "true";
    return {
      properties: ledger.properties,
      vendors: ledger.vendors,
      accounts: ledger.accounts,
      policy_text: POLICY_TEXT,
      seats_line: SEATS_LINE,
      flags: {
        crs_enabled: flag("LINTEL_CRS_ENABLED"),
        creao_enabled: Boolean(process.env.CREAO_API_KEY && process.env.CREAO_AGENT_ID),
        x402_enabled: flag("LINTEL_X402_ENABLED"),
        extraction_enabled: Boolean(process.env.ANTHROPIC_API_KEY),
      },
    };
  },
});
