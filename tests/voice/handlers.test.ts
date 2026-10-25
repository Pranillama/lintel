import { describe, expect, it } from "vitest";
import {
  billIdFromPath,
  explainResult,
  findResult,
  listOpenResult,
  parseFindQuery,
  unauthorizedResult,
  voiceAuthorized,
  VOICE_LIST_CAP,
} from "@/voice/handlers";
import { goldenBills, stubBill } from "./samples";

function body(result: { body: string }): Record<string, unknown> {
  return JSON.parse(result.body) as Record<string, unknown>;
}

describe("voice tool auth", () => {
  it("accepts only the exact bearer secret", () => {
    expect(voiceAuthorized("Bearer desk-secret", "desk-secret")).toBe(true);
    expect(voiceAuthorized(null, "desk-secret")).toBe(false);
    expect(voiceAuthorized("Bearer desk-secret", undefined)).toBe(false);
    expect(voiceAuthorized("Bearer desk-secret", "")).toBe(false);
    expect(voiceAuthorized("Bearer other", "desk-secret")).toBe(false);
    expect(voiceAuthorized("bearer desk-secret", "desk-secret")).toBe(false);
    expect(voiceAuthorized("Bearer desk-secret ", "desk-secret")).toBe(false);
  });

  it("returns 401 without facts", () => {
    const result = unauthorizedResult();
    expect(result.status).toBe(401);
    expect(body(result)).toEqual({ error: "unauthorized" });
  });
});

describe("voice tool responses", () => {
  const { cleared, held, blocked, missing } = goldenBills();
  const desk = [cleared, blocked, held];

  it("lists held bills before blocked ones and drops cleared", () => {
    const result = listOpenResult(desk);
    expect(result.status).toBe(200);
    const payload = body(result);
    const bills = payload.bills as Array<{ bill_id: string; amount: string; status: string }>;
    expect(bills.map((row) => row.bill_id)).toEqual(["BILL-103", "BILL-102"]);
    expect(bills[0]).toMatchObject({ amount: "$5,680.00", status: "HELD" });
    expect(bills[1]).toMatchObject({ amount: "$680.00", status: "BLOCKED" });
    expect(payload.shown).toBe(2);
    expect(payload.open_count).toBe(2);
    expect(payload.totals).toEqual({
      held: "$5,680.00",
      blocked: "$680.00",
      held_count: 1,
      blocked_count: 1,
    });
    expect(JSON.stringify(payload)).not.toContain("prev_hash");
    expect(Object.keys(bills[0]).sort()).toEqual(
      ["amount", "bill_id", "property", "reason", "required_approver", "status", "vendor"].sort(),
    );
  });

  it("caps the open list at five and keeps held bills first", () => {
    const heldBills = [1, 2, 3, 4, 5, 6].map((n) =>
      stubBill({ id: `HELD-${n}`, status: "HELD", vendor: "EBMUD", amount: 100 * n, why: `Held ${n}.` }),
    );
    const blockedBill = stubBill({ id: "BLOCK-1", status: "BLOCKED", vendor: "Recology", amount: 50, why: "Blocked." });
    const result = listOpenResult([...heldBills, blockedBill, cleared]);
    const payload = body(result);
    const bills = payload.bills as Array<{ bill_id: string; status: string }>;
    expect(bills).toHaveLength(VOICE_LIST_CAP);
    expect(bills.every((row) => row.status === "HELD")).toBe(true);
    expect(payload.open_count).toBe(7);
    expect(payload.shown).toBe(5);
    expect(String(payload.note)).toContain("Showing 5 of 7");
    expect(result.body.length).toBeLessThan(16 * 1024);
  });

  it("finds by vendor, property, or bill id and ignores a short fragment", () => {
    const ebmud = findResult(desk, { q: "ebmud", vendor: null, property: null, bill_id: null });
    expect(body(ebmud).matched).toBe(1);
    expect((body(ebmud).bills as Array<{ bill_id: string }>)[0].bill_id).toBe("BILL-103");

    const shattuck = findResult(desk, { q: null, vendor: null, property: "Shattuck", bill_id: null });
    expect((body(shattuck).bills as Array<{ bill_id: string }>).map((row) => row.bill_id)).toEqual(["BILL-102", "BILL-103"]);

    const byId = findResult(desk, { q: null, vendor: null, property: null, bill_id: "bill-101" });
    expect((body(byId).bills as Array<{ status: string }>)[0].status).toBe("CLEARED");

    const fragment = findResult(desk, { q: "103", vendor: null, property: null, bill_id: null });
    expect(body(fragment).matched).toBe(0);

    const clash = findResult(desk, { q: null, vendor: "EBMUD", property: "Bayview", bill_id: null });
    expect(body(clash).matched).toBe(0);

    const empty = findResult(desk, { q: null, vendor: null, property: null, bill_id: null });
    expect(empty.status).toBe(200);
    expect(body(empty).note).toBe("Tell me a vendor, a property, or a bill id.");
  });

  it("explains one bill and 404s when it is missing", () => {
    const result = explainResult(missing);
    expect(result.status).toBe(200);
    const facts = body(result);
    expect(Object.keys(facts).sort()).toEqual(
      ["amount", "bill_id", "next_step", "property", "reasons", "required_approver", "status", "vendor"].sort(),
    );
    expect(facts.bill_id).toBe("BILL-101-MISSING");
    expect(facts.amount).toBe("$2,290.40");
    expect(facts.status).toBe("HELD");
    expect(explainResult(null)).toMatchObject({ status: 404 });
    expect(body(explainResult(null))).toEqual({ error: "not_found" });
  });

  it("parses find query text and reads a bill id from the path", () => {
    const params = new URLSearchParams("q=EBMUD&vendor=&property=Shattuck");
    const parsed = parseFindQuery(params);
    expect(parsed).toEqual({
      ok: true,
      query: { q: "EBMUD", vendor: null, property: "Shattuck", bill_id: null },
    });
    const tooLong = new URLSearchParams();
    tooLong.set("q", "x".repeat(81));
    expect(parseFindQuery(tooLong)).toEqual({ ok: false, error: "bad_query" });
    expect(billIdFromPath("/voice/bill/BILL-103")).toBe("BILL-103");
    expect(billIdFromPath("/voice/bill/")).toBeNull();
    expect(billIdFromPath("/voice/bill/BILL-103/extra")).toBeNull();
    expect(billIdFromPath("/voice/open")).toBeNull();
  });
});
