import { v, ConvexError } from "convex/values";
import { mutation } from "../_generated/server";
import { appendEvents } from "../../src/audit/append";
import { decide } from "../../src/engine/decide";
import { humanRefusal, type HumanKind } from "../../src/engine/human";
import type { AuditEvent, BillRecord, BillView, InvestigationBrief, MatchResult } from "../../src/types/bill";
import { billById, briefFor, eventsFor, loadLedger, readBill, saveBill, saveBrief, saveEvents } from "../lib/records";

export const humanResume = mutation({
  args: {
    billId: v.string(),
    kind: v.union(v.literal("assign"), v.literal("approve"), v.literal("reject"), v.literal("send-draft")),
    propertyId: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<BillView> => {
    const row = await billById(ctx, args.billId);
    if (!row) throw new ConvexError("Unknown bill.");
    const bill = readBill(row.record);
    const brief = await briefFor(ctx, bill.id);
    const refusal = humanRefusal(bill, args.kind as HumanKind, brief);
    if (refusal) throw new ConvexError(refusal);
    const ts = new Date().toISOString();
    const previous = await eventsFor(ctx, bill.id);
    const drafts: Array<Omit<AuditEvent, "id" | "seq" | "prev_hash" | "hash">> = [];

    if (args.kind === "assign") {
      if (!args.propertyId) throw new ConvexError("Choose a property.");
      const ledger = await loadLedger(ctx);
      const property = ledger.properties.find((item) => item.id === args.propertyId);
      if (!property) throw new ConvexError("Unknown property.");
      ledger.bills = ledger.bills.filter((item) => item.id !== bill.id);
      const match: MatchResult = { ...bill.match, property_id: property.id, method: "HUMAN_ASSIGNED", confidence: 1 };
      const decision = decide({ bill_id: bill.id, extracted: bill.extracted, match, crs: bill.crs, ledger });
      drafts.push({
        bill_id: bill.id,
        ts,
        actor: "HUMAN_OPERATOR",
        action: "HUMAN_ASSIGN_PROPERTY",
        decision: "PASS",
        rationale: args.note ?? `Assigned ${property.name}.`,
        data: { property_id: property.id },
      });
      if (bill.match.address_key) {
        await ctx.db.insert("aliases", {
          addressKey: bill.match.address_key,
          rawAddress: bill.extracted.service_address.value ?? bill.match.address_key,
          propertyId: property.id,
          createdAt: ts,
          createdBy: "HUMAN_OPERATOR",
          sourceBillId: bill.id,
        });
        drafts.push({
          bill_id: bill.id,
          ts,
          actor: "HUMAN_OPERATOR",
          action: "ALIAS_STORED",
          decision: "INFO",
          rationale: bill.match.address_key,
          data: { property_id: property.id },
        });
      }
      for (const check of decision.checks) {
        drafts.push({
          bill_id: bill.id,
          ts,
          actor: "DETERMINISTIC_RULE",
          action: "CHECK",
          decision: check.outcome === "SKIP" ? "INFO" : check.outcome,
          rationale: check.rationale,
          data: { check_id: check.id },
        });
      }
      drafts.push({
        bill_id: bill.id,
        ts,
        actor: "DETERMINISTIC_RULE",
        action: "DECISION",
        decision: decision.status === "CLEARED" ? "PASS" : decision.status === "BLOCKED" ? "BLOCK" : "HALT",
        rationale: decision.why,
        data: {},
      });
      const next: BillRecord = {
        ...bill,
        match,
        decision,
        status: decision.status,
        resolved_by: "HUMAN",
        property_name: property.name,
      };
      await saveBill(ctx, next);
      await saveEvents(ctx, await appendEvents(previous.at(-1) ?? null, drafts));
      return { ...next, audit: await eventsFor(ctx, bill.id), investigation: brief };
    }

    if (args.kind === "approve") {
      const next: BillRecord = { ...bill, status: "CLEARED", resolved_by: "HUMAN" };
      drafts.push({
        bill_id: bill.id,
        ts,
        actor: "HUMAN_OPERATOR",
        action: "HUMAN_APPROVE",
        decision: "EXECUTE",
        rationale: `${bill.decision.required_approver}${args.note ? `: ${args.note}` : ""}`,
        data: { approver: bill.decision.required_approver },
      });
      await saveBill(ctx, next);
      await saveEvents(ctx, await appendEvents(previous.at(-1) ?? null, drafts));
      return { ...next, audit: await eventsFor(ctx, bill.id), investigation: brief };
    }

    if (args.kind === "reject") {
      const next: BillRecord = { ...bill, status: "REJECTED", resolved_by: "HUMAN" };
      drafts.push({
        bill_id: bill.id,
        ts,
        actor: "HUMAN_OPERATOR",
        action: "HUMAN_REJECT",
        decision: "HALT",
        rationale: args.note ?? "Rejected.",
        data: {},
      });
      await saveBill(ctx, next);
      await saveEvents(ctx, await appendEvents(previous.at(-1) ?? null, drafts));
      return { ...next, audit: await eventsFor(ctx, bill.id), investigation: brief };
    }

    if (!brief) throw new ConvexError("There is no draft to send.");
    const sent: InvestigationBrief = { ...brief, draft_sent: true };
    await saveBrief(ctx, sent);
    drafts.push({
      bill_id: bill.id,
      ts,
      actor: "HUMAN_OPERATOR",
      action: "DRAFT_SENT",
      decision: "INFO",
      rationale: "Draft marked sent. Nothing left the app.",
      data: {},
    });
    await saveEvents(ctx, await appendEvents(previous.at(-1) ?? null, drafts));
    return { ...bill, audit: await eventsFor(ctx, bill.id), investigation: sent };
  },
});
