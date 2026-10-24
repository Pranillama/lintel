import type {
  BillFormInput,
  ExtractedBill,
  FieldWithConfidence,
  LineItem,
  NormalizeFormFn,
  UsageUnit,
} from "@/types/bill";
import { roundUsd } from "@/shared/normalize";

function textField(raw: string | undefined): FieldWithConfidence<string> {
  const value = (raw ?? "").trim();
  if (!value) return { value: null, confidence: 0, source_snippet: null };
  return { value, confidence: 1, source_snippet: null };
}

function amountField(raw: number): FieldWithConfidence<number> {
  return { value: roundUsd(raw), confidence: 1, source_snippet: null };
}

function numberField(raw: number | undefined): FieldWithConfidence<number> {
  if (raw === undefined) return { value: null, confidence: 0, source_snippet: null };
  return { value: raw, confidence: 1, source_snippet: null };
}

function unitField(raw: UsageUnit | undefined): FieldWithConfidence<UsageUnit> {
  if (raw === undefined) return { value: null, confidence: 0, source_snippet: null };
  return { value: raw, confidence: 1, source_snippet: null };
}

function lineItems(items: LineItem[] | undefined): LineItem[] {
  if (!items) return [];
  return items.map((item) => ({
    description: item.description.trim(),
    amount: roundUsd(item.amount),
  }));
}

/** pranil-spec §1. Form and feed never call a model. */
export const normalizeForm: NormalizeFormFn = (form: BillFormInput, source): ExtractedBill => ({
  source,
  vendor_name: textField(form.vendor_name),
  invoice_number: textField(form.invoice_number),
  account_number: textField(form.account_number),
  service_address: textField(form.service_address),
  due_date: textField(form.due_date),
  billing_period_start: textField(form.billing_period_start),
  billing_period_end: textField(form.billing_period_end),
  total_amount: amountField(form.total_amount),
  usage_qty: numberField(form.usage_qty),
  usage_unit: unitField(form.usage_unit),
  line_items: lineItems(form.line_items),
  extraction_error: null,
  extraction_model: null,
});
