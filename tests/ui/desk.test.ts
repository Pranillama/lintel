import { describe, expect, it } from "vitest";
import { errorMessage, inTab, REASON_LABEL, type BlotterTab } from "@/components/desk/contract";
import type { BillView, ReasonCode } from "@/types/bill";

const bill = (status: BillView["status"], source: BillView["source"] = "FEED") => ({ status, source }) as BillView;

describe("blotter tabs", () => {
  it("groups by the engine's status and by intake source", () => {
    const bills = [bill("HELD"), bill("BLOCKED"), bill("CLEARED"), bill("REJECTED"), bill("HELD", "FORM"), bill("BLOCKED", "DOCUMENT")];
    const count = (tab: BlotterTab) => bills.filter((b) => inTab(b, tab)).length;
    expect(count("all")).toBe(6);
    expect(count("held")).toBe(2);
    expect(count("blocked")).toBe(2);
    expect(count("cleared")).toBe(1);
    expect(count("live")).toBe(2);
  });
});

describe("inline error text", () => {
  it("prefers the ConvexError payload", () => {
    expect(errorMessage({ data: "Choose a property.", message: "[CONVEX M(bills/resume:humanResume)] Uncaught ConvexError: Choose a property." })).toBe("Choose a property.");
  });
  it("strips Convex prefixes from plain errors", () => {
    expect(errorMessage(new Error("[CONVEX A(pipeline/process:processBill)] Uncaught Error: Bill was not stored."))).toBe("Bill was not stored.");
  });
  it("falls back to a readable sentence", () => {
    expect(errorMessage(undefined)).toBe("Something went wrong. Try again.");
  });
});

describe("reason labels", () => {
  it("names every reason code the engine can emit", () => {
    const codes: ReasonCode[] = ["EXACT_DUPLICATE", "FUZZY_DUPLICATE", "LINE_SUM_MISMATCH", "CRS_FLAGGED", "MISSING_FIELD", "LOW_CONFIDENCE", "EXTRACTION_FAILED", "NEEDS_PROPERTY_MATCH", "UNKNOWN_VENDOR", "VENDOR_ACCOUNT_CONFLICT", "USAGE_SPIKE", "AMOUNT_SPIKE", "NO_BASELINE", "VENDOR_UNVERIFIED", "CRS_UNAVAILABLE", "OVER_AUTO_PAY_LIMIT", "UTILITY_NOT_ACCOUNT_MATCHED"];
    for (const code of codes) expect(REASON_LABEL[code]).toBeTruthy();
  });
});
