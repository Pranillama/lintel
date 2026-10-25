/**
 * Admin writes to the portfolio: properties, vendors, and utility accounts.
 * Pure and deterministic. Each function validates one input against what is
 * already saved and returns the row to insert, or throws an Error whose
 * message is safe to show inline.
 */
import type { Property, PropertyId, UsageUnit, UtilityType, Vendor, VendorAccount, VendorId, VendorKind } from "@/types/bill";
import { normalizeAccount, normalizeVendorName } from "@/shared/normalize";

export interface NewPropertyInput {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  units: string[];
  contractor_auto_pay_limit: number;
}

export interface NewVendorInput {
  name: string;
  aliases: string[];
  kind: VendorKind;
  utility_type: UtilityType | null;
}

export interface NewAccountInput {
  vendor_id: string;
  property_id: string;
  account_number: string;
  usage_unit: UsageUnit | null;
}

const UTILITY_TYPES: readonly UtilityType[] = ["ELECTRIC", "WATER", "TRASH", "GAS"];
const USAGE_UNITS: readonly UsageUnit[] = ["KWH", "CCF", "THERM", "YD3"];
const KINDS: readonly VendorKind[] = ["ENROLLED_UTILITY", "KNOWN_CONTRACTOR", "UNVERIFIED_CONTRACTOR"];

function required(value: string, label: string): string {
  const v = value.trim();
  if (!v) throw new Error(`${label} is required.`);
  return v;
}

function cleanList(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

/** Next PROP-### after the highest number already used. */
function nextPropertyId(existing: Property[]): PropertyId {
  const max = existing.reduce((m, p) => Math.max(m, Number(/^PROP-(\d+)$/.exec(p.id)?.[1] ?? 0)), 0);
  return `PROP-${String(max + 1).padStart(3, "0")}`;
}

/** V- plus the normalized name with spaces removed, numbered if taken: "Bay Water" -> "V-BAYWATER". */
function nextVendorId(name: string, existing: Vendor[]): VendorId {
  const base = `V-${normalizeVendorName(name).replace(/ /g, "")}`;
  const taken = new Set(existing.map((v) => v.id));
  if (!taken.has(base as VendorId)) return base as VendorId;
  let n = 2;
  while (taken.has(`${base}-${n}` as VendorId)) n++;
  return `${base}-${n}` as VendorId;
}

export function newProperty(input: NewPropertyInput, existing: Property[]): Property {
  const name = required(input.name, "Name");
  const street = required(input.street, "Street");
  const city = required(input.city, "City");
  const state = required(input.state, "State").toUpperCase();
  const zip = required(input.zip, "ZIP");
  if (!/^\d{5}$/.test(zip)) throw new Error("ZIP must be 5 digits.");
  const limit = input.contractor_auto_pay_limit;
  if (!Number.isFinite(limit) || limit < 0) throw new Error("Contractor auto-pay limit must be zero or more.");
  if (Math.abs(Math.round(limit * 100) - limit * 100) > 1e-6) throw new Error("Contractor auto-pay limit can have at most 2 decimals.");
  if (existing.some((p) => p.name.trim().toLowerCase() === name.toLowerCase())) throw new Error(`A property named ${name} already exists.`);
  if (existing.some((p) => p.street.trim().toLowerCase() === street.toLowerCase() && p.zip === zip)) {
    throw new Error(`${street}, ${zip} is already a property.`);
  }
  return { id: nextPropertyId(existing), name, street, city, state, zip, units: cleanList(input.units), contractor_auto_pay_limit: limit };
}

export function newVendor(input: NewVendorInput, existing: Vendor[]): Vendor {
  const name = required(input.name, "Name");
  if (!KINDS.includes(input.kind)) throw new Error("Choose a vendor type.");
  const utility = input.kind === "ENROLLED_UTILITY";
  if (utility && (input.utility_type === null || !UTILITY_TYPES.includes(input.utility_type))) throw new Error("Choose what this utility supplies.");
  const aliases = cleanList(input.aliases).filter((a) => normalizeVendorName(a) !== normalizeVendorName(name));
  // The matcher resolves a vendor by normalized name or alias, so each spelling may belong to one vendor only.
  const known = new Map<string, string>();
  for (const v of existing) for (const n of [v.name, ...v.aliases]) known.set(normalizeVendorName(n), v.name);
  for (const n of [name, ...aliases]) {
    const owner = known.get(normalizeVendorName(n));
    if (owner) throw new Error(`"${n}" already matches ${owner}.`);
  }
  return {
    id: nextVendorId(name, existing),
    name,
    aliases,
    kind: input.kind,
    utility_type: utility ? input.utility_type : null,
    default_rail: utility ? "UTILITY_PORTAL" : "ACH",
    crs_identity_ref: null,
  };
}

export function newAccount(input: NewAccountInput, ledger: { properties: Property[]; vendors: Vendor[]; accounts: VendorAccount[] }): VendorAccount {
  const vendor = ledger.vendors.find((v) => v.id === input.vendor_id);
  if (!vendor) throw new Error("Choose a vendor.");
  if (vendor.kind !== "ENROLLED_UTILITY" || vendor.utility_type === null) throw new Error("Only utilities have accounts.");
  const property = ledger.properties.find((p) => p.id === input.property_id);
  if (!property) throw new Error("Choose a property.");
  const account_number = required(input.account_number, "Account number");
  if (!normalizeAccount(account_number)) throw new Error("Account number needs letters or digits.");
  if (input.usage_unit !== null && !USAGE_UNITS.includes(input.usage_unit)) throw new Error("Choose a usage unit.");
  const clash = ledger.accounts.find((a) => normalizeAccount(a.account_number) === normalizeAccount(account_number));
  if (clash) throw new Error(`Account ${account_number} is already saved.`);
  return { vendor_id: vendor.id, property_id: property.id, account_number, utility_type: vendor.utility_type, usage_unit: input.usage_unit };
}
