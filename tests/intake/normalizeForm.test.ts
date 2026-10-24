import { describe, expect, it } from "vitest";
import { normalizeForm } from "@/intake/normalizeForm";
import type { BillFormInput } from "@/types/bill";

const filled: BillFormInput = {
  vendor_name: "  PG&E ",
  invoice_number: " PGE-0882-2611 ",
  account_number: " 4491-882-01 ",
  service_address: " 2450 Market St, San Francisco, CA 94114 ",
  due_date: " 2026-11-04 ",
  billing_period_start: " 2026-09-16 ",
  billing_period_end: " 2026-10-15 ",
  total_amount: 2290.4,
  usage_qty: 8120.5,
  usage_unit: "KWH",
  line_items: [
    { description: " Electric delivery ", amount: 0.1 + 0.2 },
    { description: "Generation", amount: 1340.15 },
  ],
};

describe("normalizeForm", () => {
  it("trims provided strings, rounds money, and marks form fields certain", () => {
    const bill = normalizeForm(filled, "FORM");

    expect(bill.source).toBe("FORM");
    expect(bill.extraction_error).toBeNull();
    expect(bill.extraction_model).toBeNull();

    expect(bill.vendor_name).toEqual({ value: "PG&E", confidence: 1, source_snippet: null });
    expect(bill.invoice_number).toEqual({
      value: "PGE-0882-2611",
      confidence: 1,
      source_snippet: null,
    });
    expect(bill.account_number.value).toBe("4491-882-01");
    expect(bill.service_address.value).toBe("2450 Market St, San Francisco, CA 94114");
    expect(bill.due_date.value).toBe("2026-11-04");
    expect(bill.billing_period_start.value).toBe("2026-09-16");
    expect(bill.billing_period_end.value).toBe("2026-10-15");
    expect(bill.total_amount).toEqual({ value: 2290.4, confidence: 1, source_snippet: null });
    expect(bill.usage_qty).toEqual({ value: 8120.5, confidence: 1, source_snippet: null });
    expect(bill.usage_unit).toEqual({ value: "KWH", confidence: 1, source_snippet: null });
    expect(bill.line_items).toEqual([
      { description: "Electric delivery", amount: 0.3 },
      { description: "Generation", amount: 1340.15 },
    ]);
  });

  it("keeps the FEED source the caller passed", () => {
    expect(normalizeForm(filled, "FEED").source).toBe("FEED");
  });

  it("turns blank and omitted fields into null at confidence 0", () => {
    const bill = normalizeForm(
      {
        vendor_name: "   ",
        invoice_number: "",
        account_number: " ",
        service_address: "",
        due_date: "\t",
        billing_period_start: " ",
        total_amount: 0,
        line_items: [],
      },
      "FORM",
    );

    for (const field of [
      bill.vendor_name,
      bill.invoice_number,
      bill.account_number,
      bill.service_address,
      bill.due_date,
      bill.billing_period_start,
      bill.billing_period_end,
      bill.usage_qty,
      bill.usage_unit,
    ]) {
      expect(field).toEqual({ value: null, confidence: 0, source_snippet: null });
    }
    expect(bill.total_amount).toEqual({ value: 0, confidence: 1, source_snippet: null });
    expect(bill.line_items).toEqual([]);
    expect(bill.extraction_error).toBeNull();
    expect(bill.extraction_model).toBeNull();
  });

  it("rounds a zero usage quantity without dropping it", () => {
    const bill = normalizeForm(
      {
        vendor_name: "SFPUC",
        invoice_number: "SFW-1",
        due_date: "2026-11-01",
        total_amount: 10.126,
        usage_qty: 0,
        usage_unit: "CCF",
      },
      "FORM",
    );

    expect(bill.total_amount.value).toBe(10.13);
    expect(bill.usage_qty).toEqual({ value: 0, confidence: 1, source_snippet: null });
    expect(bill.usage_unit.value).toBe("CCF");
    expect(bill.line_items).toEqual([]);
  });
});
