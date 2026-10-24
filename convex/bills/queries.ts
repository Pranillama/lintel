import { v } from "convex/values";
import { query } from "../_generated/server";
import { verifyChain } from "../../src/audit/chain";
import { computeTotals } from "../../src/engine/totals";
import { POLICY_TEXT, REAL_VS_SIMULATED, SEATS_LINE } from "../../src/seed/policy";
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

export const getPortfolio = query({
  args: {},
  handler: async (ctx) => {
    const ledger = await loadLedger(ctx);
    const flag = (name: string) => process.env[name] === "true";
    return {
      properties: ledger.properties,
      vendors: ledger.vendors,
      policy_text: POLICY_TEXT,
      seats_line: SEATS_LINE,
      real_vs_simulated: REAL_VS_SIMULATED,
      flags: {
        crs_enabled: flag("LINTEL_CRS_ENABLED"),
        creao_enabled: Boolean(process.env.CREAO_API_KEY && process.env.CREAO_AGENT_ID),
        x402_enabled: flag("LINTEL_X402_ENABLED"),
        extraction_enabled: Boolean(process.env.ANTHROPIC_API_KEY),
      },
    };
  },
});
