/**
 * Seeded portfolio and AP ledger history. FROZEN.
 *
 * Seed stores facts (properties, vendors, accounts, prior paid bills).
 * Seed NEVER stores a verdict for a demo bill: every status on screen comes
 * from processBill() at runtime.
 *
 * Numbers are chosen so the demo arithmetic is exact (master-spec.md section 6):
 *  - Bayview PG&E last 3 bills average $2,340.00; none within 2% of $2,290.40.
 *  - Shattuck EBMUD last 3 bills average $1,490.00 and 42 CCF.
 *  - Recology RW-99201 ($680.00, due 2026-10-20) is already paid.
 */

import type { HistoricalBill, Property, Vendor, VendorAccount } from "../types/bill";

function units(floors: number, perFloor: number): string[] {
  const out: string[] = [];
  for (let f = 1; f <= floors; f++) {
    for (let u = 1; u <= perFloor; u++) out.push(`${f}${String(u).padStart(2, "0")}`);
  }
  return out;
}

export const PROPERTIES: Property[] = [
  {
    id: "PROP-001",
    name: "Bayview Commons",
    street: "2450 Market St",
    city: "San Francisco",
    state: "CA",
    zip: "94114",
    units: units(4, 12), // 48 units, 101-412
    contractor_auto_pay_limit: 1500,
  },
  {
    id: "PROP-002",
    name: "Telegraph Hill Lofts",
    street: "1880 Lombard St",
    city: "San Francisco",
    state: "CA",
    zip: "94123",
    units: units(4, 8), // 32 units, 101-408. There is no unit "B".
    contractor_auto_pay_limit: 1000,
  },
  {
    id: "PROP-003",
    name: "Shattuck Student Living",
    street: "2110 Shattuck Ave",
    city: "Berkeley",
    state: "CA",
    zip: "94704",
    units: [], // bed-based, no unit check
    contractor_auto_pay_limit: 2000,
  },
  {
    id: "PROP-004",
    name: "Marina Gate Retail Plaza",
    street: "3100 Fillmore St",
    city: "San Francisco",
    state: "CA",
    zip: "94123",
    units: ["100", "110", "120", "130"],
    contractor_auto_pay_limit: 2500,
  },
  {
    id: "PROP-005",
    name: "Soma Tech Atrium",
    street: "410 Townsend St",
    city: "San Francisco",
    state: "CA",
    zip: "94107",
    units: [],
    contractor_auto_pay_limit: 3000,
  },
];

export const VENDORS: Vendor[] = [
  {
    id: "V-PGE",
    name: "PG&E",
    aliases: ["PGE", "Pacific Gas and Electric", "Pacific Gas & Electric Company"],
    kind: "ENROLLED_UTILITY",
    utility_type: "ELECTRIC",
    default_rail: "UTILITY_PORTAL",
    crs_identity_ref: null,
  },
  {
    id: "V-EBMUD",
    name: "EBMUD",
    aliases: ["East Bay Municipal Utility District", "East Bay MUD"],
    kind: "ENROLLED_UTILITY",
    utility_type: "WATER",
    default_rail: "UTILITY_PORTAL",
    crs_identity_ref: null,
  },
  {
    id: "V-SFPUC",
    name: "SFPUC",
    aliases: ["San Francisco Public Utilities Commission", "SF Water"],
    kind: "ENROLLED_UTILITY",
    utility_type: "WATER",
    default_rail: "UTILITY_PORTAL",
    crs_identity_ref: null,
  },
  {
    id: "V-RECOLOGY",
    name: "Recology",
    aliases: ["Recology East Bay", "Recology San Francisco"],
    kind: "ENROLLED_UTILITY",
    utility_type: "TRASH",
    default_rail: "UTILITY_PORTAL",
    crs_identity_ref: null,
  },
  {
    id: "V-BAYLINE",
    name: "Bayline Plumbing & Rooter",
    aliases: ["Bayline Plumbing", "Bayline Plumbing and Rooter"],
    kind: "KNOWN_CONTRACTOR",
    utility_type: null,
    default_rail: "ACH",
    crs_identity_ref: null,
  },
  {
    id: "V-PACGREEN",
    name: "Pacific Green Landscaping",
    aliases: ["Pacific Green", "Pacific Green Landscaping LLC"],
    kind: "KNOWN_CONTRACTOR",
    utility_type: null,
    default_rail: "ACH",
    crs_identity_ref: null,
  },
  {
    id: "V-APEX",
    name: "Apex Rapid HVAC LLC",
    aliases: ["Apex Rapid HVAC", "Apex HVAC"],
    kind: "UNVERIFIED_CONTRACTOR",
    utility_type: null,
    default_rail: "ACH",
    // Set to an official CRS sandbox test identity once credentials arrive. Never invent one.
    crs_identity_ref: null,
  },
];

export const ACCOUNTS: VendorAccount[] = [
  { vendor_id: "V-PGE", property_id: "PROP-001", account_number: "4491-882-01", utility_type: "ELECTRIC", usage_unit: "KWH" },
  { vendor_id: "V-PGE", property_id: "PROP-002", account_number: "5512-301-07", utility_type: "ELECTRIC", usage_unit: "KWH" },
  { vendor_id: "V-PGE", property_id: "PROP-003", account_number: "3307-219-55", utility_type: "ELECTRIC", usage_unit: "KWH" },
  { vendor_id: "V-PGE", property_id: "PROP-004", account_number: "7730-118-44", utility_type: "ELECTRIC", usage_unit: "KWH" },
  { vendor_id: "V-PGE", property_id: "PROP-005", account_number: "6120-554-90", utility_type: "ELECTRIC", usage_unit: "KWH" },
  { vendor_id: "V-SFPUC", property_id: "PROP-001", account_number: "SFW-2450-0011", utility_type: "WATER", usage_unit: "CCF" },
  { vendor_id: "V-SFPUC", property_id: "PROP-002", account_number: "SFW-1880-0022", utility_type: "WATER", usage_unit: "CCF" },
  { vendor_id: "V-EBMUD", property_id: "PROP-003", account_number: "88-2110-4471", utility_type: "WATER", usage_unit: "CCF" },
  { vendor_id: "V-RECOLOGY", property_id: "PROP-003", account_number: "RCL-2110-03", utility_type: "TRASH", usage_unit: null },
];

type H = Omit<HistoricalBill, "id" | "paid_on">;

function hist(rows: H[]): HistoricalBill[] {
  return rows.map((r, i) => ({
    ...r,
    id: `HIST-${String(i + 1).padStart(3, "0")}`,
    // Paid 3 days before due, a plain ledger fact.
    paid_on: new Date(Date.parse(`${r.due_date}T00:00:00Z`) - 3 * 86_400_000).toISOString().slice(0, 10),
  }));
}

export const HISTORY: HistoricalBill[] = hist([
  // Bayview Commons, PG&E electric. Avg $2,340.00, 8,306.7 kWh.
  { vendor_id: "V-PGE", property_id: "PROP-001", invoice_number: "PGE-0882-2608", amount: 2280.0, due_date: "2026-08-05", usage_qty: 8150, usage_unit: "KWH" },
  { vendor_id: "V-PGE", property_id: "PROP-001", invoice_number: "PGE-0882-2609", amount: 2330.0, due_date: "2026-09-04", usage_qty: 8260, usage_unit: "KWH" },
  { vendor_id: "V-PGE", property_id: "PROP-001", invoice_number: "PGE-0882-2610", amount: 2410.0, due_date: "2026-10-05", usage_qty: 8510, usage_unit: "KWH" },

  // Telegraph Hill Lofts, PG&E electric. Avg $1,610.00.
  { vendor_id: "V-PGE", property_id: "PROP-002", invoice_number: "PGE-0301-2608", amount: 1580.0, due_date: "2026-08-07", usage_qty: 5600, usage_unit: "KWH" },
  { vendor_id: "V-PGE", property_id: "PROP-002", invoice_number: "PGE-0301-2609", amount: 1640.0, due_date: "2026-09-08", usage_qty: 5800, usage_unit: "KWH" },
  { vendor_id: "V-PGE", property_id: "PROP-002", invoice_number: "PGE-0301-2610", amount: 1610.0, due_date: "2026-10-07", usage_qty: 5700, usage_unit: "KWH" },

  // Shattuck Student Living, PG&E electric. Avg $2,010.00.
  { vendor_id: "V-PGE", property_id: "PROP-003", invoice_number: "PGE-0219-2608", amount: 1980.0, due_date: "2026-08-14", usage_qty: 7100, usage_unit: "KWH" },
  { vendor_id: "V-PGE", property_id: "PROP-003", invoice_number: "PGE-0219-2609", amount: 2040.0, due_date: "2026-09-14", usage_qty: 7300, usage_unit: "KWH" },
  { vendor_id: "V-PGE", property_id: "PROP-003", invoice_number: "PGE-0219-2610", amount: 2010.0, due_date: "2026-10-14", usage_qty: 7200, usage_unit: "KWH" },

  // Marina Gate Retail Plaza, PG&E electric. Avg $3,100.00.
  { vendor_id: "V-PGE", property_id: "PROP-004", invoice_number: "PGE-0118-2608", amount: 3050.0, due_date: "2026-08-10", usage_qty: 11000, usage_unit: "KWH" },
  { vendor_id: "V-PGE", property_id: "PROP-004", invoice_number: "PGE-0118-2609", amount: 3120.0, due_date: "2026-09-10", usage_qty: 11250, usage_unit: "KWH" },
  { vendor_id: "V-PGE", property_id: "PROP-004", invoice_number: "PGE-0118-2610", amount: 3130.0, due_date: "2026-10-09", usage_qty: 11300, usage_unit: "KWH" },

  // Soma Tech Atrium, PG&E electric. Avg $2,650.00.
  { vendor_id: "V-PGE", property_id: "PROP-005", invoice_number: "PGE-0554-2608", amount: 2600.0, due_date: "2026-08-12", usage_qty: 9300, usage_unit: "KWH" },
  { vendor_id: "V-PGE", property_id: "PROP-005", invoice_number: "PGE-0554-2609", amount: 2650.0, due_date: "2026-09-11", usage_qty: 9500, usage_unit: "KWH" },
  { vendor_id: "V-PGE", property_id: "PROP-005", invoice_number: "PGE-0554-2610", amount: 2700.0, due_date: "2026-10-13", usage_qty: 9650, usage_unit: "KWH" },

  // Bayview Commons, SFPUC water. Avg $1,120.00.
  { vendor_id: "V-SFPUC", property_id: "PROP-001", invoice_number: "SFW-2450-2608", amount: 1100.0, due_date: "2026-08-18", usage_qty: 38, usage_unit: "CCF" },
  { vendor_id: "V-SFPUC", property_id: "PROP-001", invoice_number: "SFW-2450-2609", amount: 1130.0, due_date: "2026-09-17", usage_qty: 39, usage_unit: "CCF" },
  { vendor_id: "V-SFPUC", property_id: "PROP-001", invoice_number: "SFW-2450-2610", amount: 1130.0, due_date: "2026-10-16", usage_qty: 39, usage_unit: "CCF" },

  // Telegraph Hill Lofts, SFPUC water. Avg $840.00.
  { vendor_id: "V-SFPUC", property_id: "PROP-002", invoice_number: "SFW-1880-2608", amount: 820.0, due_date: "2026-08-19", usage_qty: 28, usage_unit: "CCF" },
  { vendor_id: "V-SFPUC", property_id: "PROP-002", invoice_number: "SFW-1880-2609", amount: 850.0, due_date: "2026-09-18", usage_qty: 29, usage_unit: "CCF" },
  { vendor_id: "V-SFPUC", property_id: "PROP-002", invoice_number: "SFW-1880-2610", amount: 850.0, due_date: "2026-10-19", usage_qty: 29, usage_unit: "CCF" },

  // Shattuck Student Living, EBMUD water. Avg $1,490.00 and 42 CCF (about $35.50/CCF).
  { vendor_id: "V-EBMUD", property_id: "PROP-003", invoice_number: "EB-4471-2608", amount: 1460.0, due_date: "2026-08-12", usage_qty: 40, usage_unit: "CCF" },
  { vendor_id: "V-EBMUD", property_id: "PROP-003", invoice_number: "EB-4471-2609", amount: 1490.0, due_date: "2026-09-11", usage_qty: 42, usage_unit: "CCF" },
  { vendor_id: "V-EBMUD", property_id: "PROP-003", invoice_number: "EB-4471-2610", amount: 1520.0, due_date: "2026-10-12", usage_qty: 44, usage_unit: "CCF" },

  // Shattuck Student Living, Recology trash. Flat $680.00. RW-99201 is the one BILL-102 re-sends.
  { vendor_id: "V-RECOLOGY", property_id: "PROP-003", invoice_number: "RW-97410", amount: 680.0, due_date: "2026-08-20", usage_qty: null, usage_unit: null },
  { vendor_id: "V-RECOLOGY", property_id: "PROP-003", invoice_number: "RW-98305", amount: 680.0, due_date: "2026-09-20", usage_qty: null, usage_unit: null },
  { vendor_id: "V-RECOLOGY", property_id: "PROP-003", invoice_number: "RW-99201", amount: 680.0, due_date: "2026-10-20", usage_qty: null, usage_unit: null },

  // Contractors: prior paid jobs, so they read as known vendors.
  { vendor_id: "V-BAYLINE", property_id: "PROP-001", invoice_number: "BPR-5521", amount: 1180.0, due_date: "2026-08-28", usage_qty: null, usage_unit: null },
  { vendor_id: "V-PACGREEN", property_id: "PROP-004", invoice_number: "PGL-2988", amount: 890.0, due_date: "2026-08-31", usage_qty: null, usage_unit: null },
  { vendor_id: "V-PACGREEN", property_id: "PROP-004", invoice_number: "PGL-3010", amount: 890.0, due_date: "2026-09-30", usage_qty: null, usage_unit: null },
]);
