import { describe, expect, it } from "vitest";
import { normalizeForm } from "@/intake/normalizeForm";
import { matchBill, matchNames } from "@/match/matchBill";
import { normalizeAddressKey } from "@/shared/normalize";
import {
  ALIAS_TWIN,
  JUDGE_CHIPS,
  LINE_SUM_FIXTURE,
  OPENING_BATCH,
  type DemoInput,
} from "@/seed/demo-inputs";
import { ACCOUNTS, HISTORY, PROPERTIES, VENDORS } from "@/seed/portfolio";
import type {
  AddressAlias,
  BillFormInput,
  LedgerSnapshot,
  MatchMethod,
  Property,
  PropertyId,
  VendorId,
} from "@/types/bill";

const DEMO_INPUTS: DemoInput[] = [
  ...OPENING_BATCH,
  ALIAS_TWIN,
  ...JUDGE_CHIPS,
  LINE_SUM_FIXTURE,
];

/** master-spec §6 property, method, and confidence for every seeded input. */
const EXPECTED: Record<
  string,
  {
    property_id: PropertyId;
    method: MatchMethod;
    confidence: number;
    vendor_id: VendorId;
    vendor_match: "EXACT_NAME" | "ALIAS";
  }
> = {
  "BILL-101": {
    property_id: "PROP-001",
    method: "EXACT_ACCOUNT",
    confidence: 1,
    vendor_id: "V-PGE",
    vendor_match: "EXACT_NAME",
  },
  "BILL-102": {
    property_id: "PROP-003",
    method: "EXACT_ACCOUNT",
    confidence: 1,
    vendor_id: "V-RECOLOGY",
    vendor_match: "EXACT_NAME",
  },
  "BILL-103": {
    property_id: "PROP-003",
    method: "EXACT_ACCOUNT",
    confidence: 1,
    vendor_id: "V-EBMUD",
    vendor_match: "EXACT_NAME",
  },
  "BILL-104": {
    property_id: "PROP-002",
    method: "ADDRESS",
    confidence: 0.8,
    vendor_id: "V-BAYLINE",
    vendor_match: "ALIAS",
  },
  "BILL-104B": {
    property_id: "PROP-002",
    method: "ADDRESS",
    confidence: 0.8,
    vendor_id: "V-BAYLINE",
    vendor_match: "ALIAS",
  },
  "CHIP-FUZZY-DUP": {
    property_id: "PROP-003",
    method: "EXACT_ACCOUNT",
    confidence: 1,
    vendor_id: "V-RECOLOGY",
    vendor_match: "EXACT_NAME",
  },
  "CHIP-CLEAN-PGE": {
    property_id: "PROP-002",
    method: "EXACT_ACCOUNT",
    confidence: 1,
    vendor_id: "V-PGE",
    vendor_match: "EXACT_NAME",
  },
  "CHIP-NEW-CONTRACTOR": {
    property_id: "PROP-005",
    method: "ADDRESS",
    confidence: 1,
    vendor_id: "V-APEX",
    vendor_match: "EXACT_NAME",
  },
  "CHIP-CONTRACTOR-CLEAN": {
    property_id: "PROP-004",
    method: "ADDRESS",
    confidence: 1,
    vendor_id: "V-PACGREEN",
    vendor_match: "EXACT_NAME",
  },
  "BILL-LINESUM": {
    property_id: "PROP-002",
    method: "EXACT_ACCOUNT",
    confidence: 1,
    vendor_id: "V-SFPUC",
    vendor_match: "EXACT_NAME",
  },
};

const LOMBARD_ALIAS: AddressAlias = {
  address_key: "1880 LOMBARD #B",
  raw_address: "1880 Lombard #B",
  property_id: "PROP-002",
  created_at: "2026-10-24T18:00:00.000Z",
  created_by: "HUMAN_OPERATOR",
  source_bill_id: "BILL-104",
};

function seedLedger(aliases: AddressAlias[] = []): LedgerSnapshot {
  return {
    properties: PROPERTIES,
    vendors: VENDORS,
    accounts: ACCOUNTS,
    history: HISTORY,
    bills: [],
    aliases,
  };
}

function fromForm(form: BillFormInput, ledger: LedgerSnapshot = seedLedger()) {
  return matchBill(normalizeForm(form, "FORM"), ledger);
}

describe("matchBill", () => {
  it("lands every demo input on the property, method, and confidence in §6", () => {
    const ledger = seedLedger();
    expect(DEMO_INPUTS.map((input) => input.key).sort()).toEqual(Object.keys(EXPECTED).sort());

    for (const input of DEMO_INPUTS) {
      const expected = EXPECTED[input.key];
      const result = matchBill(normalizeForm(input.form, "FEED"), ledger);
      const address = input.form.service_address ?? "";

      expect(result.property_id, input.key).toBe(expected.property_id);
      expect(result.method, input.key).toBe(expected.method);
      expect(result.confidence, input.key).toBe(expected.confidence);
      expect(result.vendor_id, input.key).toBe(expected.vendor_id);
      expect(result.vendor_match, input.key).toBe(expected.vendor_match);
      expect(result.vendor_account_conflict, input.key).toBe(false);
      expect(result.address_key, input.key).toBe(normalizeAddressKey(address));
      expect(result.candidates[0]?.property_id, input.key).toBe(expected.property_id);
      expect(result.candidates[0]?.score, input.key).toBe(expected.confidence);
      expect(result.candidates.every((row) => row.reason.length > 0), input.key).toBe(true);
    }
  });

  it("caps 1880 Lombard #B at 0.80 because unit B is not on Telegraph Hill", () => {
    const bill = OPENING_BATCH.find((input) => input.key === "BILL-104");
    expect(bill).toBeDefined();
    if (!bill) return;
    const result = fromForm(bill.form);

    expect(result.property_id).toBe("PROP-002");
    expect(result.method).toBe("ADDRESS");
    expect(result.confidence).toBe(0.8);
    expect(result.address_key).toBe("1880 LOMBARD #B");
    expect(result.candidates).toEqual([
      {
        property_id: "PROP-002",
        property_name: "Telegraph Hill Lofts",
        score: 0.8,
        reason: "street 1880 Lombard matches; unit #B not on property (cap 0.80)",
      },
    ]);
  });

  it("keeps the unit cap at 0.80 after a city and zip bonus", () => {
    const result = fromForm({
      vendor_name: "Bayline Plumbing",
      invoice_number: "BPR-6100",
      service_address: "1880 Lombard #B, San Francisco, CA 94123",
      due_date: "2026-11-01",
      total_amount: 420,
    });

    expect(result.property_id).toBe("PROP-002");
    expect(result.method).toBe("ADDRESS");
    expect(result.confidence).toBe(0.8);
    expect(result.candidates[0]?.score).toBe(0.8);
  });

  it("matches Pacific Green to Marina Gate at 1.00 by address", () => {
    const chip = JUDGE_CHIPS.find((input) => input.key === "CHIP-CONTRACTOR-CLEAN");
    expect(chip).toBeDefined();
    if (!chip) return;
    const result = fromForm(chip.form);

    expect(result.property_id).toBe("PROP-004");
    expect(result.method).toBe("ADDRESS");
    expect(result.confidence).toBe(1);
    expect(result.vendor_id).toBe("V-PACGREEN");
  });

  it("uses a stored alias at 1.00 before address scoring", () => {
    const ledger = seedLedger([LOMBARD_ALIAS]);
    const punctuated = fromForm(
      {
        ...ALIAS_TWIN.form,
        service_address: "1880 Lombard St. #b",
      },
      ledger,
    );
    const twin = fromForm(ALIAS_TWIN.form, ledger);

    for (const result of [twin, punctuated]) {
      expect(result.property_id).toBe("PROP-002");
      expect(result.method).toBe("HUMAN_ALIAS");
      expect(result.confidence).toBe(1);
      expect(result.vendor_id).toBe("V-BAYLINE");
      expect(result.address_key).toBe("1880 LOMBARD #B");
    }
    expect(fromForm(ALIAS_TWIN.form).method).toBe("ADDRESS");
  });

  it("lets an exact account beat a stored alias", () => {
    const result = fromForm(
      {
        vendor_name: "PG&E",
        invoice_number: "PGE-0882-2611",
        account_number: "4491-882-01",
        service_address: "1880 Lombard #B",
        due_date: "2026-11-04",
        total_amount: 2290.4,
      },
      seedLedger([LOMBARD_ALIAS]),
    );

    expect(result.method).toBe("EXACT_ACCOUNT");
    expect(result.property_id).toBe("PROP-001");
    expect(result.confidence).toBe(1);
    expect(result.address_key).toBe("1880 LOMBARD #B");
  });

  it("leaves an unknown vendor null even when the address matches", () => {
    const result = fromForm({
      vendor_name: "Totally Unknown HVAC",
      invoice_number: "UNK-1",
      service_address: "410 Townsend St, San Francisco, CA 94107",
      due_date: "2026-11-01",
      total_amount: 500,
    });

    expect(result.vendor_id).toBeNull();
    expect(result.vendor_match).toBe("NONE");
    expect(result.property_id).toBe("PROP-005");
    expect(result.method).toBe("ADDRESS");
    expect(result.confidence).toBe(1);
  });

  it("does not fuzzy-match a vendor name that only shares a prefix", () => {
    const result = fromForm({
      vendor_name: "Bayline Plumbing & Rooter Services",
      invoice_number: "BPR-2",
      service_address: "10 High St, Columbus, OH 43215",
      due_date: "2026-11-01",
      total_amount: 80,
    });

    expect(result.vendor_id).toBeNull();
    expect(result.vendor_match).toBe("NONE");
  });

  it("takes the account vendor when the name matches nobody", () => {
    const result = fromForm({
      vendor_name: "Nobody Plumbing",
      invoice_number: "NP-1",
      account_number: "4491-882-01",
      service_address: "2450 Market St, San Francisco, CA 94114",
      due_date: "2026-11-04",
      total_amount: 100,
    });

    expect(result.vendor_id).toBe("V-PGE");
    expect(result.vendor_match).toBe("ACCOUNT");
    expect(result.vendor_account_conflict).toBe(false);
    expect(result.method).toBe("EXACT_ACCOUNT");
    expect(result.property_id).toBe("PROP-001");
  });

  it("flags a vendor account conflict and still keeps the account property", () => {
    const result = fromForm({
      vendor_name: "EBMUD",
      invoice_number: "EB-X",
      account_number: "4491-882-01",
      service_address: "2450 Market St, San Francisco, CA 94114",
      due_date: "2026-11-04",
      total_amount: 100,
    });

    expect(result.vendor_id).toBe("V-EBMUD");
    expect(result.vendor_match).toBe("EXACT_NAME");
    expect(result.vendor_account_conflict).toBe(true);
    expect(result.property_id).toBe("PROP-001");
    expect(result.method).toBe("EXACT_ACCOUNT");
    expect(result.confidence).toBe(1);
  });

  it("leaves an Ohio address unresolved", () => {
    const result = fromForm({
      vendor_name: "Columbus Power",
      invoice_number: "OH-1",
      service_address: "500 Broad St, Columbus, OH 43215",
      due_date: "2026-11-01",
      total_amount: 100,
    });

    expect(result.method).toBe("UNRESOLVED");
    expect(result.property_id).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.candidates).toEqual([]);
    expect(result.vendor_id).toBeNull();
    expect(result.address_key).toBe(normalizeAddressKey("500 Broad St, Columbus, OH 43215"));
  });

  it("scores street-only matches at 0.60 with no locality bonus", () => {
    const result = fromForm({
      vendor_name: "Bayline Plumbing",
      invoice_number: "BPR-3",
      service_address: "Lombard St, San Francisco, CA 94123",
      due_date: "2026-11-01",
      total_amount: 200,
    });

    expect(result.method).toBe("ADDRESS");
    expect(result.property_id).toBe("PROP-002");
    expect(result.confidence).toBe(0.6);
    expect(result.candidates[0]?.reason).toBe("street Lombard matches; number missing");
  });

  it("does not cap a unit when the property has no unit list", () => {
    const result = fromForm({
      vendor_name: "Recology",
      invoice_number: "RW-1",
      service_address: "2110 Shattuck Ave Apt 4, Berkeley, CA 94704",
      due_date: "2026-11-01",
      total_amount: 680,
    });

    expect(result.property_id).toBe("PROP-003");
    expect(result.method).toBe("ADDRESS");
    expect(result.confidence).toBe(1);
  });

  it("drops confidence to 0.85 when the top two address scores are within 0.10", () => {
    const properties: Property[] = [
      {
        id: "PROP-A",
        name: "Alpha House",
        street: "10 High St",
        city: "Columbus",
        state: "OH",
        zip: "43215",
        units: [],
        contractor_auto_pay_limit: 1000,
      },
      {
        id: "PROP-B",
        name: "Beta House",
        street: "10 High Street",
        city: "Dayton",
        state: "OH",
        zip: "45402",
        units: [],
        contractor_auto_pay_limit: 1000,
      },
    ];
    const result = fromForm(
      {
        vendor_name: "Columbus Power",
        invoice_number: "OH-2",
        service_address: "10 High St, Columbus, OH 43215",
        due_date: "2026-11-01",
        total_amount: 100,
      },
      { ...seedLedger(), properties },
    );

    expect(result.method).toBe("ADDRESS");
    expect(result.property_id).toBe("PROP-A");
    expect(result.confidence).toBe(0.85);
    expect(result.candidates.map((row) => [row.property_id, row.score])).toEqual([
      ["PROP-A", 1],
      ["PROP-B", 0.95],
    ]);
  });

  it("keeps a clear address winner when the next score is more than 0.10 behind", () => {
    const properties: Property[] = [
      {
        id: "PROP-A",
        name: "Alpha House",
        street: "10 High St",
        city: "Columbus",
        state: "OH",
        zip: "43215",
        units: [],
        contractor_auto_pay_limit: 1000,
      },
      {
        id: "PROP-B",
        name: "Beta House",
        street: "10 High St",
        city: "Columbus",
        state: "OH",
        zip: "43215",
        units: ["1"],
        contractor_auto_pay_limit: 1000,
      },
    ];
    const result = fromForm(
      {
        vendor_name: "Columbus Power",
        invoice_number: "OH-3",
        service_address: "10 High St #B, Columbus, OH 43215",
        due_date: "2026-11-01",
        total_amount: 100,
      },
      { ...seedLedger(), properties },
    );

    expect(result.property_id).toBe("PROP-A");
    expect(result.method).toBe("ADDRESS");
    expect(result.confidence).toBe(1);
    expect(result.candidates.map((row) => [row.property_id, row.score])).toEqual([
      ["PROP-A", 1],
      ["PROP-B", 0.8],
    ]);
  });
});

describe("matchNames", () => {
  function namesFor(key: string, ledger: LedgerSnapshot = seedLedger()) {
    const input = OPENING_BATCH.find((row) => row.key === key);
    if (!input) throw new Error(`missing ${key}`);
    const extracted = normalizeForm(input.form, "FEED");
    return matchNames(extracted, matchBill(extracted, ledger), ledger);
  }

  it("names the property once the match is trusted", () => {
    expect(namesFor("BILL-101").property_name).toBe("Bayview Commons");
    expect(namesFor("BILL-103").property_name).toBe("Shattuck Student Living");
  });

  it("leaves the property unnamed below the trust floor", () => {
    expect(namesFor("BILL-104").property_name).toBeNull();
    expect(namesFor("BILL-104", seedLedger([LOMBARD_ALIAS])).property_name).toBe("Telegraph Hill Lofts");
  });

  it("falls back to the extracted vendor name for an unknown vendor", () => {
    const extracted = normalizeForm({ ...OPENING_BATCH[0].form, vendor_name: "Nobody Co", account_number: "" }, "FORM");
    const ledger = seedLedger();
    expect(matchNames(extracted, matchBill(extracted, ledger), ledger).vendor_name).toBe("Nobody Co");
  });
});
