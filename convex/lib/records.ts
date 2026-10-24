import type { AuditEvent, BillRecord, BillStatus, InvestigationBrief, LedgerSnapshot, PaymentInstruction } from "../../src/types/bill";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

const STATUSES: readonly BillStatus[] = ["CLEARED", "HELD", "BLOCKED", "REJECTED"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readBill(raw: string): BillRecord {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || typeof parsed.id !== "string" || typeof parsed.status !== "string" || !STATUSES.includes(parsed.status as BillStatus)) {
    throw new Error("Stored bill is not a BillRecord");
  }
  return parsed as unknown as BillRecord;
}

export function readAudit(raw: string): AuditEvent {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || typeof parsed.seq !== "number" || typeof parsed.hash !== "string") {
    throw new Error("Stored audit event is invalid");
  }
  return parsed as unknown as AuditEvent;
}

export function readBrief(raw: string): InvestigationBrief {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || typeof parsed.bill_id !== "string" || typeof parsed.status !== "string") {
    throw new Error("Stored investigation is invalid");
  }
  return parsed as unknown as InvestigationBrief;
}

export async function billById(ctx: DbCtx, billId: string) {
  return await ctx.db.query("bills").withIndex("by_billId", (q) => q.eq("billId", billId)).unique();
}

export async function loadLedger(ctx: DbCtx): Promise<LedgerSnapshot> {
  const [properties, vendors, accounts, history, aliases, bills] = await Promise.all([
    ctx.db.query("properties").take(50),
    ctx.db.query("vendors").take(50),
    ctx.db.query("vendorAccounts").take(100),
    ctx.db.query("history").take(200),
    ctx.db.query("aliases").take(200),
    ctx.db.query("bills").take(200),
  ]);
  return {
    properties: properties.map((row) => ({
      id: row.propertyId as LedgerSnapshot["properties"][number]["id"],
      name: row.name,
      street: row.street,
      city: row.city,
      state: row.state,
      zip: row.zip,
      units: row.units,
      contractor_auto_pay_limit: row.contractorAutoPayLimit,
    })),
    vendors: vendors.map((row) => ({
      id: row.vendorId as LedgerSnapshot["vendors"][number]["id"],
      name: row.name,
      aliases: row.aliases,
      kind: row.kind as LedgerSnapshot["vendors"][number]["kind"],
      utility_type: row.utilityType as LedgerSnapshot["vendors"][number]["utility_type"],
      default_rail: row.defaultRail as LedgerSnapshot["vendors"][number]["default_rail"],
      crs_identity_ref: row.crsIdentityRef,
    })),
    accounts: accounts.map((row) => ({
      vendor_id: row.vendorId as LedgerSnapshot["accounts"][number]["vendor_id"],
      property_id: row.propertyId as LedgerSnapshot["accounts"][number]["property_id"],
      account_number: row.accountNumber,
      utility_type: row.utilityType as LedgerSnapshot["accounts"][number]["utility_type"],
      usage_unit: row.usageUnit as LedgerSnapshot["accounts"][number]["usage_unit"],
    })),
    history: history.map((row) => ({
      id: row.historyId,
      vendor_id: row.vendorId as LedgerSnapshot["history"][number]["vendor_id"],
      property_id: row.propertyId as LedgerSnapshot["history"][number]["property_id"],
      invoice_number: row.invoiceNumber,
      amount: row.amount,
      due_date: row.dueDate,
      usage_qty: row.usageQty,
      usage_unit: row.usageUnit as LedgerSnapshot["history"][number]["usage_unit"],
      paid_on: row.paidOn,
    })),
    aliases: aliases.map((row) => ({
      address_key: row.addressKey,
      raw_address: row.rawAddress,
      property_id: row.propertyId as LedgerSnapshot["aliases"][number]["property_id"],
      created_at: row.createdAt,
      created_by: "HUMAN_OPERATOR" as const,
      source_bill_id: row.sourceBillId,
    })),
    bills: bills.map((row) => readBill(row.record)),
  };
}

export async function eventsFor(ctx: DbCtx, billId: string): Promise<AuditEvent[]> {
  const rows = await ctx.db.query("auditEvents").withIndex("by_billId", (q) => q.eq("billId", billId)).take(200);
  return rows.map((row) => readAudit(row.record)).sort((a, b) => a.seq - b.seq);
}

export async function briefFor(ctx: DbCtx, billId: string): Promise<InvestigationBrief | null> {
  const row = await ctx.db.query("investigations").withIndex("by_billId", (q) => q.eq("billId", billId)).unique();
  return row ? readBrief(row.record) : null;
}

export async function saveBill(ctx: MutationCtx, bill: BillRecord) {
  const existing = await billById(ctx, bill.id);
  const patch = {
    billId: bill.id,
    createdAt: bill.created_at,
    status: bill.status,
    amount: bill.amount,
    record: JSON.stringify(bill),
  };
  if (existing) await ctx.db.patch(existing._id, patch);
  else await ctx.db.insert("bills", patch);
}

export async function saveEvents(ctx: MutationCtx, events: AuditEvent[]) {
  for (const event of events) {
    await ctx.db.insert("auditEvents", { billId: event.bill_id, seq: event.seq, record: JSON.stringify(event) });
  }
}

export async function savePayment(ctx: MutationCtx, billId: string, payment: PaymentInstruction) {
  const existing = await ctx.db.query("payments").withIndex("by_billId", (q) => q.eq("billId", billId)).unique();
  const record = JSON.stringify(payment);
  if (existing) await ctx.db.patch(existing._id, { record });
  else await ctx.db.insert("payments", { billId, record });
}

export async function saveBrief(ctx: MutationCtx, brief: InvestigationBrief) {
  const existing = await ctx.db.query("investigations").withIndex("by_billId", (q) => q.eq("billId", brief.bill_id)).unique();
  const patch = { billId: brief.bill_id, status: brief.status, record: JSON.stringify(brief) };
  if (existing) await ctx.db.patch(existing._id, patch);
  else await ctx.db.insert("investigations", patch);
}
