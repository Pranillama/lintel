import { describe, expect, it } from "vitest";
import { buildBillFacts } from "@/voice/facts";
import { goldenBills } from "./samples";

describe("buildBillFacts", () => {
  const { cleared, held, blocked, missing } = goldenBills();

  it("speaks a cleared PG&E bill with a formatted amount", () => {
    const facts = buildBillFacts(cleared);
    expect(facts).toMatchObject({
      bill_id: "BILL-101",
      vendor: "PG&E",
      property: "Bayview Commons",
      amount: "$2,290.40",
      status: "CLEARED",
      required_approver: null,
    });
    expect(facts.reasons[0]).toBe(cleared.decision.why);
    expect(facts.reasons[0]).toContain("$2,290.40");
    expect(facts.next_step).toContain("No one needs to approve");
    expect(facts.reasons.length).toBeLessThanOrEqual(3);
  });

  it("speaks the held EBMUD spike in the engine's words", () => {
    const facts = buildBillFacts(held);
    expect(facts).toMatchObject({
      bill_id: "BILL-103",
      vendor: "EBMUD",
      property: "Shattuck Student Living",
      amount: "$5,680.00",
      status: "HELD",
      required_approver: "VP Finance",
    });
    expect(facts.reasons[0]).toBe(held.decision.why);
    expect(facts.reasons[0]).toContain("+281.0%");
    expect(facts.reasons[0]).toContain("$1,490.00");
    expect(facts.reasons[0]).toContain("VP Finance");
    expect(facts.next_step).toBe("Held for VP Finance. A person has to approve or reject it.");
  });

  it("speaks a blocked duplicate with no approver", () => {
    const facts = buildBillFacts(blocked);
    expect(facts).toMatchObject({
      bill_id: "BILL-102",
      vendor: "Recology",
      property: "Shattuck Student Living",
      amount: "$680.00",
      status: "BLOCKED",
      required_approver: null,
    });
    expect(facts.reasons[0]).toBe(blocked.decision.why);
    expect(facts.reasons[0]).toContain("RW-99201");
    expect(facts.reasons[0]).toContain("Blocked");
    expect(facts.next_step).toContain("will not be paid");
  });

  it("speaks a missing invoice without inventing the field", () => {
    const facts = buildBillFacts(missing);
    expect(facts.status).toBe("HELD");
    expect(facts.vendor).toBe("PG&E");
    expect(facts.property).toBe("Bayview Commons");
    expect(facts.amount).toBe("$2,290.40");
    expect(facts.required_approver).toBe("Operator");
    expect(facts.reasons[0]).toBe(missing.decision.why);
    expect(facts.reasons[0]).toContain("Missing invoice number");
    expect(facts.reasons[0]).not.toContain("undefined");
  });

  it("returns the same object for the same bill", () => {
    expect(buildBillFacts(held)).toEqual(buildBillFacts(held));
  });
});
