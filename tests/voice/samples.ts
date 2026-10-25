import { decide } from "@/engine/decide";
import { OPENING_BATCH } from "@/seed/demo-inputs";
import { PROPERTIES, VENDORS } from "@/seed/portfolio";
import type { ApproverRole, BillRecord, BillStatus, BillView, ExtractedBill, MatchResult } from "@/types/bill";
import { extractedFrom, match, NOT_RUN, seedLedger } from "../helpers/ledger";

const ledger = seedLedger();
const byKey = Object.fromEntries(OPENING_BATCH.map((row) => [row.key, row]));

function viewOf(key: string, matched: MatchResult, tweak?: (extracted: ExtractedBill) => void, id = key): BillView {
  const row = byKey[key];
  const extracted = extractedFrom(row.form);
  tweak?.(extracted);
  const decision = decide({ bill_id: id, extracted, match: matched, crs: NOT_RUN, ledger });
  const vendor = VENDORS.find((item) => item.id === matched.vendor_id);
  const property = PROPERTIES.find((item) => item.id === matched.property_id);
  return {
    id,
    created_at: "2026-10-25T16:00:00.000Z",
    source: "FEED",
    source_label: "Saturday intake",
    extracted,
    match: matched,
    crs: NOT_RUN,
    decision,
    status: decision.status,
    resolved_by: "AUTO",
    payment: null,
    vendor_name: vendor?.name ?? extracted.vendor_name.value,
    property_name: property?.name ?? null,
    amount: extracted.total_amount.value,
    audit: [],
    investigation: null,
  };
}

const pge = match({
  vendor_id: "V-PGE",
  vendor_match: "EXACT_NAME",
  property_id: "PROP-001",
  method: "EXACT_ACCOUNT",
  confidence: 1,
});

const recology = match({
  vendor_id: "V-RECOLOGY",
  vendor_match: "EXACT_NAME",
  property_id: "PROP-003",
  method: "EXACT_ACCOUNT",
  confidence: 1,
});

const ebmud = match({
  vendor_id: "V-EBMUD",
  vendor_match: "EXACT_NAME",
  property_id: "PROP-003",
  method: "EXACT_ACCOUNT",
  confidence: 1,
});

/** Golden desk bills. Status comes from decide(), not from a stored verdict. */
export function goldenBills(): { cleared: BillView; blocked: BillView; held: BillView; missing: BillView } {
  return {
    cleared: viewOf("BILL-101", pge),
    blocked: viewOf("BILL-102", recology),
    held: viewOf("BILL-103", ebmud),
    missing: viewOf("BILL-101", pge, (extracted) => {
      extracted.invoice_number = { value: null, confidence: 0, source_snippet: null };
    }, "BILL-101-MISSING"),
  };
}

/** A stored bill with a hand-written why, for list and search shaping. */
export function stubBill(input: {
  id: string;
  status: BillStatus;
  vendor?: string | null;
  property?: string | null;
  amount?: number | null;
  why?: string;
  approver?: ApproverRole;
}): BillRecord {
  const amount = input.amount === undefined ? null : input.amount;
  const status = input.status === "REJECTED" ? "HELD" : input.status;
  return {
    id: input.id,
    created_at: "2026-10-25T16:00:00.000Z",
    source: "FORM",
    source_label: null,
    extracted: extractedFrom({
      vendor_name: input.vendor ?? "Vendor",
      invoice_number: "INV-1",
      due_date: "2026-11-01",
      total_amount: amount ?? 1,
    }),
    match: match({}),
    crs: NOT_RUN,
    decision: {
      status,
      reasons: [],
      required_approver: input.approver ?? "NONE",
      checks: [],
      duplicate_of: null,
      why: input.why ?? "Held.",
      rail: null,
    },
    status: input.status,
    resolved_by: "AUTO",
    payment: null,
    vendor_name: input.vendor ?? null,
    property_name: input.property ?? null,
    amount,
  };
}
