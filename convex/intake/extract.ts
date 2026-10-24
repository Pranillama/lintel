import { v } from "convex/values";
import { internalAction, internalMutation } from "../_generated/server";
import { appendEvents } from "../../src/audit/append";
import { extractDocument } from "../../src/agents/intake/extractDocument";
import type { AuditEvent, ExtractedBill, UploadedDocument } from "../../src/types/bill";
import { billById, eventsFor, readBill, saveBill, saveEvents } from "../lib/records";

export const extractBill = internalAction({
  args: { document: v.string() },
  handler: async (_ctx, args) => {
    const document = JSON.parse(args.document) as UploadedDocument;
    return await extractDocument(document);
  },
});

export const commitExtraction = internalMutation({
  args: { billId: v.string(), extracted: v.string() },
  handler: async (ctx, args) => {
    const row = await billById(ctx, args.billId);
    if (!row) throw new Error(`Unknown bill ${args.billId}`);
    const bill = readBill(row.record);
    const extracted = JSON.parse(args.extracted) as ExtractedBill;
    const previous = await eventsFor(ctx, bill.id);
    const draft: Omit<AuditEvent, "id" | "seq" | "prev_hash" | "hash"> = {
      bill_id: bill.id,
      ts: bill.created_at,
      actor: extracted.source === "DOCUMENT" ? "AI_EXTRACTION" : "DETERMINISTIC_RULE",
      action: "EXTRACT_FIELDS",
      decision: extracted.extraction_error ? "HALT" : "PASS",
      rationale: extracted.extraction_error ?? "Fields stored.",
      data: {},
    };
    await saveEvents(ctx, await appendEvents(previous.at(-1) ?? null, [draft]));
    const next = { ...bill, extracted, source: extracted.source };
    await saveBill(ctx, next);
    return next;
  },
});
