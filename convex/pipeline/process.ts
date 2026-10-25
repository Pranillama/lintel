import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { normalizeForm } from "../../src/intake/normalizeForm";
import type { BillView, CrsResult, ExtractedBill, ProcessBillInput, UploadedDocument } from "../../src/types/bill";

function newBillId(now: Date): string {
  const yy = String(now.getUTCFullYear()).slice(2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hex = crypto.randomUUID().replace(/-/g, "").slice(0, 4);
  return `BILL-${yy}${mm}${dd}-${hex}`;
}

export const processBill = action({
  args: { input: v.string() },
  handler: async (ctx, args): Promise<BillView> => {
    const input = JSON.parse(args.input) as ProcessBillInput;
    const now = new Date();
    const billId = newBillId(now);
    const createdAt = now.toISOString();
    let storageId: string | null = null;
    let extracted: ExtractedBill;
    let sourceLabel: string | null = null;
    if (input.kind === "DOCUMENT") {
      const bytes = Uint8Array.from(atob(input.document.data_base64), (c) => c.charCodeAt(0));
      storageId = await ctx.storage.store(new Blob([bytes], { type: input.document.media_type }));
      sourceLabel = input.document.filename;
      extracted = await ctx.runAction(internal.intake.extract.extractBill, { document: JSON.stringify(input.document satisfies UploadedDocument) });
    } else {
      sourceLabel = input.kind === "FEED" ? input.feed_label : null;
      try {
        extracted = normalizeForm(input.form, input.kind);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Intake failed.";
        throw new ConvexError(message);
      }
    }
    await ctx.runMutation(internal.bills.create.createBill, {
      billId,
      createdAt,
      source: input.kind,
      sourceLabel,
      storageId,
      extracted: JSON.stringify(extracted),
    });
    await ctx.runMutation(internal.intake.extract.commitExtraction, { billId, extracted: JSON.stringify(extracted) });
    const matched = await ctx.runMutation(internal.match.commit.commitMatch, { billId });
    let crs: CrsResult = { outcome: "NOT_RUN", request_id: null, identity_ref: null, signals: [], detail: "CRS off." };
    const vendor = matched.match.vendor_id
      ? (await ctx.runQuery(api.bills.queries.getPortfolio, {})).vendors.find((item: { id: string; kind: string }) => item.id === matched.match.vendor_id)
      : undefined;
    if (vendor?.kind === "UNVERIFIED_CONTRACTOR" && process.env.LINTEL_CRS_ENABLED === "true") {
      crs = await ctx.runAction(internal.crs.vendor.verify, {
        vendor: JSON.stringify(vendor),
        extracted: JSON.stringify(extracted),
      });
      await ctx.runMutation(internal.crs.vendor.commitCrs, { billId, crs: JSON.stringify(crs) });
    }
    const decided = await ctx.runMutation(internal.engine.policy.commitPolicy, { billId, crs: JSON.stringify(crs) });
    if (decided.status === "CLEARED" && decided.decision.rail && process.env.LINTEL_X402_ENABLED === "true" && vendor?.kind !== "ENROLLED_UTILITY") {
      const settled: unknown = await ctx.runAction(internal.payments.settle.settle, { billId });
      if (settled && typeof settled === "object" && "reference" in settled && typeof settled.reference === "string") {
        await ctx.runMutation(internal.payments.settle.commitPayment, { billId, rail: decided.decision.rail, reference: settled.reference });
      }
    }
    if (decided.status === "HELD" || decided.status === "BLOCKED") {
      const wait: number = await ctx.runMutation(internal.pipeline.investigate.markPending, { billId, ts: createdAt });
      await ctx.scheduler.runAfter(wait, internal.pipeline.investigate.run, { billId });
    }
    const view = await ctx.runQuery(api.bills.queries.getBill, { billId });
    if (!view) throw new ConvexError("Bill was not stored.");
    return view;
  },
});
