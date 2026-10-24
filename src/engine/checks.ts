import { daysBetween, normalizeInvoice, roundUsd } from "@/shared/normalize";
import { POLICY } from "@/seed/policy";
import type {
  BillRecord,
  CheckResult,
  CrsResult,
  ExtractedBill,
  FieldWithConfidence,
  HistoricalBill,
  LedgerSnapshot,
  MatchResult,
  ReasonCode,
} from "@/types/bill";
import { formatPct, formatQty, formatUsd } from "./format";

export interface CheckContext {
  bill_id: string;
  extracted: ExtractedBill;
  match: MatchResult;
  crs: CrsResult;
  ledger: LedgerSnapshot;
}

interface Peer {
  id: string;
  vendor_id: string;
  property_id: string;
  invoice_number: string;
  amount: number;
  due_date: string;
  usage_qty: number | null;
  paid_on: string | null;
  rank: "PAID" | "CLEARED" | "HELD";
}

function result(
  id: CheckResult["id"],
  outcome: CheckResult["outcome"],
  reasons: ReasonCode[],
  rationale: string,
  data: CheckResult["data"] = {},
): CheckResult {
  return { id, outcome, reasons, rationale, data };
}

function vendorOf(ctx: CheckContext) {
  const id = ctx.match.vendor_id;
  return id ? ctx.ledger.vendors.find((v) => v.id === id) ?? null : null;
}

function propertyOf(ctx: CheckContext) {
  const id = ctx.match.property_id;
  return id ? ctx.ledger.properties.find((p) => p.id === id) ?? null : null;
}

function value<T>(field: FieldWithConfidence<T>): T | null {
  return field.value;
}

function peers(ctx: CheckContext): Peer[] {
  const history: Peer[] = ctx.ledger.history.map((h: HistoricalBill) => ({
    id: h.id,
    vendor_id: h.vendor_id,
    property_id: h.property_id,
    invoice_number: h.invoice_number,
    amount: h.amount,
    due_date: h.due_date,
    usage_qty: h.usage_qty,
    paid_on: h.paid_on,
    rank: "PAID",
  }));
  const live: Peer[] = ctx.ledger.bills
    .filter((b) => b.id !== ctx.bill_id && (b.status === "CLEARED" || b.status === "HELD"))
    .map((b: BillRecord) => ({
      id: b.id,
      vendor_id: b.match.vendor_id ?? "",
      property_id: b.match.property_id ?? "",
      invoice_number: b.extracted.invoice_number.value ?? "",
      amount: b.extracted.total_amount.value ?? b.amount ?? 0,
      due_date: b.extracted.due_date.value ?? "",
      usage_qty: b.extracted.usage_qty.value,
      paid_on: null,
      rank: b.status === "CLEARED" ? "CLEARED" : "HELD",
    }));
  return [...history, ...live];
}

function rankOrder(rank: Peer["rank"]): number {
  if (rank === "PAID") return 0;
  if (rank === "CLEARED") return 1;
  return 2;
}

export function preferDuplicate(candidates: Peer[], due: string | null): Peer | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    const rank = rankOrder(a.rank) - rankOrder(b.rank);
    if (rank !== 0) return rank;
    if (!due) return a.due_date < b.due_date ? -1 : 1;
    return daysBetween(a.due_date, due) - daysBetween(b.due_date, due);
  });
  return sorted[0] ?? null;
}

function withinPct(amount: number, prior: number): boolean {
  if (prior === 0) return amount === 0;
  return Math.abs(amount - prior) / prior <= POLICY.FUZZY_DUP_AMOUNT_PCT / 100;
}

/** master-spec §5.1 EXTRACTION */
export function checkExtraction(ctx: CheckContext): CheckResult {
  const reasons: ReasonCode[] = [];
  const e = ctx.extracted;
  if (e.extraction_error) reasons.push("EXTRACTION_FAILED");

  const required: Array<[string, FieldWithConfidence<unknown>]> = [
    ["vendor_name", e.vendor_name],
    ["invoice_number", e.invoice_number],
    ["due_date", e.due_date],
  ];
  const missing: string[] = [];
  const low: string[] = [];
  for (const [name, field] of required) {
    if (field.value === null || field.value === "") missing.push(name);
    else if (field.confidence < POLICY.MIN_FIELD_CONFIDENCE) low.push(name);
  }
  const total = e.total_amount.value;
  if (total === null || total <= 0) missing.push("total_amount");
  else if (e.total_amount.confidence < POLICY.MIN_FIELD_CONFIDENCE) low.push("total_amount");

  const hasLocator = e.account_number.value !== null || e.service_address.value !== null;
  if (!hasLocator) missing.push("account_number or service_address");
  else {
    if (e.account_number.value !== null && e.account_number.confidence < POLICY.MIN_FIELD_CONFIDENCE) {
      low.push("account_number");
    }
    if (e.service_address.value !== null && e.service_address.confidence < POLICY.MIN_FIELD_CONFIDENCE) {
      low.push("service_address");
    }
  }

  if (missing.length > 0) reasons.push("MISSING_FIELD");
  if (low.length > 0) reasons.push("LOW_CONFIDENCE");

  if (reasons.length === 0) {
    return result("EXTRACTION", "PASS", [], "Critical fields are present at or above 0.85.");
  }
  const parts = [
    missing.length ? `missing ${missing.join(", ")}` : null,
    low.length ? `below 0.85: ${low.join(", ")}` : null,
    e.extraction_error ? e.extraction_error : null,
  ].filter(Boolean);
  return result("EXTRACTION", "HALT", reasons, parts.join("; "));
}

/** master-spec §5.1 MATCH */
export function checkMatch(ctx: CheckContext): CheckResult {
  const reasons: ReasonCode[] = [];
  if (!ctx.match.vendor_id) reasons.push("UNKNOWN_VENDOR");
  if (!ctx.match.property_id || ctx.match.confidence < POLICY.MIN_MATCH_CONFIDENCE) {
    reasons.push("NEEDS_PROPERTY_MATCH");
  }
  if (ctx.match.vendor_account_conflict) reasons.push("VENDOR_ACCOUNT_CONFLICT");
  const property = propertyOf(ctx);
  const confidence = ctx.match.confidence.toFixed(2);
  if (reasons.length === 0) {
    return result(
      "MATCH",
      "PASS",
      [],
      `Matched ${property?.name ?? ctx.match.property_id} by ${ctx.match.method} at ${confidence}.`,
      { confidence: ctx.match.confidence, method: ctx.match.method },
    );
  }
  return result(
    "MATCH",
    "HALT",
    reasons,
    `Match ${ctx.match.method} at ${confidence}; needs ${POLICY.MIN_MATCH_CONFIDENCE.toFixed(2)}.`,
    { confidence: ctx.match.confidence, method: ctx.match.method, property_name: property?.name ?? null },
  );
}

/** master-spec §5.1 EXACT_DUPLICATE */
export function checkExactDuplicate(ctx: CheckContext): CheckResult {
  const vendorId = ctx.match.vendor_id;
  const invoice = value(ctx.extracted.invoice_number);
  if (!vendorId || !invoice) {
    return result("EXACT_DUPLICATE", "SKIP", [], "No vendor or invoice, exact duplicate not computed.");
  }
  const needle = normalizeInvoice(invoice);
  const hits = peers(ctx).filter(
    (p) => p.vendor_id === vendorId && p.invoice_number !== "" && normalizeInvoice(p.invoice_number) === needle,
  );
  const chosen = preferDuplicate(hits, value(ctx.extracted.due_date));
  if (!chosen) return result("EXACT_DUPLICATE", "PASS", [], `Invoice ${invoice} is not already on the ledger.`);
  const days = value(ctx.extracted.due_date) ? daysBetween(chosen.due_date, value(ctx.extracted.due_date) as string) : 0;
  return result(
    "EXACT_DUPLICATE",
    "BLOCK",
    ["EXACT_DUPLICATE"],
    `Invoice ${invoice} matches ${chosen.id} (${chosen.invoice_number}), paid ${chosen.paid_on ?? "unpaid"}, due ${days} days apart.`,
    {
      matched_id: chosen.id,
      matched_invoice: chosen.invoice_number,
      matched_due: chosen.due_date,
      matched_paid_on: chosen.paid_on,
      matched_amount: chosen.amount,
      days_apart: days,
      rank: chosen.rank,
    },
  );
}

/** master-spec §5.1 FUZZY_DUPLICATE */
export function checkFuzzyDuplicate(ctx: CheckContext): CheckResult {
  const vendorId = ctx.match.vendor_id;
  const propertyId = ctx.match.property_id;
  const amount = value(ctx.extracted.total_amount);
  const due = value(ctx.extracted.due_date);
  if (!vendorId) return result("FUZZY_DUPLICATE", "SKIP", [], "No vendor, fuzzy duplicate not computed.");
  if (!propertyId) return result("FUZZY_DUPLICATE", "SKIP", [], "No property, fuzzy duplicate not computed.");
  if (amount === null || !due) return result("FUZZY_DUPLICATE", "SKIP", [], "No amount or due date, fuzzy duplicate not computed.");

  const hits = peers(ctx).filter((p) => {
    if (p.vendor_id !== vendorId || p.property_id !== propertyId || !p.due_date) return false;
    if (!withinPct(amount, p.amount)) return false;
    return daysBetween(p.due_date, due) <= POLICY.FUZZY_DUP_WINDOW_DAYS;
  });
  const chosen = preferDuplicate(hits, due);
  if (!chosen) {
    return result(
      "FUZZY_DUPLICATE",
      "PASS",
      [],
      `No prior bill within ${POLICY.FUZZY_DUP_AMOUNT_PCT}% and ${POLICY.FUZZY_DUP_WINDOW_DAYS} days.`,
    );
  }
  const days = daysBetween(chosen.due_date, due);
  const pct = chosen.amount === 0 ? 0 : (Math.abs(amount - chosen.amount) / chosen.amount) * 100;
  return result(
    "FUZZY_DUPLICATE",
    "BLOCK",
    ["FUZZY_DUPLICATE"],
    `${formatUsd(amount)} is within ${POLICY.FUZZY_DUP_AMOUNT_PCT}% of ${formatUsd(chosen.amount)} (${chosen.invoice_number}), due ${days} days apart.`,
    {
      prior_id: chosen.id,
      prior_invoice: chosen.invoice_number,
      prior_amount: chosen.amount,
      prior_due: chosen.due_date,
      prior_paid_on: chosen.paid_on,
      amount,
      days_apart: days,
      amount_delta_pct: pct,
      rank: chosen.rank,
    },
  );
}

/** master-spec §5.1 LINE_SUM */
export function checkLineSum(ctx: CheckContext): CheckResult {
  const lines = ctx.extracted.line_items;
  if (lines.length === 0) return result("LINE_SUM", "SKIP", [], "No line items, line sum not computed.");
  const total = value(ctx.extracted.total_amount);
  if (total === null) return result("LINE_SUM", "SKIP", [], "No printed total, line sum not computed.");
  const sum = roundUsd(lines.reduce((acc, line) => acc + line.amount, 0));
  const delta = roundUsd(Math.abs(sum - roundUsd(total)));
  if (delta > POLICY.LINE_SUM_TOLERANCE_USD) {
    return result(
      "LINE_SUM",
      "BLOCK",
      ["LINE_SUM_MISMATCH"],
      `Line items sum to ${formatUsd(sum)}; printed total is ${formatUsd(total)}.`,
      { line_sum: sum, total, delta },
    );
  }
  return result("LINE_SUM", "PASS", [], `Line items sum to ${formatUsd(sum)}, matching the printed total.`, {
    line_sum: sum,
    total,
    delta,
  });
}

/** master-spec §5.1 SPIKE */
export function checkSpike(ctx: CheckContext): CheckResult {
  const vendor = vendorOf(ctx);
  const property = propertyOf(ctx);
  if (!vendor) return result("SPIKE", "SKIP", [], "No vendor, spike not computed.");
  if (!property) return result("SPIKE", "SKIP", [], "No property, spike not computed.");
  if (vendor.kind !== "ENROLLED_UTILITY") return result("SPIKE", "SKIP", [], "Contractor, spike not computed.");
  const due = value(ctx.extracted.due_date);
  const amount = value(ctx.extracted.total_amount);
  if (!due || amount === null) return result("SPIKE", "SKIP", [], "No due date or amount, spike not computed.");

  const baseline = peers(ctx)
    .filter((p) => p.rank !== "HELD" && p.vendor_id === vendor.id && p.property_id === property.id && p.due_date < due)
    .sort((a, b) => (a.due_date < b.due_date ? 1 : -1))
    .slice(0, POLICY.BASELINE_BILLS);

  const amounts = baseline.map((p) => p.amount);
  const usages = baseline.map((p) => p.usage_qty).filter((n): n is number => n !== null);
  const avgAmount = amounts.length ? roundUsd(amounts.reduce((a, b) => a + b, 0) / amounts.length) : null;
  const avgUsage = usages.length ? usages.reduce((a, b) => a + b, 0) / usages.length : null;
  const amountVar = avgAmount && avgAmount !== 0 ? ((amount - avgAmount) / avgAmount) * 100 : null;
  const usage = value(ctx.extracted.usage_qty);
  const usageVar = usage !== null && avgUsage && avgUsage !== 0 ? ((usage - avgUsage) / avgUsage) * 100 : null;
  const data: CheckResult["data"] = {
    baseline_amounts: amounts,
    baseline_avg_amount: avgAmount,
    amount_variance_pct: amountVar,
    baseline_usage: usages,
    baseline_avg_usage: avgUsage,
    usage_variance_pct: usageVar,
    threshold_pct: POLICY.SPIKE_THRESHOLD_PCT,
    baseline_count: baseline.length,
    usage_unit: value(ctx.extracted.usage_unit),
  };

  if (baseline.length < POLICY.MIN_BASELINE_BILLS) {
    return result("SPIKE", "HALT", ["NO_BASELINE"], `Only ${baseline.length} prior bills; need ${POLICY.MIN_BASELINE_BILLS}.`, data);
  }

  const reasons: ReasonCode[] = [];
  if (usageVar !== null && usageVar > POLICY.SPIKE_THRESHOLD_PCT) reasons.push("USAGE_SPIKE");
  if (amountVar !== null && amountVar > POLICY.SPIKE_THRESHOLD_PCT) reasons.push("AMOUNT_SPIKE");
  const unit = value(ctx.extracted.usage_unit) ?? "";
  const usageText =
    usage !== null && avgUsage !== null ? `${formatQty(usage)} ${unit} vs ${formatQty(avgUsage)} ${unit} avg (${formatPct(usageVar ?? 0)})` : null;
  const amountText =
    avgAmount !== null && amountVar !== null
      ? `${formatUsd(amount)} vs ${formatUsd(avgAmount)} avg (${formatPct(amountVar)})`
      : formatUsd(amount);
  const rationale = [usageText, amountText, `threshold +${POLICY.SPIKE_THRESHOLD_PCT}%`].filter(Boolean).join("; ");
  return result("SPIKE", reasons.length ? "HALT" : "PASS", reasons, rationale, data);
}

/** master-spec §5.1 VENDOR_TRUST */
export function checkVendorTrust(ctx: CheckContext): CheckResult {
  const vendor = vendorOf(ctx);
  if (!vendor) return result("VENDOR_TRUST", "SKIP", [], "No vendor, vendor trust not computed.");
  if (vendor.kind !== "UNVERIFIED_CONTRACTOR") {
    return result("VENDOR_TRUST", "SKIP", [], `${vendor.kind === "ENROLLED_UTILITY" ? "Enrolled utility" : "Known contractor"}, vendor trust not required.`);
  }
  if (ctx.crs.outcome === "PASS") return result("VENDOR_TRUST", "PASS", [], "CRS returned PASS.");
  if (ctx.crs.outcome === "FLAGGED") {
    return result("VENDOR_TRUST", "BLOCK", ["CRS_FLAGGED"], ctx.crs.detail || "CRS flagged this vendor.");
  }
  if (ctx.crs.outcome === "UNAVAILABLE") {
    return result("VENDOR_TRUST", "HALT", ["CRS_UNAVAILABLE"], ctx.crs.detail || "CRS did not return a result.");
  }
  return result("VENDOR_TRUST", "HALT", ["VENDOR_UNVERIFIED"], "CRS is off. Unverified contractor is held.");
}

/** master-spec §5.1 POLICY */
export function checkPolicy(ctx: CheckContext): CheckResult {
  const vendor = vendorOf(ctx);
  const property = propertyOf(ctx);
  const amount = value(ctx.extracted.total_amount);
  if (!vendor) return result("POLICY", "SKIP", [], "No vendor, policy not computed.");
  if (vendor.kind === "ENROLLED_UTILITY") {
    if (ctx.match.method === "EXACT_ACCOUNT" && ctx.match.property_id) {
      return result("POLICY", "PASS", [], "Enrolled utility matched by account. Rail UTILITY_PORTAL.", { rail: "UTILITY_PORTAL" });
    }
    return result("POLICY", "HALT", ["UTILITY_NOT_ACCOUNT_MATCHED"], "Enrolled utility did not match an account number.", {
      rail: null,
    });
  }
  if (!property || amount === null) {
    return result("POLICY", "SKIP", [], "No property, auto-pay limit not computed.");
  }
  const limit = property.contractor_auto_pay_limit;
  if (amount <= limit) {
    return result("POLICY", "PASS", [], `${formatUsd(amount)} is at or under the ${formatUsd(limit)} auto-pay limit. Rail ACH.`, {
      rail: "ACH",
      limit,
    });
  }
  return result(
    "POLICY",
    "HALT",
    ["OVER_AUTO_PAY_LIMIT"],
    `${formatUsd(amount)} is over the ${formatUsd(limit)} auto-pay limit.`,
    { rail: null, limit },
  );
}
