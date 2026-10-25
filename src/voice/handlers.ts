/**
 * Pure shaping for the read-only voice tools.
 * Auth, search, and JSON live here so tests do not boot Convex.
 * Callers may only pass bills a query already returned.
 */
import { computeTotals } from "@/engine/totals";
import { formatUsd } from "@/engine/format";
import { normalizeVendorName } from "@/shared/normalize";
import type { BillRecord, BillStatus } from "@/types/bill";
import { z } from "zod";
import { buildBillFacts, type BillFacts } from "./facts";

export const VOICE_LIST_CAP = 5;

export interface VoiceResult {
  status: number;
  body: string;
}

export interface FindQuery {
  q: string | null;
  vendor: string | null;
  property: string | null;
  bill_id: string | null;
}

const text = z.string().trim().max(80);

const FindParams = z.object({
  q: text.optional(),
  vendor: text.optional(),
  property: text.optional(),
  bill_id: text.optional(),
});

export function voiceAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const expected = `Bearer ${secret}`;
  const actual = authorization ?? "";
  let diff = actual.length === expected.length ? 0 : 1;
  const length = Math.max(actual.length, expected.length);
  for (let i = 0; i < length; i++) {
    const left = i < actual.length ? actual.charCodeAt(i) : 0;
    const right = i < expected.length ? expected.charCodeAt(i) : 0;
    diff |= left ^ right;
  }
  return diff === 0;
}

export function unauthorizedResult(): VoiceResult {
  return json(401, { error: "unauthorized" });
}

export function billIdFromPath(pathname: string): string | null {
  const prefix = "/voice/bill/";
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  if (!rest || rest.includes("/")) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rest);
  } catch {
    return null;
  }
  if (!decoded || decoded.length > 80 || decoded.includes("/")) return null;
  return decoded;
}

export function parseFindQuery(params: URLSearchParams): { ok: true; query: FindQuery } | { ok: false; error: "bad_query" } {
  const parsed = FindParams.safeParse({
    q: params.get("q") ?? undefined,
    vendor: params.get("vendor") ?? undefined,
    property: params.get("property") ?? undefined,
    bill_id: params.get("bill_id") ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: "bad_query" };
  return {
    ok: true,
    query: {
      q: blank(parsed.data.q),
      vendor: blank(parsed.data.vendor),
      property: blank(parsed.data.property),
      bill_id: blank(parsed.data.bill_id),
    },
  };
}

export function listOpenResult(bills: BillRecord[]): VoiceResult {
  const open = bills.filter((bill) => bill.status === "HELD" || bill.status === "BLOCKED");
  const ordered = open
    .map((bill, index) => ({ bill, index }))
    .sort((a, b) => rank(a.bill.status) - rank(b.bill.status) || a.index - b.index)
    .map((row) => row.bill);
  const shown = ordered.slice(0, VOICE_LIST_CAP).map(shortRow);
  const totals = computeTotals(bills);
  const held = formatUsd(totals.held);
  const blocked = formatUsd(totals.blocked);
  const note =
    open.length === 0
      ? "No bills are held or blocked."
      : shown.length < open.length
        ? `Showing ${shown.length} of ${open.length} bills that need a person. Held ${held}. Blocked ${blocked}.`
        : `${open.length} bill${open.length === 1 ? "" : "s"} need a person. Held ${held}. Blocked ${blocked}.`;
  return json(200, {
    bills: shown,
    shown: shown.length,
    open_count: open.length,
    totals: {
      held,
      blocked,
      held_count: totals.count.held,
      blocked_count: totals.count.blocked,
    },
    note,
  });
}

export function findResult(bills: BillRecord[], query: FindQuery): VoiceResult {
  if (!query.q && !query.vendor && !query.property && !query.bill_id) {
    return json(200, {
      bills: [],
      shown: 0,
      matched: 0,
      note: "Tell me a vendor, a property, or a bill id.",
    });
  }
  const matched = bills.filter((bill) => matches(bill, query));
  const shown = matched.slice(0, VOICE_LIST_CAP).map(shortRow);
  const note =
    matched.length === 0
      ? "No matching bill."
      : shown.length < matched.length
        ? `Showing ${shown.length} of ${matched.length} matches.`
        : matched.length === 1
          ? "1 matching bill."
          : `${matched.length} matching bills.`;
  return json(200, { bills: shown, shown: shown.length, matched: matched.length, note });
}

export function explainResult(bill: BillRecord | null): VoiceResult {
  if (!bill) return json(404, { error: "not_found" });
  return json(200, buildBillFacts(bill));
}

function shortRow(bill: BillRecord): Pick<BillFacts, "bill_id" | "vendor" | "property" | "amount" | "status" | "required_approver"> & { reason: string } {
  const facts = buildBillFacts(bill);
  return {
    bill_id: facts.bill_id,
    vendor: facts.vendor,
    property: facts.property,
    amount: facts.amount,
    status: facts.status,
    required_approver: facts.required_approver,
    reason: facts.reasons[0] ?? "No reason was stored.",
  };
}

function matches(bill: BillRecord, query: FindQuery): boolean {
  if (query.vendor && !vendorHit(query.vendor, bill.vendor_name)) return false;
  if (query.property && !propertyHit(query.property, bill.property_name)) return false;
  if (query.bill_id && !idHit(query.bill_id, bill.id)) return false;
  if (query.q && !vendorHit(query.q, bill.vendor_name) && !propertyHit(query.q, bill.property_name) && !idHit(query.q, bill.id)) {
    return false;
  }
  return true;
}

function vendorHit(query: string, vendor: string | null): boolean {
  if (!vendor) return false;
  const needle = normalizeVendorName(query);
  const name = normalizeVendorName(vendor);
  if (!needle || !name) return false;
  return name === needle || (needle.length >= 3 && name.includes(needle));
}

function propertyHit(query: string, property: string | null): boolean {
  if (!property) return false;
  const needle = fold(query);
  const name = fold(property);
  if (!needle || !name) return false;
  if (needle.length < 3) return name === needle;
  return name === needle || name.includes(needle);
}

function idHit(query: string, id: string): boolean {
  return fold(query) === fold(id);
}

function fold(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function rank(status: BillStatus): number {
  if (status === "HELD") return 0;
  if (status === "BLOCKED") return 1;
  return 2;
}

function blank(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

function json(status: number, payload: unknown): VoiceResult {
  return { status, body: JSON.stringify(payload) };
}
