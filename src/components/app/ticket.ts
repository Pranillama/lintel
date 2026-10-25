/**
 * The bill ticket: one printed line per audit row, in chain order, plus a header
 * and a footer. Every line quotes saved data (audit rows, check data, totals the
 * engine stored); nothing here decides or computes money. Display only.
 */
import { formatUsd } from "@/engine/format";
import type { AuditDecision, AuditEvent, BillStatus, BillView } from "@/types/bill";
import { APPROVER_LABEL } from "../desk/contract";
import { num, RAIL_LABEL, storyOf } from "../desk/story";
import { shortDate } from "../desk/ui";
import { eventTitle } from "./plain";

export const TICKET_WIDTH = 44;

export type LineKind = "plain" | "mut" | "bold" | "hl" | "bad" | "big" | "logo" | "gap" | "bars";

export interface TicketLine {
  text: string;
  kind: LineKind;
  /** What the printer's display says while this line prints. */
  lcd?: string;
  /** Counts toward "n of m checks" in the decision panel. */
  check?: boolean;
}

const GLYPH: Record<AuditDecision, string> = { PASS: "✓", EXECUTE: "✓", HALT: "!", BLOCK: "✕", INFO: "·" };
const OUTCOME_WORD: Partial<Record<AuditDecision, string>> = { PASS: "CLEAR", HALT: "HOLD", BLOCK: "BLOCK" };
const TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", year: "numeric" });

/** Left text, dot leaders, right text, fitted to the paper width. */
export function row(left: string, right: string, width = TICKET_WIDTH): string {
  const room = width - right.length - 3;
  const l = left.length > room ? `${left.slice(0, Math.max(0, room - 1))}…` : left;
  return `${l} ${".".repeat(Math.max(1, width - l.length - right.length - 2))} ${right}`;
}

const up = (s: string) => s.toUpperCase();

function lcdFor(e: AuditEvent): string {
  switch (e.action) {
    case "INTAKE": return "RECEIVING BILL…";
    case "EXTRACT_FIELDS": return "CLAUDE IS READING…";
    case "RESOLVE_VENDOR": return "FINDING VENDOR…";
    case "RESOLVE_PROPERTY": return "MATCHING PROPERTY…";
    case "CHECK": return `CHECKING ${up(eventTitle(e).replace(/ check$/, ""))}…`;
    case "VERIFY_VENDOR": return "VERIFYING VENDOR…";
    case "DECISION": return "APPLYING POLICY…";
    case "ROUTE_PAYMENT": return "ROUTING PAYMENT…";
    case "INVESTIGATION_STARTED":
    case "INVESTIGATION_COMPLETED":
    case "INVESTIGATION_FAILED": return "DRAFTING FOLLOW-UP…";
    default: return "RECORDING YOUR CALL…";
  }
}

function rightFor(e: AuditEvent, bill: BillView): string {
  if (e.action === "CHECK") return OUTCOME_WORD[e.decision] ?? "SKIP";
  if (e.action === "DECISION") return statusWord(bill.status, e.decision);
  if (e.action === "INTAKE") return bill.source === "DOCUMENT" ? "UPLOAD" : bill.source === "FEED" ? "FEED" : "TYPED";
  return OUTCOME_WORD[e.decision] ?? "";
}

function statusWord(status: BillStatus, decision: AuditDecision): string {
  if (decision === "BLOCK") return "BLOCKED";
  if (decision === "HALT") return "HELD";
  return status === "CLEARED" ? "CLEARED" : "DONE";
}

export function paymentWord(bill: BillView): string {
  switch (bill.status) {
    case "HELD": return "WAITS FOR YOU";
    case "BLOCKED": return "WON'T BE PAID";
    case "REJECTED": return "NOT PAID";
    case "CLEARED": {
      const rail = bill.payment?.rail ?? bill.decision.rail;
      return rail ? `APPROVED · ${up(RAIL_LABEL[rail])}` : "APPROVED";
    }
  }
}

export function stampOf(bill: BillView): { word: string; sub: string } {
  switch (bill.status) {
    case "HELD": return { word: "NEEDS YOU", sub: `HELD FOR ${up(APPROVER_LABEL[bill.decision.required_approver])}` };
    case "BLOCKED": return { word: "BLOCKED", sub: up(storyOf(bill).row) };
    case "CLEARED": return { word: "CLEARED", sub: "APPROVED FOR PAYMENT" };
    case "REJECTED": return { word: "REJECTED", sub: "BY A PERSON" };
  }
}

export function finalLcd(bill: BillView): string {
  switch (bill.status) {
    case "HELD": return `WAITING FOR ${up(APPROVER_LABEL[bill.decision.required_approver])}`;
    case "BLOCKED": return "BLOCKED · NOT PAID";
    case "CLEARED": return "CLEARED · DONE";
    case "REJECTED": return "REJECTED · NOT PAID";
  }
}

export function billTicket(bill: BillView): TicketLine[] {
  const events = [...bill.audit].sort((a, b) => a.seq - b.seq);
  const rule = "-".repeat(TICKET_WIDTH);
  const first = events[0]?.ts ?? bill.created_at;
  const lines: TicketLine[] = [
    { text: "LINTEL", kind: "logo" },
    { text: row(up(DAY.format(new Date(first))), `${events.length} STEPS`), kind: "plain" },
    { text: "=".repeat(TICKET_WIDTH), kind: "mut" },
    { text: up(`${bill.vendor_name ?? "Unknown vendor"} · ${bill.property_name ?? "No property yet"}`).slice(0, TICKET_WIDTH), kind: "bold" },
    { text: row(up(`Invoice ${bill.extracted.invoice_number.value ?? "none"}`), up(`Due ${shortDate(bill.extracted.due_date.value)}`)), kind: "plain" },
    { text: rule, kind: "mut" },
  ];
  let explained = false;
  for (const e of events) {
    const kind: LineKind = e.decision === "HALT" ? "hl" : e.decision === "BLOCK" ? "bad" : e.decision === "INFO" ? "mut" : "plain";
    lines.push({
      text: row(`${GLYPH[e.decision]} ${TIME.format(new Date(e.ts))} ${up(eventTitle(e))}`, rightFor(e, bill)),
      kind,
      lcd: lcdFor(e),
      check: e.action === "CHECK",
    });
    // The first failing check gets one plain line saying why, quoting the engine's numbers.
    if (!explained && e.action === "CHECK" && (e.decision === "HALT" || e.decision === "BLOCK")) {
      explained = true;
      lines.push({ text: `    ${up(storyOf(bill).row)}`.slice(0, TICKET_WIDTH), kind: "mut" });
      const spike = bill.decision.checks.find((c) => c.id === "SPIKE" && c.outcome !== "PASS");
      const pct = num(spike?.data.threshold_pct);
      if (e.data.check_id === "SPIKE" && pct !== null) lines.push({ text: `    RULE: HOLD ABOVE +${pct}%`, kind: "mut" });
    }
  }
  const last = events[events.length - 1];
  lines.push(
    { text: rule, kind: "mut" },
    { text: row("AMOUNT", bill.amount === null ? "NONE" : formatUsd(bill.amount), 32), kind: "big" },
    { text: row("PAYMENT", paymentWord(bill)), kind: bill.status === "HELD" ? "hl" : bill.status === "CLEARED" ? "plain" : "bad" },
    { text: "", kind: "gap" },
    { text: rule, kind: "mut" },
    { text: row(`AUDIT ✓ ${events.length} ENTRIES`, last ? up(last.hash.slice(0, 8)) : ""), kind: "plain", lcd: "SEALING AUDIT LOG…" },
    { text: "", kind: "bars" },
  );
  return lines;
}
