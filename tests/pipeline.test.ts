import { describe, expect, it } from "vitest";
import { humanRefusal } from "@/engine/human";
import { decide } from "@/engine/decide";
import type { BillRecord } from "@/types/bill";
import { NOT_RUN } from "./helpers/ledger";

function held(reasons: BillRecord["decision"]["reasons"], status: BillRecord["status"] = "HELD"): Pick<BillRecord, "status" | "decision"> {
  return {
    status,
    decision: {
      status: status === "REJECTED" ? "HELD" : status,
      reasons,
      required_approver: "OPERATOR",
      checks: [],
      duplicate_of: null,
      why: "",
      rail: null,
    },
  };
}

describe("human resume rules", () => {
  it("refuses assign, approve and reject on a blocked bill", () => {
    const bill = held(["EXACT_DUPLICATE"], "BLOCKED");
    expect(humanRefusal(bill, "approve", null)).toMatch(/Blocked/);
    expect(humanRefusal(bill, "assign", null)).toMatch(/Blocked/);
    expect(humanRefusal(bill, "reject", null)).toMatch(/Blocked/);
  });

  it("refuses approval while the property is still untrusted", () => {
    expect(humanRefusal(held(["NEEDS_PROPERTY_MATCH"]), "approve", null)).toMatch(/trusted/);
    expect(humanRefusal(held(["AMOUNT_SPIKE"]), "approve", null)).toBeNull();
  });

  it("sends a draft only while the bill is still an open exception", () => {
    const brief = { status: "DONE" as const, draft: { kind: "VENDOR_EMAIL" as const, to: "Vendor", subject: "s", body: "b", suggested_property_id: null } };
    expect(humanRefusal(held(["EXACT_DUPLICATE"], "BLOCKED"), "send-draft", brief)).toBeNull();
    expect(humanRefusal(held(["USAGE_SPIKE"]), "send-draft", brief)).toBeNull();
    expect(humanRefusal(held([], "CLEARED"), "send-draft", brief)).toMatch(/resolved/);
    expect(humanRefusal(held(["AMOUNT_SPIKE"], "REJECTED"), "send-draft", brief)).toMatch(/resolved/);
    expect(humanRefusal(held(["USAGE_SPIKE"]), "send-draft", { status: "RUNNING", draft: null })).toMatch(/no draft/);
  });

  it("allows assign only for a held property match", () => {
    expect(humanRefusal(held(["NEEDS_PROPERTY_MATCH"]), "assign", null)).toBeNull();
    expect(humanRefusal(held(["AMOUNT_SPIKE"]), "assign", null)).toMatch(/property/);
  });
});

describe("decide stays pure", () => {
  it("does not treat a bill as a duplicate of itself", () => {
    const decision = decide({
      bill_id: "HIST-027",
      extracted: {
        source: "FEED",
        vendor_name: { value: "Recology", confidence: 1, source_snippet: null },
        invoice_number: { value: "RW-99201", confidence: 1, source_snippet: null },
        account_number: { value: "RCL-2110-03", confidence: 1, source_snippet: null },
        service_address: { value: "2110 Shattuck Ave", confidence: 1, source_snippet: null },
        due_date: { value: "2026-11-03", confidence: 1, source_snippet: null },
        billing_period_start: { value: null, confidence: 0, source_snippet: null },
        billing_period_end: { value: null, confidence: 0, source_snippet: null },
        total_amount: { value: 680, confidence: 1, source_snippet: null },
        usage_qty: { value: null, confidence: 0, source_snippet: null },
        usage_unit: { value: null, confidence: 0, source_snippet: null },
        line_items: [],
        extraction_error: null,
        extraction_model: null,
      },
      match: {
        vendor_id: "V-RECOLOGY",
        vendor_match: "EXACT_NAME",
        property_id: "PROP-003",
        method: "EXACT_ACCOUNT",
        confidence: 1,
        candidates: [],
        vendor_account_conflict: false,
        address_key: null,
      },
      crs: NOT_RUN,
      ledger: {
        properties: [],
        vendors: [],
        accounts: [],
        history: [],
        bills: [],
        aliases: [],
      },
    });
    expect(decision.reasons).not.toContain("EXACT_DUPLICATE");
  });
});
