import type {
  ExtractedBill,
  LedgerSnapshot,
  MatchBillFn,
  MatchResult,
  Property,
  PropertyCandidate,
  PropertyId,
  Vendor,
  VendorId,
} from "@/types/bill";
import {
  normalizeAccount,
  normalizeAddressKey,
  normalizeVendorName,
  parseAddress,
  type ParsedAddress,
} from "@/shared/normalize";
import { POLICY } from "@/seed/policy";

/** master-spec §5.4 address points, in hundredths so gaps stay exact. */
const NUMBER_AND_STREET = 95;
const LOCALITY_BONUS = 5;
const STREET_ONLY = 60;
const EXACT = 100;
/** Top two within AMBIGUOUS_MATCH_GAP: confidence cannot exceed this. */
const AMBIGUOUS_CAP = 85;

type NamedVendor = { id: VendorId; via: "EXACT_NAME" | "ALIAS" };

function text(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function points(cents: number): number {
  return cents / 100;
}

function findVendorByName(raw: string | null, vendors: Vendor[]): NamedVendor | null {
  if (!raw) return null;
  const key = normalizeVendorName(raw);
  if (!key) return null;
  const byName = vendors.find((vendor) => normalizeVendorName(vendor.name) === key);
  if (byName) return { id: byName.id, via: "EXACT_NAME" };
  const byAlias = vendors.find((vendor) =>
    vendor.aliases.some((alias) => normalizeVendorName(alias) === key),
  );
  if (byAlias) return { id: byAlias.id, via: "ALIAS" };
  return null;
}

function propertyById(properties: Property[], id: PropertyId): Property | undefined {
  return properties.find((property) => property.id === id);
}

function candidate(
  property: Property,
  score: number,
  reason: string,
): PropertyCandidate {
  return {
    property_id: property.id,
    property_name: property.name,
    score,
    reason,
  };
}

/**
 * City may be one word ("Berkeley") or several ("San Francisco").
 * A zip token, a single-word city token, or the city words in order all count.
 * master-spec §5.4 / pranil-spec §2.
 */
function localityMatches(locality: string[], property: Property): boolean {
  if (locality.some((token) => token === property.zip)) return true;
  const cityWords = property.city
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (cityWords.length === 0) return false;
  if (cityWords.length === 1) return locality.includes(cityWords[0]);
  for (let i = 0; i <= locality.length - cityWords.length; i++) {
    const slice = locality.slice(i, i + cityWords.length);
    if (cityWords.every((word, index) => slice[index] === word)) return true;
  }
  return false;
}

function plainStreet(number: string | null, street: string): string {
  const words = street
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
  return number ? `${number} ${words}` : words;
}

function unitRejected(bill: ParsedAddress, property: Property): boolean {
  if (!bill.unit || property.units.length === 0) return false;
  const unit = bill.unit.toUpperCase();
  return !property.units.some((label) => label.toUpperCase() === unit);
}

/** master-spec §5.4 ADDRESS. Locality bonus applies only to number + street. */
function scoreAddress(raw: string, properties: Property[]): PropertyCandidate[] {
  const bill = parseAddress(raw);
  const cap = Math.round(POLICY.UNIT_NOT_ON_PROPERTY_CAP * 100);
  const scored: PropertyCandidate[] = [];

  for (const property of properties) {
    const seeded = parseAddress(property.street);
    const numberEqual = bill.number !== null && bill.number === seeded.number;
    const streetEqual = bill.street !== "" && bill.street === seeded.street;
    if (!streetEqual) continue;

    let cents = 0;
    const notes: string[] = [];
    if (numberEqual && bill.number) {
      cents = NUMBER_AND_STREET;
      notes.push(`street ${plainStreet(bill.number, bill.street)} matches`);
      if (localityMatches(bill.locality, property)) {
        cents = Math.min(EXACT, cents + LOCALITY_BONUS);
        notes.push("city or zip matches");
      }
    } else if (bill.number === null) {
      cents = STREET_ONLY;
      notes.push(`street ${plainStreet(null, bill.street)} matches; number missing`);
    } else {
      continue;
    }

    if (unitRejected(bill, property)) {
      cents = Math.min(cents, cap);
      notes.push(
        `unit #${bill.unit} not on property (cap ${POLICY.UNIT_NOT_ON_PROPERTY_CAP.toFixed(2)})`,
      );
    }

    scored.push(candidate(property, points(cents), notes.join("; ")));
  }

  scored.sort((a, b) => {
    const byScore = Math.round(b.score * 100) - Math.round(a.score * 100);
    if (byScore !== 0) return byScore;
    return a.property_id.localeCompare(b.property_id);
  });
  return scored;
}

function unresolved(
  vendorId: VendorId | null,
  vendorMatch: MatchResult["vendor_match"],
  conflict: boolean,
  addressKey: string | null,
): MatchResult {
  return {
    vendor_id: vendorId,
    vendor_match: vendorMatch,
    property_id: null,
    method: "UNRESOLVED",
    confidence: 0,
    candidates: [],
    vendor_account_conflict: conflict,
    address_key: addressKey,
  };
}

/** master-spec §5.4. Pure: ledger in, match out. No model, no IO. */
export const matchBill: MatchBillFn = (extracted: ExtractedBill, ledger: LedgerSnapshot): MatchResult => {
  const vendorName = text(extracted.vendor_name.value);
  const accountRaw = text(extracted.account_number.value);
  const addressRaw = text(extracted.service_address.value);
  const accountNorm = accountRaw ? normalizeAccount(accountRaw) : "";
  const account = accountNorm
    ? ledger.accounts.find((row) => normalizeAccount(row.account_number) === accountNorm)
    : undefined;

  const named = findVendorByName(vendorName, ledger.vendors);
  let vendorId: VendorId | null = null;
  let vendorMatch: MatchResult["vendor_match"] = "NONE";
  if (named) {
    vendorId = named.id;
    vendorMatch = named.via;
  } else if (account) {
    vendorId = account.vendor_id;
    vendorMatch = "ACCOUNT";
  }

  const conflict = Boolean(named && account && named.id !== account.vendor_id);
  const addressKey = addressRaw ? normalizeAddressKey(addressRaw) : null;

  if (account) {
    const property = propertyById(ledger.properties, account.property_id);
    return {
      vendor_id: vendorId,
      vendor_match: vendorMatch,
      property_id: account.property_id,
      method: "EXACT_ACCOUNT",
      confidence: points(EXACT),
      candidates: property
        ? [
            candidate(
              property,
              points(EXACT),
              `account ${account.account_number} matches ${property.name}`,
            ),
          ]
        : [],
      vendor_account_conflict: conflict,
      address_key: addressKey,
    };
  }

  if (addressKey) {
    const alias = ledger.aliases.find((row) => row.address_key === addressKey);
    const property = alias ? propertyById(ledger.properties, alias.property_id) : undefined;
    if (alias && property) {
      return {
        vendor_id: vendorId,
        vendor_match: vendorMatch,
        property_id: alias.property_id,
        method: "HUMAN_ALIAS",
        confidence: points(EXACT),
        candidates: [
          candidate(
            property,
            points(EXACT),
            `stored alias ${addressKey} matches ${property.name}`,
          ),
        ],
        vendor_account_conflict: conflict,
        address_key: addressKey,
      };
    }
  }

  if (addressRaw) {
    const candidates = scoreAddress(addressRaw, ledger.properties);
    const top = candidates[0];
    const second = candidates[1];
    if (top) {
      let confidence = top.score;
      if (second) {
        const gap = Math.round(top.score * 100) - Math.round(second.score * 100);
        const within = Math.round(POLICY.AMBIGUOUS_MATCH_GAP * 100);
        if (gap <= within) confidence = Math.min(top.score, points(AMBIGUOUS_CAP));
      }
      return {
        vendor_id: vendorId,
        vendor_match: vendorMatch,
        property_id: top.property_id,
        method: "ADDRESS",
        confidence,
        candidates,
        vendor_account_conflict: conflict,
        address_key: addressKey,
      };
    }
  }

  return unresolved(vendorId, vendorMatch, conflict, addressKey);
};
