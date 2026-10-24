/**
 * Demo bill INPUTS. FROZEN.
 *
 * These are what gets typed, replayed, or chipped into the injector. They carry
 * no status: the expected outcomes live in tests/ and master-spec.md section 6,
 * and the screen only ever shows what processBill() returned.
 */

import type { BillFormInput } from "../types/bill";

export interface DemoInput {
  key: string;
  /** Short label for chips and the replay rail. */
  label: string;
  form: BillFormInput;
}

/** The opening shot: replayed through processBill() in this order as source FEED, label "Saturday intake". */
export const OPENING_BATCH: DemoInput[] = [
  {
    key: "BILL-101",
    label: "PG&E · Bayview",
    form: {
      vendor_name: "PG&E",
      invoice_number: "PGE-0882-2611",
      account_number: "4491-882-01",
      service_address: "2450 Market St, San Francisco, CA 94114",
      due_date: "2026-11-04",
      billing_period_start: "2026-09-16",
      billing_period_end: "2026-10-15",
      total_amount: 2290.4,
      usage_qty: 8120,
      usage_unit: "KWH",
      line_items: [
        { description: "Electric delivery charges", amount: 1340.15 },
        { description: "Electric generation charges", amount: 950.25 },
      ],
    },
  },
  {
    key: "BILL-102",
    label: "Recology · Shattuck",
    form: {
      vendor_name: "Recology",
      invoice_number: "RW-99201",
      account_number: "RCL-2110-03",
      service_address: "2110 Shattuck Ave, Berkeley, CA 94704",
      due_date: "2026-11-03",
      total_amount: 680.0,
    },
  },
  {
    key: "BILL-103",
    label: "EBMUD · Shattuck",
    form: {
      vendor_name: "EBMUD",
      invoice_number: "EB-4471-2611",
      account_number: "88-2110-4471",
      service_address: "2110 Shattuck Ave, Berkeley, CA 94704",
      due_date: "2026-11-10",
      billing_period_start: "2026-09-13",
      billing_period_end: "2026-10-12",
      total_amount: 5680.0,
      usage_qty: 160,
      usage_unit: "CCF",
    },
  },
  {
    key: "BILL-104",
    label: "Plumbing · Lombard #B",
    form: {
      vendor_name: "Bayline Plumbing",
      invoice_number: "BPR-6034",
      service_address: "1880 Lombard #B",
      due_date: "2026-10-30",
      total_amount: 420.0,
      line_items: [
        { description: "Main drain clear", amount: 300.0 },
        { description: "Service call", amount: 120.0 },
      ],
    },
  },
];

/** Same smudged address as BILL-104, new invoice. Run it after a human assigns 1880 Lombard #B. */
export const ALIAS_TWIN: DemoInput = {
  key: "BILL-104B",
  label: "Plumbing twin · Lombard #B",
  form: {
    vendor_name: "Bayline Plumbing",
    invoice_number: "BPR-6071",
    service_address: "1880 Lombard #B",
    due_date: "2026-11-06",
    total_amount: 390.0,
  },
};

/** Injector chips. A chip only PREFILLS the form; every field stays editable; Run calls processBill(). */
export const JUDGE_CHIPS: DemoInput[] = [
  {
    key: "CHIP-FUZZY-DUP",
    label: "Recology · new invoice · $686",
    form: {
      vendor_name: "Recology",
      invoice_number: "RW-10021",
      account_number: "RCL-2110-03",
      service_address: "2110 Shattuck Ave, Berkeley, CA 94704",
      due_date: "2026-10-25",
      total_amount: 686.0,
    },
  },
  {
    key: "CHIP-CLEAN-PGE",
    label: "PG&E · Telegraph Hill",
    form: {
      vendor_name: "PG&E",
      invoice_number: "PGE-0301-2611",
      account_number: "5512-301-07",
      service_address: "1880 Lombard St, San Francisco, CA 94123",
      due_date: "2026-11-06",
      total_amount: 1595.2,
      usage_qty: 5650,
      usage_unit: "KWH",
    },
  },
  {
    key: "CHIP-NEW-CONTRACTOR",
    label: "Apex HVAC · Soma · $3,450",
    form: {
      vendor_name: "Apex Rapid HVAC LLC",
      invoice_number: "APX-0091",
      service_address: "410 Townsend St, San Francisco, CA 94107",
      due_date: "2026-10-31",
      total_amount: 3450.0,
    },
  },
  {
    key: "CHIP-CONTRACTOR-CLEAN",
    label: "Pacific Green · Marina · $890",
    form: {
      vendor_name: "Pacific Green Landscaping",
      invoice_number: "PGL-3044",
      service_address: "3100 Fillmore St, San Francisco, CA 94123",
      due_date: "2026-10-30",
      total_amount: 890.0,
    },
  },
];

/** Stretch fixture: printed total is $1,000 more than the lines. */
export const LINE_SUM_FIXTURE: DemoInput = {
  key: "BILL-LINESUM",
  label: "SFPUC · lines don't add up",
  form: {
    vendor_name: "SFPUC",
    invoice_number: "SFW-1880-2611",
    account_number: "SFW-1880-0022",
    service_address: "1880 Lombard St, San Francisco, CA 94123",
    due_date: "2026-11-12",
    total_amount: 1850.0,
    usage_qty: 29,
    usage_unit: "CCF",
    line_items: [
      { description: "Water service", amount: 520.0 },
      { description: "Wastewater service", amount: 330.0 },
    ],
  },
};
