/**
 * Shared normalizers. FROZEN with src/types/bill.ts.
 *
 * The matcher (src/match) and the duplicate rules (src/engine) must agree on
 * what "the same invoice" or "the same address" means, so both import from here.
 * Pure functions, no dependencies.
 */

/** Uppercase, keep letters and digits only. "4491-882-01" -> "449188201". */
export function normalizeAccount(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Same rule as accounts. "rw-99201" -> "RW99201". */
export function normalizeInvoice(raw: string): string {
  return normalizeAccount(raw);
}

const VENDOR_NOISE = new Set(["THE", "INC", "LLC", "CO", "CORP", "COMPANY", "LTD"]);

/** "Pacific Green Landscaping, LLC" -> "PACIFIC GREEN LANDSCAPING". "&" becomes "AND". */
export function normalizeVendorName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !VENDOR_NOISE.has(t))
    .join(" ");
}

const STREET_SUFFIXES = new Set([
  "ST", "STREET", "AVE", "AVENUE", "BLVD", "BOULEVARD", "RD", "ROAD",
  "DR", "DRIVE", "WAY", "LN", "LANE", "CT", "COURT", "PL", "PLACE", "TER", "TERRACE",
]);

const UNIT_WORDS = new Set(["APT", "UNIT", "STE", "SUITE", "NO"]);

export interface ParsedAddress {
  /** "1880" or null if the line has no leading number. */
  number: string | null;
  /** Street name without suffix, e.g. "LOMBARD" or "SHATTUCK". */
  street: string;
  /** "B", "101", or null. */
  unit: string | null;
  /** Uppercased tokens after the first comma (city, state, zip), for city/zip bonus. */
  locality: string[];
}

/**
 * "1880 Lombard #B"                       -> { number: "1880", street: "LOMBARD", unit: "B", locality: [] }
 * "2110 Shattuck Ave, Berkeley, CA 94704" -> { number: "2110", street: "SHATTUCK", unit: null, locality: ["BERKELEY","CA","94704"] }
 * "410 Townsend St Suite 300"             -> { number: "410", street: "TOWNSEND", unit: "300", ... }
 */
export function parseAddress(raw: string): ParsedAddress {
  const [lineRaw, ...rest] = raw.split(",");
  const locality = rest
    .join(" ")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  // "#B" or "# B" anywhere in the street line is a unit.
  let unit: string | null = null;
  let line = lineRaw.toUpperCase();
  const hashUnit = line.match(/#\s*([A-Z0-9-]+)/);
  if (hashUnit) {
    unit = hashUnit[1];
    line = line.replace(hashUnit[0], " ");
  }

  const tokens = line.replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (UNIT_WORDS.has(t) && i + 1 < tokens.length) {
      unit = unit ?? tokens[i + 1];
      i++;
      continue;
    }
    out.push(t);
  }

  const number = out.length > 0 && /^\d+[A-Z]?$/.test(out[0]) ? out.shift()! : null;
  const street = out.filter((t) => !STREET_SUFFIXES.has(t)).join(" ");
  return { number, street, unit, locality };
}

/** Alias key: number + street + unit. "1880 Lombard St. #b" -> "1880 LOMBARD #B". */
export function normalizeAddressKey(raw: string): string {
  const a = parseAddress(raw);
  return [a.number, a.street, a.unit ? `#${a.unit}` : null].filter(Boolean).join(" ");
}

/** Round to cents. Use at every money boundary. */
export function roundUsd(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Whole days between two ISO dates, absolute. */
export function daysBetween(a: string, b: string): number {
  const ms = Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`));
  return Math.round(ms / 86_400_000);
}
