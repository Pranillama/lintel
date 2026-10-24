import { v } from "convex/values";
import { internalAction, internalMutation } from "../_generated/server";
import { appendEvents } from "../../src/audit/append";
import { verifyVendor } from "../../src/integrations/crs/verifyVendor";
import type { AuditEvent, CrsResult, ExtractedBill, Vendor } from "../../src/types/bill";
import { billById, eventsFor, readBill, saveBill, saveEvents } from "../lib/records";

export const verify = internalAction({
  args: { vendor: v.string(), extracted: v.string() },
  handler: async (_ctx, args) => {
    const vendor = JSON.parse(args.vendor) as Vendor;
    const extracted = JSON.parse(args.extracted) as ExtractedBill;
    return await verifyVendor(vendor, extracted);
  },
});

export const commitCrs = internalMutation({
  args: { billId: v.string(), crs: v.string() },
  handler: async (ctx, args) => {
    const row = await billById(ctx, args.billId);
    if (!row) throw new Error(`Unknown bill ${args.billId}`);
    const bill = readBill(row.record);
    const crs = JSON.parse(args.crs) as CrsResult;
    const previous = await eventsFor(ctx, bill.id);
    const draft: Omit<AuditEvent, "id" | "seq" | "prev_hash" | "hash"> = {
      bill_id: bill.id,
      ts: bill.created_at,
      actor: "CRS_SANDBOX",
      action: "VERIFY_VENDOR",
      decision: crs.outcome === "PASS" ? "PASS" : crs.outcome === "FLAGGED" ? "BLOCK" : "HALT",
      rationale: crs.detail,
      data: {},
    };
    await saveEvents(ctx, await appendEvents(previous.at(-1) ?? null, [draft]));
    const next = { ...bill, crs };
    await saveBill(ctx, next);
    return next;
  },
});
