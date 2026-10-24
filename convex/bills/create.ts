import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { appendEvents } from "../../src/audit/append";
import type { Actor, AuditEvent, BillRecord, ExtractedBill, IntakeSource } from "../../src/types/bill";
import { saveBill, saveEvents } from "../lib/records";

export const createBill = internalMutation({
  args: {
    billId: v.string(),
    createdAt: v.string(),
    source: v.string(),
    sourceLabel: v.union(v.string(), v.null()),
    storageId: v.union(v.string(), v.null()),
    extracted: v.string(),
  },
  handler: async (ctx, args) => {
    const source = args.source as IntakeSource;
    const extracted = JSON.parse(args.extracted) as ExtractedBill;
    const bill: BillRecord = {
      id: args.billId,
      created_at: args.createdAt,
      source,
      source_label: args.sourceLabel,
      extracted,
      match: {
        vendor_id: null,
        vendor_match: "NONE",
        property_id: null,
        method: "UNRESOLVED",
        confidence: 0,
        candidates: [],
        vendor_account_conflict: false,
        address_key: null,
      },
      crs: { outcome: "NOT_RUN", request_id: null, identity_ref: null, signals: [], detail: "Not run." },
      decision: {
        status: "HELD",
        reasons: [],
        required_approver: "OPERATOR",
        checks: [],
        duplicate_of: null,
        why: "",
        rail: null,
      },
      status: "HELD",
      resolved_by: "AUTO",
      payment: null,
      vendor_name: extracted.vendor_name.value,
      property_name: null,
      amount: extracted.total_amount.value,
    };
    const actor: Actor = source === "DOCUMENT" ? "AI_EXTRACTION" : source === "FEED" ? "SYSTEM_FEED" : "HUMAN_INPUT";
    const draft: Omit<AuditEvent, "id" | "seq" | "prev_hash" | "hash"> = {
      bill_id: bill.id,
      ts: bill.created_at,
      actor,
      action: "INTAKE",
      decision: "INFO",
      rationale: args.sourceLabel ?? source,
      data: { storage_id: args.storageId },
    };
    await saveBill(ctx, bill);
    await saveEvents(ctx, await appendEvents(null, [draft]));
    return bill.id;
  },
});
