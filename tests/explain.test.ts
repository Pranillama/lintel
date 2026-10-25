import { describe, expect, it } from "vitest";
import { decide } from "@/engine/decide";
import { matchBill } from "@/match/matchBill";
import { JUDGE_CHIPS, OPENING_BATCH } from "@/seed/demo-inputs";
import type { BillFormInput, ExtractedBill } from "@/types/bill";
import { extractedFrom, NOT_RUN, seedLedger } from "./helpers/ledger";

const ledger = seedLedger();

function why(extracted: ExtractedBill): string {
  return decide({ bill_id: "BILL-T", extracted, match: matchBill(extracted, ledger), crs: NOT_RUN, ledger }).why;
}

function form(key: string): BillFormInput {
  const row = [...OPENING_BATCH, ...JUDGE_CHIPS].find((input) => input.key === key);
  if (!row) throw new Error(`missing ${key}`);
  return row.form;
}

describe("why-sentences for held intake problems", () => {
  it("keeps the Lombard #B unit sentence", () => {
    expect(why(extractedFrom(form("BILL-104")))).toBe(
      '"1880 Lombard #B" matches Telegraph Hill Lofts on street, but unit #B is not on the property. Confidence capped at 0.80 (needs 0.90). Held for a person to assign.',
    );
  });

  it("names an unknown vendor and an address that matches no property", () => {
    const text = why(
      extractedFrom({
        vendor_name: "Copper Ridge Waste Services",
        invoice_number: "BILL-1001",
        account_number: "2000456702",
        service_address: "125 Industrial Way, Springfield, IL 62701",
        due_date: "2026-10-16",
        total_amount: 518.7,
      }),
    );
    expect(text).toBe(
      '"Copper Ridge Waste Services" is not a known vendor. "125 Industrial Way, Springfield, IL 62701" does not match any property. Held for an operator.',
    );
  });

  it("lists low-confidence fields in words and says it will not decide on a partial read", () => {
    const extracted = extractedFrom(form("CHIP-CLEAN-PGE"));
    extracted.invoice_number.confidence = 0.6;
    extracted.due_date.confidence = 0.7;
    expect(why(extracted)).toBe("Read below 0.85 confidence: invoice number, due date. Not decided on a partial read. Held for an operator.");
  });

  it("lists missing fields in words", () => {
    const extracted = extractedFrom(form("CHIP-CLEAN-PGE"));
    extracted.due_date = { value: null, confidence: 0, source_snippet: null };
    expect(why(extracted)).toBe("Missing due date. Not decided on a partial read. Held for an operator.");
  });

  it("never prints a raw reason code", () => {
    const extracted = extractedFrom({ ...form("CHIP-CLEAN-PGE"), vendor_name: "Nobody Co", account_number: undefined });
    extracted.total_amount.confidence = 0.5;
    expect(why(extracted)).not.toMatch(/[A-Z]+_[A-Z]+/);
  });
});
