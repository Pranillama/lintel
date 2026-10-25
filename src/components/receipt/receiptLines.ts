import { formatUsd } from "@/engine/format";
import { SEATS_LINE } from "@/seed/policy";
import type { ApproverRole, BillStatus, BillView, BillsResponse, ReasonCode } from "@/types/bill";
import { storyKind, storyOf } from "../desk/story";

/**
 * Turns a listBills response into the lines the receipt printer prints.
 * Pure and deterministic: no money math, no status decisions. Amounts, statuses,
 * totals and the audit flag come straight from the response; the UI only counts and formats.
 */

export type ReceiptLine =
  | { kind: "logo" }
  | { kind: "text"; text: string; tone?: "ink" | "muted"; size?: "sm" | "md"; bold?: boolean }
  | { kind: "rule"; char: "=" | "-" }
  | { kind: "gap"; lines: number }
  | { kind: "head"; text: string }
  | { kind: "row"; left: string; right: string; bold?: boolean; tone?: "ink" | "muted"; highlight?: boolean; strike?: boolean }
  | { kind: "big"; value: string; caption: string }
  | { kind: "barcode"; code: string };

/** Characters that fit on one 80 mm line at the printer's font size. */
export const LINE_CHARS = 48;

const STATUS_LABEL: Record<BillStatus, string> = {
  CLEARED: "CLEARED",
  HELD: "NEEDS YOU",
  BLOCKED: "BLOCKED",
  REJECTED: "REJECTED",
};

const APPROVER_LABEL: Record<ApproverRole, string> = {
  NONE: "NONE",
  OPERATOR: "OPERATOR",
  PROPERTY_MANAGER: "PROPERTY MANAGER",
  VP_FINANCE: "VP FINANCE",
};

const DUPLICATE_REASONS: ReasonCode[] = ["EXACT_DUPLICATE", "FUZZY_DUPLICATE"];
const SPIKE_REASONS: ReasonCode[] = ["USAGE_SPIKE", "AMOUNT_SPIKE"];
/** Audit actions that move money or set a bill's fate. An AI actor must never appear on these. */
const MONEY_ACTIONS = new Set(["DECISION", "ROUTE_PAYMENT", "HUMAN_APPROVE", "HUMAN_REJECT"]);

const words = (code: string) => code.replace(/_/g, " ");

/** Fits `left` beside `right` on one receipt line, trimming the left side with an ellipsis. */
export function fitRow(left: string, right: string, width = LINE_CHARS): string {
  const room = width - right.length - 2;
  if (left.length <= room) return left;
  return `${left.slice(0, Math.max(0, room - 1)).trimEnd()}…`;
}

function row(left: string, right: string, extra: Omit<Extract<ReceiptLine, { kind: "row" }>, "kind" | "left" | "right"> = {}): ReceiptLine {
  return { kind: "row", left: fitRow(left, right), right, ...extra };
}

function money(n: number | null): string {
  return n === null ? "—" : formatUsd(n);
}

function stamp(iso: string | undefined): { date: string; time: string } {
  if (!iso) return { date: "—", time: "—" };
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "2-digit", day: "2-digit", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return { date, time };
}

function detail(bill: BillView): string {
  const reasons = bill.decision.reasons;
  switch (bill.status) {
    case "CLEARED": {
      const live = bill.payment?.mode === "LIVE_TESTNET" ? bill.payment : null;
      const rail = live ? `${words(live.rail)} · TESTNET` : bill.decision.rail ? `${words(bill.decision.rail)} · APPROVED` : "APPROVED";
      return bill.resolved_by === "HUMAN" ? `${rail} · BY HUMAN` : rail;
    }
    case "BLOCKED": {
      return storyKind(bill) === "duplicate" ? storyOf(bill).row.toUpperCase() : reasons[0] ? words(reasons[0]) : "BLOCKED";
    }
    case "HELD":
      return reasons.slice(0, 2).map(words).join(" · ") || "HELD";
    case "REJECTED":
      return "REJECTED BY A PERSON";
  }
}

function billLines(bill: BillView): ReceiptLine[] {
  const held = bill.status === "HELD";
  const name = `${bill.vendor_name ?? "UNKNOWN VENDOR"} · ${bill.property_name ?? "UNMATCHED"}`.toUpperCase();
  const lines: ReceiptLine[] = [
    row(name, money(bill.amount), { bold: true, highlight: held, strike: bill.status === "BLOCKED" }),
    row(`  ${detail(bill)}`, STATUS_LABEL[bill.status], { tone: held ? "ink" : "muted", highlight: held }),
  ];
  if (held && bill.decision.required_approver !== "NONE") {
    lines.push(row("  HELD FOR", APPROVER_LABEL[bill.decision.required_approver], { tone: "muted" }));
  }
  return lines;
}

function has(bill: BillView, codes: ReasonCode[]): boolean {
  return bill.decision.reasons.some((r) => codes.includes(r));
}

export interface ReceiptStats {
  billsRead: number;
  checksRun: number;
  duplicatesCaught: number;
  spikesFlagged: number;
  addressesToTeach: number;
  addressesLearned: number;
  duplicatesPaid: number;
  aiMoneyDecisions: number;
}

export function receiptStats(bills: BillView[]): ReceiptStats {
  return {
    billsRead: bills.length,
    checksRun: bills.reduce((n, b) => n + b.decision.checks.length, 0),
    duplicatesCaught: bills.filter((b) => has(b, DUPLICATE_REASONS)).length,
    spikesFlagged: bills.filter((b) => has(b, SPIKE_REASONS)).length,
    addressesToTeach: bills.filter((b) => b.status === "HELD" && has(b, ["NEEDS_PROPERTY_MATCH"])).length,
    addressesLearned: bills.filter((b) => b.match.method === "HUMAN_ASSIGNED" || b.match.method === "HUMAN_ALIAS").length,
    duplicatesPaid: bills.filter((b) => has(b, DUPLICATE_REASONS) && b.payment !== null).length,
    aiMoneyDecisions: bills.reduce(
      (n, b) => n + b.audit.filter((e) => e.actor.startsWith("AI_") && MONEY_ACTIONS.has(e.action)).length,
      0,
    ),
  };
}

export function buildReceiptLines(response: BillsResponse): ReceiptLine[] {
  const bills = [...response.bills].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const { totals } = response;
  const first = stamp(bills[0]?.created_at);
  const feedLabel = bills.find((b) => b.source === "FEED")?.source_label;
  const intake = (feedLabel ?? "Live desk").toUpperCase();

  const lines: ReceiptLine[] = [
    { kind: "logo" },
    { kind: "text", text: `AP DESK · ${intake}`, tone: "muted", size: "sm" },
    { kind: "gap", lines: 1 },
    { kind: "rule", char: "=" },
    row(`DATE ${first.date}`, `TIME ${first.time}`),
    row("TABLE  PROPERTY AP", "SERVER  LINTEL"),
    { kind: "rule", char: "=" },
  ];

  if (bills.length === 0) {
    lines.push(
      { kind: "gap", lines: 1 },
      { kind: "text", text: "NO BILLS ON THIS TAB YET", bold: true },
      { kind: "text", text: "PRESS REPLAY OR TEST A BILL", tone: "muted", size: "sm" },
      { kind: "gap", lines: 2 },
    );
    return lines;
  }

  lines.push({ kind: "head", text: `BILLS IN · ${bills.length}` });
  bills.forEach((bill, i) => {
    if (i > 0) lines.push({ kind: "gap", lines: 0.5 });
    lines.push(...billLines(bill));
  });

  const s = receiptStats(bills);
  lines.push(
    { kind: "rule", char: "-" },
    { kind: "head", text: "WHAT THE DESK DID" },
    row("BILLS READ", String(s.billsRead)),
    row("CHECKS RUN", String(s.checksRun)),
    row("DUPLICATES CAUGHT", String(s.duplicatesCaught)),
    row("USAGE SPIKES FLAGGED", String(s.spikesFlagged)),
    row("ADDRESSES TO TEACH", String(s.addressesToTeach)),
  );
  if (s.addressesLearned > 0) lines.push(row("ADDRESSES LEARNED", String(s.addressesLearned)));
  lines.push(
    row("DUPLICATES PAID", String(s.duplicatesPaid)),
    { kind: "gap", lines: 1 },
    { kind: "big", value: String(s.aiMoneyDecisions), caption: "AI DECISIONS ON MONEY" },
    { kind: "rule", char: "-" },
    row(`BLOCKED · ${totals.count.blocked}`, formatUsd(totals.blocked), { bold: true, strike: totals.blocked > 0 }),
    row(`NEEDS YOU · ${totals.count.held}`, formatUsd(totals.held), { bold: true, highlight: totals.held > 0 }),
    row(`CLEARED · ${totals.count.cleared}`, formatUsd(totals.cleared), { bold: true }),
  );
  if (totals.count.rejected > 0) lines.push(row("REJECTED", String(totals.count.rejected), { tone: "muted" }));

  lines.push(
    { kind: "rule", char: "=" },
    { kind: "gap", lines: 0.6 },
    row("TWO DAYS A MONTH", "GIVEN BACK"),
    row("DUPLICATES", s.duplicatesPaid === 0 ? "NEVER PAID" : "REVIEW"),
    row("EXCEPTIONS", "OWNED BY PEOPLE"),
    row("PAYING BILLS", "SOLVED", { bold: true }),
    { kind: "gap", lines: 0.6 },
    { kind: "rule", char: "=" },
    { kind: "text", text: "AI READS · CODE DECIDES · HUMAN OWNS", bold: true },
    { kind: "text", text: SEATS_LINE.toUpperCase(), tone: "muted", size: "sm" },
    { kind: "gap", lines: 0.5 },
    { kind: "text", text: response.audit_chain_intact ? "AUDIT CHAIN ✓ INTACT · SHA-256" : "AUDIT CHAIN ✗ BROKEN", size: "sm", bold: !response.audit_chain_intact },
  );
  const hashes = bills
    .map((b) => b.audit[b.audit.length - 1]?.hash.slice(0, 8))
    .filter((h): h is string => Boolean(h))
    .slice(0, 4);
  if (hashes.length) lines.push({ kind: "text", text: hashes.join(" · "), tone: "muted", size: "sm" });
  lines.push(
    { kind: "gap", lines: 0.5 },
    { kind: "barcode", code: `LNTL ${first.date.replace(/\//g, "")} ${String(bills.length).padStart(4, "0")}` },
    { kind: "gap", lines: 0.4 },
    { kind: "text", text: "THANK YOU FOR CLOSING OUT", bold: true },
    { kind: "gap", lines: 2 },
  );
  return lines;
}

/** Text of the most recent section header at or before `index`, for the HUD caption. */
export function sectionAt(lines: ReceiptLine[], index: number): string | null {
  for (let i = Math.min(index, lines.length - 1); i >= 0; i--) {
    const line = lines[i];
    if (line.kind === "head") return line.text;
  }
  return null;
}
