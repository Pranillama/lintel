import { POLICY } from "@/seed/policy";
import { parseAddress } from "@/shared/normalize";
import type { CheckResult, Decision, ExtractedBill, LedgerSnapshot, MatchResult, Property, ReasonCode } from "@/types/bill";
import { formatPct, formatQty, formatUsd } from "./format";

export function explain(input: {
  reasons: ReasonCode[];
  required_approver: Decision["required_approver"];
  checks: CheckResult[];
  extracted: ExtractedBill;
  match: MatchResult;
  ledger: LedgerSnapshot;
  rail: Decision["rail"];
}): string {
  const { reasons, checks, extracted, match, ledger, rail, required_approver } = input;
  const vendor = match.vendor_id ? ledger.vendors.find((v) => v.id === match.vendor_id) : undefined;
  const property = match.property_id ? ledger.properties.find((p) => p.id === match.property_id) : undefined;
  const amount = extracted.total_amount.value;
  const spike = checks.find((c) => c.id === "SPIKE");
  const exact = checks.find((c) => c.id === "EXACT_DUPLICATE");
  const fuzzy = checks.find((c) => c.id === "FUZZY_DUPLICATE");
  const lines = checks.find((c) => c.id === "LINE_SUM");

  if (reasons.includes("EXACT_DUPLICATE") && exact) {
    const paid = str(exact.data.matched_paid_on);
    const id = str(exact.data.matched_id);
    const invoice = extracted.invoice_number.value ?? "";
    const days = num(exact.data.days_apart);
    const fuzzyToo = reasons.includes("FUZZY_DUPLICATE");
    const head = `${vendor?.name ?? "Vendor"} invoice ${invoice} was already paid${paid ? ` on ${paid}` : ""} (${id}).`;
    const tail = fuzzyToo ? ` Same property and amount within ${POLICY.FUZZY_DUP_AMOUNT_PCT}%, due ${days} days apart.` : "";
    return `${head}${tail} Blocked: duplicates are never paid.`;
  }

  if (reasons.includes("FUZZY_DUPLICATE") && fuzzy) {
    const invoice = extracted.invoice_number.value ?? "";
    const priorInvoice = str(fuzzy.data.prior_invoice);
    const priorAmount = num(fuzzy.data.prior_amount);
    const days = num(fuzzy.data.days_apart);
    return `New invoice ${invoice}, but ${formatUsd(amount ?? 0)} is within ${POLICY.FUZZY_DUP_AMOUNT_PCT}% of ${formatUsd(priorAmount)} (${priorInvoice}) for the same vendor and property, due ${days} days apart. Blocked as a likely duplicate.`;
  }

  if (reasons.includes("LINE_SUM_MISMATCH") && lines) {
    return `Line items sum to ${formatUsd(num(lines.data.line_sum))}, printed total is ${formatUsd(num(lines.data.total))}. Blocked: the lines do not add up.`;
  }

  if (reasons.includes("CRS_FLAGGED")) {
    return "CRS flagged this vendor. Blocked: a flagged contractor is never paid.";
  }

  if (reasons.some((r) => INTAKE_REASONS.includes(r))) {
    const extraction = checks.find((c) => c.id === "EXTRACTION");
    const bits: string[] = [];
    if (reasons.includes("EXTRACTION_FAILED")) bits.push("The bill could not be read");
    if (reasons.includes("MISSING_FIELD")) bits.push(`Missing ${fieldWords(extraction?.data.missing)}`);
    if (reasons.includes("LOW_CONFIDENCE")) {
      bits.push(`Read below ${POLICY.MIN_FIELD_CONFIDENCE.toFixed(2)} confidence: ${fieldWords(extraction?.data.low)}`);
    }
    if (reasons.includes("UNKNOWN_VENDOR")) bits.push(`"${extracted.vendor_name.value ?? "Unnamed vendor"}" is not a known vendor`);
    if (reasons.includes("VENDOR_ACCOUNT_CONFLICT")) {
      bits.push(`Account ${extracted.account_number.value ?? ""} belongs to a different vendor than "${extracted.vendor_name.value ?? ""}"`);
    }
    if (reasons.includes("NEEDS_PROPERTY_MATCH")) bits.push(propertyClause(extracted, match, property));
    const partialRead = reasons.some((r) => r === "EXTRACTION_FAILED" || r === "MISSING_FIELD" || r === "LOW_CONFIDENCE");
    const onlyProperty = reasons.every((r) => r === "NEEDS_PROPERTY_MATCH");
    const tail = onlyProperty ? "Held for a person to assign." : `${partialRead ? "Not decided on a partial read. " : ""}${heldFor(required_approver)}`;
    return `${bits.join(". ")}. ${tail}`;
  }

  if (reasons.includes("USAGE_SPIKE") || reasons.includes("AMOUNT_SPIKE") || reasons.includes("NO_BASELINE")) {
    if (reasons.includes("NO_BASELINE")) return "Fewer than two prior bills for this vendor and property. Held until there is a baseline.";
    const unit = str(spike?.data.usage_unit);
    const usage = extracted.usage_qty.value;
    const avgUsage = numOrNull(spike?.data.baseline_avg_usage);
    const usagePct = numOrNull(spike?.data.usage_variance_pct);
    const avgAmount = numOrNull(spike?.data.baseline_avg_amount);
    const amountPct = numOrNull(spike?.data.amount_variance_pct);
    const usageClause =
      usage !== null && avgUsage !== null && usagePct !== null
        ? `Usage ${formatQty(usage)} ${unit} vs ${formatQty(avgUsage)} ${unit} avg (${formatPct(usagePct)})`
        : null;
    const amountClause =
      amount !== null && avgAmount !== null && amountPct !== null
        ? `${formatUsd(amount)} vs ${formatUsd(avgAmount)} avg (${formatPct(amountPct)})`
        : null;
    const rate =
      usage && avgUsage && amount !== null && avgAmount
        ? amount / usage
        : null;
    const baseRate = usage && avgUsage && avgAmount ? avgAmount / avgUsage : null;
    const flat =
      rate !== null && baseRate !== null && baseRate !== 0 && Math.abs(rate - baseRate) / baseRate < 0.02
        ? ` Rate is flat (~${formatUsd(rate)}/${unit}): suspected leak.`
        : "";
    return `${[usageClause, amountClause].filter(Boolean).join("; ")}, threshold +${POLICY.SPIKE_THRESHOLD_PCT}%.${flat} ${heldFor(required_approver)}`;
  }

  if (reasons.includes("VENDOR_UNVERIFIED") || reasons.includes("CRS_UNAVAILABLE") || reasons.includes("OVER_AUTO_PAY_LIMIT")) {
    const bits: string[] = [];
    if (reasons.includes("VENDOR_UNVERIFIED")) bits.push("Vendor is unverified and CRS is off");
    if (reasons.includes("CRS_UNAVAILABLE")) bits.push("CRS did not return a result");
    if (reasons.includes("OVER_AUTO_PAY_LIMIT")) {
      const limit = numOrNull(checks.find((c) => c.id === "POLICY")?.data.limit);
      bits.push(`${formatUsd(amount ?? 0)} is over the ${limit === null ? "auto-pay" : formatUsd(limit)} limit`);
    }
    return `${bits.join(". ")}. ${heldFor(required_approver)}`;
  }

  if (reasons.length === 0 && rail === "UTILITY_PORTAL" && amount !== null) {
    const avg = numOrNull(spike?.data.baseline_avg_amount);
    const pct = numOrNull(spike?.data.amount_variance_pct);
    const count = num(spike?.data.baseline_count);
    const account = extracted.account_number.value ?? "";
    const variance =
      avg !== null && pct !== null ? `${formatUsd(amount)} is ${formatPct(pct)} vs the last ${count} ${vendor?.name ?? "utility"} bills (${formatUsd(avg)} avg). ` : "";
    return `Matched ${property?.name ?? "the property"} by account ${account}. ${variance}Not a duplicate. Enrolled utility: approved for payment through the utility portal.`;
  }

  if (reasons.length === 0 && rail === "ACH" && amount !== null) {
    const limit = numOrNull(checks.find((c) => c.id === "POLICY")?.data.limit);
    return `${formatUsd(amount)} is at or under the ${limit === null ? "auto-pay" : formatUsd(limit)} auto-pay limit. Not a duplicate. Approved for payment by ACH.`;
  }

  if (reasons.includes("UTILITY_NOT_ACCOUNT_MATCHED")) {
    return `${vendor?.name ?? "This utility"} is enrolled by account, but no enrolled account matched; ${property?.name ?? "the property"} was matched by ${match.method.toLowerCase().replace(/_/g, " ")}. ${heldFor(required_approver)}`;
  }

  if (reasons.length === 0) return "Cleared.";
  return `${reasons.join(", ")}. ${heldFor(required_approver)}`;
}

/** Reasons a person has to look at the read or the match itself (master-spec §5.2 priority 2). */
const INTAKE_REASONS: ReasonCode[] = [
  "EXTRACTION_FAILED",
  "MISSING_FIELD",
  "LOW_CONFIDENCE",
  "UNKNOWN_VENDOR",
  "VENDOR_ACCOUNT_CONFLICT",
  "NEEDS_PROPERTY_MATCH",
];

function propertyClause(extracted: ExtractedBill, match: MatchResult, property: Property | undefined): string {
  const address = extracted.service_address.value;
  if (!address) return "No account or service address matches a property";
  if (!property) return `"${address}" does not match any property`;
  const confidence = match.confidence.toFixed(2);
  const floor = POLICY.MIN_MATCH_CONFIDENCE.toFixed(2);
  const unit = parseAddress(address).unit;
  if (unit && property.units.length > 0 && !property.units.some((u) => u.toUpperCase() === unit.toUpperCase())) {
    return `"${address}" matches ${property.name} on street, but unit #${unit} is not on the property. Confidence capped at ${confidence} (needs ${floor})`;
  }
  const [top, next] = match.candidates;
  if (top && next && top.score - next.score <= POLICY.AMBIGUOUS_MATCH_GAP) {
    return `"${address}" could be ${top.property_name} or ${next.property_name}. Confidence ${confidence} (needs ${floor})`;
  }
  return `"${address}" best matches ${property.name} at ${confidence} (needs ${floor})`;
}

function fieldWords(value: unknown): string {
  const names = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  return names.map((n) => n.replace(/_/g, " ").replace("total amount", "total")).join(", ") || "critical fields";
}

function heldFor(role: Decision["required_approver"]): string {
  if (role === "VP_FINANCE") return "Held for VP Finance.";
  if (role === "PROPERTY_MANAGER") return "Held for Property Manager.";
  if (role === "OPERATOR") return "Held for an operator.";
  return "Held.";
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}
