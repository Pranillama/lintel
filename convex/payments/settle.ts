import { v } from "convex/values";
import { internalAction, internalMutation } from "../_generated/server";
import { appendEvents } from "../../src/audit/append";
import { settleX402 } from "../../src/integrations/x402/settle";
import type { AuditEvent, PaymentInstruction, PaymentRail } from "../../src/types/bill";
import { billById, eventsFor, readBill, saveBill, saveEvents, savePayment } from "../lib/records";

export const settle = internalAction({
  args: { billId: v.string() },
  handler: async (_ctx, args) => {
    return await settleX402(args.billId);
  },
});

export const commitPayment = internalMutation({
  args: { billId: v.string(), rail: v.string(), mode: v.union(v.literal("SIMULATED"), v.literal("LIVE_TESTNET")), reference: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const row = await billById(ctx, args.billId);
    if (!row) throw new Error(`Unknown bill ${args.billId}`);
    const bill = readBill(row.record);
    const rail = args.rail as PaymentRail;
    const payment: PaymentInstruction = {
      rail,
      mode: args.mode,
      status: "SCHEDULED",
      reference: args.reference,
      idempotency_key: bill.id,
    };
    const previous = await eventsFor(ctx, bill.id);
    const draft: Omit<AuditEvent, "id" | "seq" | "prev_hash" | "hash"> = {
      bill_id: bill.id,
      ts: new Date().toISOString(),
      actor: "PAYMENT_ROUTER",
      action: "ROUTE_PAYMENT",
      decision: "EXECUTE",
      rationale: `${rail} ${args.mode}`,
      data: {},
    };
    await saveEvents(ctx, await appendEvents(previous.at(-1) ?? null, [draft]));
    await savePayment(ctx, bill.id, payment);
    const next = { ...bill, payment };
    await saveBill(ctx, next);
    return next;
  },
});
