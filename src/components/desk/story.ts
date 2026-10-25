/**
 * Display copy for a bill, picked from what the engine already decided.
 * Nothing here decides a status or computes money: it chooses which engine
 * number to quote and phrases it for a person.
 */
import { formatPct, formatUsd } from "@/engine/format";
import { POLICY } from "@/seed/policy";
import type { BillView, CheckId, CheckResult, PaymentRail } from "@/types/bill";
import { APPROVER_LABEL, REASON_LABEL } from "./contract";

export type StoryKind =
  | "spike"
  | "duplicate"
  | "property"
  | "vendor"
  | "linesum"
  | "unread"
  | "policy"
  | "learned"
  | "cleared"
  | "rejected"
  | "other";

export interface Story {
  kind: StoryKind;
  /** The verdict in a few words, 24px. */
  headline: string;
  /** What happens next and who owns it. One line. */
  next: string;
  /** Short reason for a list row (fits ~30 characters). */
  row: string;
}

export const RAIL_LABEL: Record<PaymentRail, string> = {
  UTILITY_PORTAL: "Utility portal",
  ACH: "ACH",
  CHECK: "Check",
  X402_USDC: "x402 USDC",
};

export function check(bill: BillView, id: CheckId): CheckResult | undefined {
  return bill.decision.checks.find((c) => c.id === id);
}

export function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

function railText(bill: BillView): string {
  const rail = bill.payment?.rail ?? bill.decision.rail;
  return rail ? RAIL_LABEL[rail] : "Payment";
}

export function storyKind(bill: BillView): StoryKind {
  const r = bill.decision.reasons;
  if (bill.status === "REJECTED") return "rejected";
  if (bill.status === "CLEARED") {
    return bill.match.method === "HUMAN_ALIAS" || bill.match.method === "HUMAN_ASSIGNED" ? "learned" : "cleared";
  }
  if (r.includes("EXACT_DUPLICATE") || r.includes("FUZZY_DUPLICATE")) return "duplicate";
  if (r.includes("LINE_SUM_MISMATCH")) return "linesum";
  if (r.includes("CRS_FLAGGED")) return "vendor";
  if (r.includes("EXTRACTION_FAILED") || r.includes("MISSING_FIELD") || r.includes("LOW_CONFIDENCE")) return "unread";
  if (r.includes("NEEDS_PROPERTY_MATCH")) return "property";
  if (r.includes("USAGE_SPIKE") || r.includes("AMOUNT_SPIKE")) return "spike";
  if (r.includes("VENDOR_UNVERIFIED") || r.includes("CRS_UNAVAILABLE")) return "vendor";
  if (r.includes("OVER_AUTO_PAY_LIMIT") || r.includes("UTILITY_NOT_ACCOUNT_MATCHED")) return "policy";
  return "other";
}

function heldNext(bill: BillView): string {
  return `Waiting on ${APPROVER_LABEL[bill.decision.required_approver]} to approve or reject.`;
}

export function storyOf(bill: BillView): Story {
  const kind = storyKind(bill);
  const vendor = bill.vendor_name ?? "This vendor";
  switch (kind) {
    case "spike": {
      const d = check(bill, "SPIKE")?.data ?? {};
      const usage = num(d.usage_variance_pct);
      const amount = num(d.amount_variance_pct);
      const pct = usage ?? amount;
      const what = usage !== null ? "Usage" : "Amount";
      return {
        kind,
        headline: pct !== null ? `${what} is ${formatPct(pct)} over its usual` : "Bigger than usual",
        next: heldNext(bill),
        row: pct !== null ? `${what} spike ${formatPct(pct)}` : "Spike",
      };
    }
    case "duplicate": {
      const exact = check(bill, "EXACT_DUPLICATE");
      const fuzzy = check(bill, "FUZZY_DUPLICATE");
      if (exact?.outcome === "BLOCK") {
        const inv = str(exact.data.matched_invoice) ?? "this invoice";
        return { kind, headline: `Invoice ${inv} was already paid`, next: "Duplicates are never paid. No one needs to approve.", row: `Already paid as ${inv}` };
      }
      const inv = str(fuzzy?.data.prior_invoice) ?? "a prior bill";
      return { kind, headline: `Looks like ${inv}, already paid`, next: "Duplicates are never paid. No one needs to approve.", row: `Likely duplicate of ${inv}` };
    }
    case "property": {
      return {
        kind,
        headline: "Which property is this for?",
        next: "Assign it once. Lintel remembers the address for next time.",
        row: "Needs a property",
      };
    }
    case "vendor": {
      if (bill.decision.reasons.includes("CRS_FLAGGED")) {
        return { kind, headline: "Background check flagged this vendor", next: "Flagged vendors are never paid. No one needs to approve.", row: "Vendor flagged" };
      }
      return { kind, headline: `${vendor} is not verified yet`, next: heldNext(bill), row: "New vendor, not verified" };
    }
    case "linesum": {
      const d = check(bill, "LINE_SUM")?.data ?? {};
      const sum = num(d.line_sum);
      const total = num(d.total);
      return {
        kind,
        headline: sum !== null && total !== null ? `Lines add up to ${formatUsd(sum)}, not ${formatUsd(total)}` : "Lines don't add up",
        next: "Bills that don't add up are never paid.",
        row: "Lines don't add up",
      };
    }
    case "unread":
      return {
        kind,
        headline: bill.decision.reasons.includes("EXTRACTION_FAILED") ? "Lintel couldn't read this document" : "Some fields are missing or unsure",
        next: "It won't decide money on a partial read. Type the bill instead.",
        row: REASON_LABEL[bill.decision.reasons[0] ?? "MISSING_FIELD"],
      };
    case "policy": {
      const limit = num(check(bill, "POLICY")?.data.limit);
      return {
        kind,
        headline: limit !== null ? `Over the ${formatUsd(limit)} auto-pay limit` : REASON_LABEL[bill.decision.reasons[0] ?? "OVER_AUTO_PAY_LIMIT"],
        next: heldNext(bill),
        row: "Over auto-pay limit",
      };
    }
    case "learned":
      return bill.match.method === "HUMAN_ALIAS"
        ? { kind, headline: "Matched by an address a person taught", next: `${railText(bill)}, simulated. No human touch this time.`, row: "Learned address" }
        : { kind, headline: "You taught Lintel this address", next: `${railText(bill)}, simulated. The next bill from here matches on its own.`, row: "Assigned by you" };
    case "cleared": {
      const amountPct = num(check(bill, "SPIKE")?.data.amount_variance_pct);
      const limit = num(check(bill, "POLICY")?.data.limit);
      const human = bill.resolved_by === "HUMAN";
      return {
        kind,
        headline: human ? "Approved by a person" : "Paid on its own",
        next: `${railText(bill)}, simulated.${human ? "" : " No one needed to touch it."}`,
        row: human
          ? "Approved by you"
          : amountPct !== null && check(bill, "SPIKE")?.outcome === "PASS"
            ? `${formatPct(amountPct)} vs usual`
            : limit !== null
              ? `Under ${formatUsd(limit)} limit`
              : "Scheduled",
      };
    }
    case "rejected":
      return { kind, headline: "Rejected by a person", next: "Nothing will be paid.", row: "Rejected" };
    case "other":
      return {
        kind,
        headline: REASON_LABEL[bill.decision.reasons[0] ?? "MISSING_FIELD"],
        next: bill.status === "HELD" ? heldNext(bill) : "Nothing will be paid.",
        row: REASON_LABEL[bill.decision.reasons[0] ?? "MISSING_FIELD"],
      };
  }
}

/** "8 checks · 1 failed: Spike" counts for the collapsed footer. Display grouping only. */
export function failedChecks(bill: BillView): CheckResult[] {
  return bill.decision.checks.filter((c) => c.outcome === "HALT" || c.outcome === "BLOCK");
}

export const MATCH_NEEDS = POLICY.MIN_MATCH_CONFIDENCE;

/** Splits a printed address so a trailing unit (#B, Unit 4) can be marked. Display only. */
export function splitUnit(address: string): [string, string | null] {
  const m = address.match(/^(.*?)[\s,]*((?:#|\b(?:unit|apt|ste|suite)\s*#?)\s*[\w-]+)\s*$/i);
  return m ? [m[1], m[2]] : [address, null];
}
