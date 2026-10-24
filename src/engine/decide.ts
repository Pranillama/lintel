/**
 * AI must not decide duplicates, variance, limits, status, approver, rail,
 * payment, the property match, vendor creation, or audit hashes.
 * master-spec §4. This function is the only place a status is chosen.
 */
import { POLICY } from "@/seed/policy";
import type { ApproverRole, CheckId, CheckResult, DecideFn, PaymentRail, ReasonCode } from "@/types/bill";
import {
  checkExactDuplicate,
  checkExtraction,
  checkFuzzyDuplicate,
  checkLineSum,
  checkMatch,
  checkPolicy,
  checkSpike,
  checkVendorTrust,
  type CheckContext,
} from "./checks";
import { explain } from "./explain";

const PRIORITY: ReasonCode[][] = [
  ["EXACT_DUPLICATE", "FUZZY_DUPLICATE", "LINE_SUM_MISMATCH", "CRS_FLAGGED"],
  ["MISSING_FIELD", "LOW_CONFIDENCE", "EXTRACTION_FAILED", "NEEDS_PROPERTY_MATCH", "UNKNOWN_VENDOR", "VENDOR_ACCOUNT_CONFLICT"],
  ["USAGE_SPIKE", "AMOUNT_SPIKE", "NO_BASELINE"],
  ["VENDOR_UNVERIFIED", "CRS_UNAVAILABLE"],
  ["OVER_AUTO_PAY_LIMIT", "UTILITY_NOT_ACCOUNT_MATCHED"],
];

export const PRIORITY_2: readonly ReasonCode[] = PRIORITY[1];

const CHECKS: Array<(ctx: CheckContext) => CheckResult> = [
  checkExtraction,
  checkMatch,
  checkExactDuplicate,
  checkFuzzyDuplicate,
  checkLineSum,
  checkSpike,
  checkVendorTrust,
  checkPolicy,
];

export const decide: DecideFn = (input) => {
  const ctx: CheckContext = input;
  const checks = CHECKS.map((fn) => fn(ctx));
  const reasons = checks.flatMap((c) => c.reasons);
  const group = PRIORITY.findIndex((bucket) => bucket.some((code) => reasons.includes(code)));
  const amount = input.extracted.total_amount.value ?? 0;
  const status = group === 0 ? "BLOCKED" : group === -1 ? "CLEARED" : "HELD";
  const required_approver = approver(group, reasons, amount);
  const rail = status === "CLEARED" ? railOf(checks) : null;
  const duplicate_of = duplicateOf(checks);
  const why = explain({
    reasons,
    required_approver,
    checks,
    extracted: input.extracted,
    match: input.match,
    ledger: input.ledger,
    rail,
  });
  return { status, reasons, required_approver, checks, duplicate_of, why, rail };
};

function approver(group: number, reasons: ReasonCode[], amount: number): ApproverRole {
  if (group === 0 || group === -1) return "NONE";
  if (group === 1) return "OPERATOR";
  if (group === 3) return "PROPERTY_MANAGER";
  if (group === 4 && reasons.includes("UTILITY_NOT_ACCOUNT_MATCHED")) return "OPERATOR";
  return amount > POLICY.VP_FINANCE_ABOVE_USD ? "VP_FINANCE" : "PROPERTY_MANAGER";
}

function railOf(checks: CheckResult[]): PaymentRail | null {
  const rail = checks.find((c) => c.id === "POLICY")?.data.rail;
  if (rail === "UTILITY_PORTAL" || rail === "ACH" || rail === "CHECK" || rail === "X402_USDC") return rail;
  return null;
}

function duplicateOf(checks: CheckResult[]): string | null {
  const exact = checks.find((c) => c.id === "EXACT_DUPLICATE");
  const fuzzy = checks.find((c) => c.id === "FUZZY_DUPLICATE");
  const candidates = [exact, fuzzy]
    .filter((c): c is CheckResult => c !== undefined && c.outcome === "BLOCK")
    .map((c) => ({
      id: typeof c.data.matched_id === "string" ? c.data.matched_id : typeof c.data.prior_id === "string" ? c.data.prior_id : "",
      rank: asRank(c.data.rank),
      days: typeof c.data.days_apart === "number" ? c.data.days_apart : 0,
      order: c.id === "EXACT_DUPLICATE" ? 0 : 1,
    }))
    .filter((c) => c.id !== "");
  candidates.sort((a, b) => {
    const byRank = rankScore(a.rank) - rankScore(b.rank);
    if (byRank !== 0) return byRank;
    if (a.days !== b.days) return a.days - b.days;
    return a.order - b.order;
  });
  return candidates[0]?.id ?? null;
}

function asRank(value: CheckResult["data"][string]): "PAID" | "CLEARED" | "HELD" {
  if (value === "PAID" || value === "CLEARED" || value === "HELD") return value;
  return "HELD";
}

function rankScore(value: "PAID" | "CLEARED" | "HELD"): number {
  if (value === "PAID") return 0;
  if (value === "CLEARED") return 1;
  return 2;
}

export const CHECK_ORDER: CheckId[] = [
  "EXTRACTION",
  "MATCH",
  "EXACT_DUPLICATE",
  "FUZZY_DUPLICATE",
  "LINE_SUM",
  "SPIKE",
  "VENDOR_TRUST",
  "POLICY",
];
