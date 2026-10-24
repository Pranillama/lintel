import { ACCOUNTS, HISTORY, PROPERTIES, VENDORS } from "@/seed/portfolio";
import type {
  BillFormInput,
  CrsResult,
  ExtractedBill,
  FieldWithConfidence,
  LedgerSnapshot,
  MatchResult,
} from "@/types/bill";

export function seedLedger(extra?: Partial<LedgerSnapshot>): LedgerSnapshot {
  return {
    properties: PROPERTIES,
    vendors: VENDORS,
    accounts: ACCOUNTS,
    history: HISTORY,
    bills: [],
    aliases: [],
    ...extra,
  };
}

export function extractedFrom(form: BillFormInput, source: ExtractedBill["source"] = "FEED"): ExtractedBill {
  const present = <T>(value: T | undefined): FieldWithConfidence<T> => ({
    value: value === undefined ? null : value,
    confidence: value === undefined ? 0 : 1,
    source_snippet: null,
  });
  return {
    source,
    vendor_name: present(form.vendor_name),
    invoice_number: present(form.invoice_number),
    account_number: present(form.account_number),
    service_address: present(form.service_address),
    due_date: present(form.due_date),
    billing_period_start: present(form.billing_period_start),
    billing_period_end: present(form.billing_period_end),
    total_amount: present(form.total_amount),
    usage_qty: present(form.usage_qty),
    usage_unit: present(form.usage_unit),
    line_items: form.line_items ?? [],
    extraction_error: null,
    extraction_model: null,
  };
}

export function match(partial: Partial<MatchResult>): MatchResult {
  return {
    vendor_id: null,
    vendor_match: "NONE",
    property_id: null,
    method: "UNRESOLVED",
    confidence: 0,
    candidates: [],
    vendor_account_conflict: false,
    address_key: null,
    ...partial,
  };
}

export const NOT_RUN: CrsResult = {
  outcome: "NOT_RUN",
  request_id: null,
  identity_ref: null,
  signals: [],
  detail: "CRS off.",
};
