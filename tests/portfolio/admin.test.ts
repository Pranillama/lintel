import { describe, expect, it } from "vitest";
import { newAccount, newProperty, newVendor, type NewPropertyInput } from "@/portfolio/admin";
import { ACCOUNTS, PROPERTIES, VENDORS } from "@/seed/portfolio";

const property: NewPropertyInput = {
  name: "Mission Bay Flats",
  street: "500 Channel St",
  city: "San Francisco",
  state: "ca",
  zip: "94158",
  units: [" 101", "102", "101", ""],
  contractor_auto_pay_limit: 1250.5,
};

describe("newProperty", () => {
  it("starts at PROP-001 on an empty database and cleans the input", () => {
    expect(newProperty(property, [])).toEqual({ ...property, id: "PROP-001", state: "CA", units: ["101", "102"] });
  });

  it("numbers after the highest existing id", () => {
    expect(newProperty(property, PROPERTIES).id).toBe("PROP-006");
  });

  it("rejects duplicates and bad values", () => {
    expect(() => newProperty({ ...property, name: " bayview commons " }, PROPERTIES)).toThrow("already exists");
    expect(() => newProperty({ ...property, street: "2450 market st", zip: "94114" }, PROPERTIES)).toThrow("already a property");
    expect(() => newProperty({ ...property, street: "  " }, [])).toThrow("Street is required.");
    expect(() => newProperty({ ...property, zip: "9415" }, [])).toThrow("ZIP must be 5 digits.");
    expect(() => newProperty({ ...property, contractor_auto_pay_limit: -1 }, [])).toThrow("zero or more");
    expect(() => newProperty({ ...property, contractor_auto_pay_limit: 10.001 }, [])).toThrow("2 decimals");
    expect(newProperty({ ...property, contractor_auto_pay_limit: 0.29 }, []).contractor_auto_pay_limit).toBe(0.29);
  });
});

describe("newVendor", () => {
  it("derives id, rail, and drops a utility type from contractors", () => {
    expect(newVendor({ name: "Bay Water Co", aliases: ["BWC", "bay water"], kind: "ENROLLED_UTILITY", utility_type: "WATER" }, [])).toEqual({
      id: "V-BAYWATER",
      name: "Bay Water Co",
      aliases: ["BWC"],
      kind: "ENROLLED_UTILITY",
      utility_type: "WATER",
      default_rail: "UTILITY_PORTAL",
      crs_identity_ref: null,
    });
    const contractor = newVendor({ name: "Sparks Electric", aliases: [], kind: "UNVERIFIED_CONTRACTOR", utility_type: "ELECTRIC" }, []);
    expect(contractor).toMatchObject({ utility_type: null, default_rail: "ACH" });
  });

  it("refuses a name or alias the matcher already resolves", () => {
    expect(() => newVendor({ name: "Pacific Gas & Electric", aliases: [], kind: "ENROLLED_UTILITY", utility_type: "ELECTRIC" }, VENDORS)).toThrow("already matches PG&E");
    expect(() => newVendor({ name: "New Co", aliases: ["East Bay MUD"], kind: "KNOWN_CONTRACTOR", utility_type: null }, VENDORS)).toThrow("already matches EBMUD");
  });

  it("requires a utility type for utilities", () => {
    expect(() => newVendor({ name: "Gas Co", aliases: [], kind: "ENROLLED_UTILITY", utility_type: null }, [])).toThrow("Choose what this utility supplies.");
  });

  it("numbers a colliding id", () => {
    const first = newVendor({ name: "Acme", aliases: [], kind: "KNOWN_CONTRACTOR", utility_type: null }, []);
    const renamed = { ...first, name: "Other", aliases: [] };
    expect(newVendor({ name: "Acme Inc", aliases: [], kind: "KNOWN_CONTRACTOR", utility_type: null }, [renamed]).id).toBe("V-ACME-2");
  });
});

describe("newAccount", () => {
  const ledger = { properties: PROPERTIES, vendors: VENDORS, accounts: ACCOUNTS };

  it("takes the utility type from the vendor", () => {
    expect(newAccount({ vendor_id: "V-SFPUC", property_id: "PROP-005", account_number: "SFW-410-0099", usage_unit: "CCF" }, ledger)).toEqual({
      vendor_id: "V-SFPUC",
      property_id: "PROP-005",
      account_number: "SFW-410-0099",
      utility_type: "WATER",
      usage_unit: "CCF",
    });
  });

  it("refuses contractors, unknown ids, and an account number already saved", () => {
    expect(() => newAccount({ vendor_id: "V-BAYLINE", property_id: "PROP-001", account_number: "X1", usage_unit: null }, ledger)).toThrow("Only utilities have accounts.");
    expect(() => newAccount({ vendor_id: "V-NOPE", property_id: "PROP-001", account_number: "X1", usage_unit: null }, ledger)).toThrow("Choose a vendor.");
    expect(() => newAccount({ vendor_id: "V-PGE", property_id: "PROP-999", account_number: "X1", usage_unit: null }, ledger)).toThrow("Choose a property.");
    expect(() => newAccount({ vendor_id: "V-PGE", property_id: "PROP-005", account_number: "4491 882 01", usage_unit: "KWH" }, ledger)).toThrow("already saved");
  });
});
