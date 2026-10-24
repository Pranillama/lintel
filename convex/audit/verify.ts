import { query } from "../_generated/server";
import { verifyChain } from "../../src/audit/chain";
import { eventsFor, readBill } from "../lib/records";

export const verifyAudit = query({
  args: {},
  handler: async (ctx) => {
    const bills = await ctx.db.query("bills").take(200);
    for (const row of bills) {
      const bill = readBill(row.record);
      const intact = await verifyChain(await eventsFor(ctx, bill.id));
      if (!intact) return { ok: false as const, bill_id: bill.id };
    }
    return { ok: true as const, bill_id: null };
  },
});
