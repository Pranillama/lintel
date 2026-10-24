import { describe, expect, it } from "vitest";
import { decide } from "@/engine/decide";
import { computeTotals } from "@/engine/totals";
import { ALIAS_TWIN, JUDGE_CHIPS, LINE_SUM_FIXTURE, OPENING_BATCH } from "@/seed/demo-inputs";
import type { BillRecord, CrsResult, MatchResult } from "@/types/bill";
import { extractedFrom, match, NOT_RUN, seedLedger } from "./helpers/ledger";

const ledger = seedLedger();
const byKey = Object.fromEntries([...OPENING_BATCH, ALIAS_TWIN, ...JUDGE_CHIPS, LINE_SUM_FIXTURE].map((row) => [row.key, row]));

function run(key: string, matched: MatchResult, crs: CrsResult = NOT_RUN, billId = key) {
  const row = byKey[key];
  return decide({
    bill_id: billId,
    extracted: extractedFrom(row.form),
    match: matched,
    crs,
    ledger,
  });
}

describe("golden decisions, master-spec §6", () => {
  it("BILL-101 clears PG&E under its baseline", () => {
    const decision = run("BILL-101", match({
      vendor_id: "V-PGE",
      vendor_match: "EXACT_NAME",
      property_id: "PROP-001",
      method: "EXACT_ACCOUNT",
      confidence: 1,
    }));
    expect(decision.status).toBe("CLEARED");
    expect(decision.reasons).toEqual([]);
    expect(decision.rail).toBe("UTILITY_PORTAL");
    expect(decision.required_approver).toBe("NONE");
    expect(decision.why).toContain("−2.1%");
    expect(decision.why).toContain("$2,340.00");
    expect(decision.why).toContain("Bayview Commons");
  });

  it("BILL-102 blocks the already paid Recology invoice", () => {
    const decision = run("BILL-102", match({
      vendor_id: "V-RECOLOGY",
      vendor_match: "EXACT_NAME",
      property_id: "PROP-003",
      method: "EXACT_ACCOUNT",
      confidence: 1,
    }));
    expect(decision.status).toBe("BLOCKED");
    expect(decision.reasons).toEqual(["EXACT_DUPLICATE", "FUZZY_DUPLICATE"]);
    expect(decision.duplicate_of).toBe("HIST-027");
    expect(decision.why).toContain("RW-99201");
    expect(decision.why).toContain("2026-10-17");
    expect(decision.why).toContain("14 days");
  });

  it("BILL-103 holds the EBMUD spike for VP Finance", () => {
    const decision = run("BILL-103", match({
      vendor_id: "V-EBMUD",
      vendor_match: "EXACT_NAME",
      property_id: "PROP-003",
      method: "EXACT_ACCOUNT",
      confidence: 1,
    }));
    expect(decision.status).toBe("HELD");
    expect(decision.reasons).toEqual(["USAGE_SPIKE", "AMOUNT_SPIKE"]);
    expect(decision.required_approver).toBe("VP_FINANCE");
    expect(decision.rail).toBeNull();
    expect(decision.why).toContain("+281.0%");
    expect(decision.why).toContain("+281.2%");
    expect(decision.why).toContain("$1,490.00");
    expect(decision.why).toContain("$35.50/CCF");
  });

  it("BILL-104 holds the unmatched unit", () => {
    const decision = run("BILL-104", match({
      vendor_id: "V-BAYLINE",
      vendor_match: "ALIAS",
      property_id: "PROP-002",
      method: "ADDRESS",
      confidence: 0.8,
    }));
    expect(decision.status).toBe("HELD");
    expect(decision.reasons).toEqual(["NEEDS_PROPERTY_MATCH"]);
    expect(decision.required_approver).toBe("OPERATOR");
    expect(decision.why).toContain("0.80");
    expect(decision.why).toContain("Telegraph Hill Lofts");
  });

  it("assigning BILL-104 clears it under the auto-pay limit", () => {
    const decision = run("BILL-104", match({
      vendor_id: "V-BAYLINE",
      vendor_match: "ALIAS",
      property_id: "PROP-002",
      method: "HUMAN_ASSIGNED",
      confidence: 1,
    }));
    expect(decision.status).toBe("CLEARED");
    expect(decision.reasons).toEqual([]);
    expect(decision.rail).toBe("ACH");
    expect(decision.why).toContain("$420.00");
    expect(decision.why).toContain("$1,000.00");
  });

  it("BILL-104B clears by the stored alias", () => {
    const decision = run("BILL-104B", match({
      vendor_id: "V-BAYLINE",
      vendor_match: "ALIAS",
      property_id: "PROP-002",
      method: "HUMAN_ALIAS",
      confidence: 1,
    }));
    expect(decision.status).toBe("CLEARED");
    expect(decision.rail).toBe("ACH");
    expect(decision.why).toContain("$390.00");
  });

  it("CHIP-FUZZY-DUP blocks a new invoice near RW-99201", () => {
    const decision = run("CHIP-FUZZY-DUP", match({
      vendor_id: "V-RECOLOGY",
      vendor_match: "EXACT_NAME",
      property_id: "PROP-003",
      method: "EXACT_ACCOUNT",
      confidence: 1,
    }));
    expect(decision.status).toBe("BLOCKED");
    expect(decision.reasons).toEqual(["FUZZY_DUPLICATE"]);
    expect(decision.checks.find((c) => c.id === "EXACT_DUPLICATE")?.outcome).toBe("PASS");
    expect(decision.duplicate_of).toBe("HIST-027");
    expect(decision.why).toContain("RW-10021");
    expect(decision.why).toContain("$686.00");
    expect(decision.why).toContain("$680.00");
    expect(decision.why).toContain("5 days");
  });

  it("CHIP-CLEAN-PGE clears", () => {
    const decision = run("CHIP-CLEAN-PGE", match({
      vendor_id: "V-PGE",
      vendor_match: "EXACT_NAME",
      property_id: "PROP-002",
      method: "EXACT_ACCOUNT",
      confidence: 1,
    }));
    expect(decision.status).toBe("CLEARED");
    expect(decision.why).toContain("−0.9%");
    expect(decision.why).toContain("$1,610.00");
  });

  it("CHIP-NEW-CONTRACTOR is held while CRS is off, blocked when flagged, held on the limit when CRS passes", () => {
    const matched = match({
      vendor_id: "V-APEX",
      vendor_match: "EXACT_NAME",
      property_id: "PROP-005",
      method: "ADDRESS",
      confidence: 1,
    });
    const off = run("CHIP-NEW-CONTRACTOR", matched);
    expect(off.status).toBe("HELD");
    expect(off.reasons).toEqual(["VENDOR_UNVERIFIED", "OVER_AUTO_PAY_LIMIT"]);
    expect(off.required_approver).toBe("PROPERTY_MANAGER");

    const flagged: CrsResult = { ...NOT_RUN, outcome: "FLAGGED", detail: "flagged" };
    const blocked = run("CHIP-NEW-CONTRACTOR", matched, flagged);
    expect(blocked.status).toBe("BLOCKED");
    expect(blocked.reasons).toContain("CRS_FLAGGED");
    expect(blocked.required_approver).toBe("NONE");

    const passed: CrsResult = { ...NOT_RUN, outcome: "PASS", detail: "pass" };
    const over = run("CHIP-NEW-CONTRACTOR", matched, passed);
    expect(over.status).toBe("HELD");
    expect(over.reasons).toEqual(["OVER_AUTO_PAY_LIMIT"]);
    expect(over.required_approver).toBe("PROPERTY_MANAGER");
  });

  it("CHIP-CONTRACTOR-CLEAN clears and ignores last month's $890", () => {
    const decision = run("CHIP-CONTRACTOR-CLEAN", match({
      vendor_id: "V-PACGREEN",
      vendor_match: "EXACT_NAME",
      property_id: "PROP-004",
      method: "ADDRESS",
      confidence: 1,
    }));
    expect(decision.status).toBe("CLEARED");
    expect(decision.rail).toBe("ACH");
    expect(decision.checks.find((c) => c.id === "FUZZY_DUPLICATE")?.outcome).toBe("PASS");
    expect(decision.why).toContain("$890.00");
    expect(decision.why).toContain("$2,500.00");
  });

  it("BILL-LINESUM blocks on the line sum and still records the spike", () => {
    const decision = run("BILL-LINESUM", match({
      vendor_id: "V-SFPUC",
      vendor_match: "EXACT_NAME",
      property_id: "PROP-002",
      method: "EXACT_ACCOUNT",
      confidence: 1,
    }));
    expect(decision.status).toBe("BLOCKED");
    expect(decision.reasons).toEqual(["LINE_SUM_MISMATCH", "AMOUNT_SPIKE"]);
    expect(decision.required_approver).toBe("NONE");
    expect(decision.why).toContain("$850.00");
    expect(decision.why).toContain("$1,850.00");
    const spike = decision.checks.find((c) => c.id === "SPIKE");
    expect(String(spike?.rationale)).toContain("+120.2%");
  });

  it("opening batch totals are blocked 680, held 6100, cleared 2290.40", () => {
    const matches: Record<string, MatchResult> = {
      "BILL-101": match({ vendor_id: "V-PGE", vendor_match: "EXACT_NAME", property_id: "PROP-001", method: "EXACT_ACCOUNT", confidence: 1 }),
      "BILL-102": match({ vendor_id: "V-RECOLOGY", vendor_match: "EXACT_NAME", property_id: "PROP-003", method: "EXACT_ACCOUNT", confidence: 1 }),
      "BILL-103": match({ vendor_id: "V-EBMUD", vendor_match: "EXACT_NAME", property_id: "PROP-003", method: "EXACT_ACCOUNT", confidence: 1 }),
      "BILL-104": match({ vendor_id: "V-BAYLINE", vendor_match: "ALIAS", property_id: "PROP-002", method: "ADDRESS", confidence: 0.8 }),
    };
    const bills = OPENING_BATCH.map((row) => {
      const decision = run(row.key, matches[row.key]);
      return { status: decision.status, amount: row.form.total_amount } as BillRecord;
    });
    expect(computeTotals(bills)).toMatchObject({ blocked: 680, held: 6100, cleared: 2290.4 });
  });
});
