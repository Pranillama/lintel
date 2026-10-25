/**
 * Turns a bill as it currently sits in Convex into the receipt story. One printed line
 * (sometimes plus one note) per audit row that has arrived, in chain order; nothing is
 * printed for a row that hasn't. Chapter items start as plain to-dos and are ticked by
 * the line that settles them. Every number is quoted from saved data. Display only.
 */
import { formatPct, formatUsd } from "@/engine/format";
import type { AuditEvent, BillView, CheckResult, DraftKind, IntakeSource } from "@/types/bill";
import { APPROVER_LABEL, CHECK_LABEL } from "../desk/contract";
import { check, num, RAIL_LABEL, storyKind, storyOf } from "../desk/story";
import { shortDate } from "../desk/ui";
import { paymentWord, row } from "../app/ticket";
import type { Mark, StoryItem, StoryLine, StoryStamp } from "./ReceiptStory";
import { footer, RULE_LINE, type StoryScript } from "./script";

export interface LiveInput {
  source: IntakeSource;
  /** When the run started (wall clock), for the ticket's date line. */
  startedAt: number;
  /** The bill as listBills currently has it; null until it is stored (after the read). */
  bill: BillView | null;
  /** The pipeline call has returned. */
  done: boolean;
  /** Stop waiting for the AI follow-up and close the ticket without it. */
  stopWaiting: boolean;
}

const TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", year: "numeric" });
const up = (s: string) => s.toUpperCase();
const time = (e: AuditEvent) => TIME.format(new Date(e.ts));
const FIELDS = ["vendor_name", "invoice_number", "account_number", "service_address", "due_date", "billing_period_start", "billing_period_end", "total_amount", "usage_qty", "usage_unit"] as const;
const MATCHED_BY: Record<BillView["match"]["method"], string> = { EXACT_ACCOUNT: "ACCOUNT", ADDRESS: "ADDRESS", HUMAN_ALIAS: "TAUGHT ADDRESS", HUMAN_ASSIGNED: "A PERSON", UNRESOLVED: "NOTHING" };
const DRAFT_WORD: Record<DraftKind, string> = { VENDOR_EMAIL: "vendor email", WORK_ORDER: "work order", APPROVAL_REQUEST: "approval request", MATCH_SUGGESTION: "property suggestion", VENDOR_ONBOARDING: "onboarding note" };
const CRS_WORD = { PASS: "PASSED", FLAGGED: "FLAGGED", UNAVAILABLE: "NO ANSWER", NOT_RUN: "NOT RUN" } as const;
const GLYPH = { PASS: "✓", EXECUTE: "✓", HALT: "!", BLOCK: "✕", INFO: "–" } as const;
const WORD = { PASS: "CLEAR", EXECUTE: "DONE", HALT: "HOLD", BLOCK: "BLOCK", INFO: "SKIP" } as const;

const markOf = (d: AuditEvent["decision"]): Mark => (d === "HALT" ? "fl" : d === "BLOCK" ? "bd" : d === "INFO" ? "sk" : "ok");
const clsOf = (d: AuditEvent["decision"]): StoryLine["cls"] => (d === "HALT" ? "hl" : d === "BLOCK" ? "bad" : d === "INFO" ? "mut" : "plain");
const approver = (b: BillView) => APPROVER_LABEL[b.decision.required_approver];

function pendingItems(source: IntakeSource): StoryItem[] {
  return [
    { id: "intake", ch: 0, label: source === "DOCUMENT" ? "Receive the PDF" : "Receive the bill" },
    { id: "read", ch: 0, label: source === "DOCUMENT" ? "Claude reads the fields" : "Check the typed fields" },
    ...(source === "DOCUMENT" ? [{ id: "conf", ch: 0 as const, label: "Confidence for each field" }] : []),
    { id: "property", ch: 1, label: "Match the property" },
    { id: "dup", ch: 1, label: "Look for duplicates" },
    { id: "usage", ch: 1, label: "Compare with past bills" },
    { id: "vendor", ch: 1, label: "Check the vendor" },
    { id: "route", ch: 1, label: "Decide where it goes" },
  ];
}

function checkOf(bill: BillView, e: AuditEvent): CheckResult | undefined {
  const id = e.data.check_id;
  return typeof id === "string" ? bill.decision.checks.find((c) => c.id === id) : undefined;
}

/** The lines (and item ticks) for one audit row. */
function eventLines(e: AuditEvent, bill: BillView, state: { explained: boolean; dupSettled: boolean; vendorSettled: boolean; items: StoryItem[] }): StoryLine[] {
  const t = time(e);
  switch (e.action) {
    case "INTAKE": {
      const doc = bill.source === "DOCUMENT";
      const label = doc ? "PDF received" : bill.source === "FEED" ? "From the bill feed" : "Typed in by a person";
      return [{ text: row(`✓ ${t} ${doc ? "PDF RECEIVED" : bill.source === "FEED" ? "BILL FROM FEED" : "BILL TYPED IN"}`, doc ? "UPLOAD" : bill.source === "FEED" ? "FEED" : "FORM"), cls: "plain", pause: 300, lcd: doc ? "RECEIVING PDF…" : "RECEIVING BILL…", item: "intake", mark: "ok", label }];
    }
    case "EXTRACT_FIELDS": {
      const read = FIELDS.filter((f) => bill.extracted[f].value !== null);
      const failed = e.decision !== "PASS" || bill.extracted.extraction_error !== null;
      if (bill.source !== "DOCUMENT") {
        return [{ text: row(`${GLYPH[e.decision]} ${t} FIELDS CHECKED`, `${read.length} FIELDS`), cls: clsOf(e.decision), lcd: "CHECKING THE FORM…", item: "read", mark: markOf(e.decision), label: `${read.length} fields typed in` }];
      }
      const lines: StoryLine[] = [{ text: row(`${failed ? "!" : "✓"} ${t} CLAUDE READ THE BILL`, failed ? "PARTLY" : `${read.length} FIELDS`), cls: failed ? "hl" : "plain", pause: 300, lcd: "CLAUDE IS READING…", item: "read", mark: failed ? "fl" : "ok", label: failed ? "Couldn't read every field" : `Read ${read.length} fields` }];
      const confs = read.map((f) => bill.extracted[f].confidence);
      if (confs.length) {
        const low = Math.min(...confs);
        lines.push({ text: row("    LOWEST CONFIDENCE", low.toFixed(2)), cls: "mut", item: "conf", mark: low < 0.85 ? "fl" : "ok", label: `Lowest confidence ${low.toFixed(2)}` });
      }
      return lines;
    }
    case "RESOLVE_VENDOR": {
      if (e.decision === "PASS") return [{ text: row(`✓ ${t} FOUND THE VENDOR`, "KNOWN"), cls: "plain", lcd: "FINDING VENDOR…" }];
      state.vendorSettled = true;
      return [{ text: row(`! ${t} VENDOR NOT IN THE FILE`, "UNKNOWN"), cls: "hl", lcd: "FINDING VENDOR…", item: "vendor", mark: "fl", label: "Unknown vendor" }];
    }
    case "RESOLVE_PROPERTY": {
      const conf = bill.match.confidence.toFixed(2);
      const ok = e.decision === "PASS";
      const lines: StoryLine[] = [{ text: row(`${ok ? "✓" : "!"} ${t} MATCHED BY ${MATCHED_BY[bill.match.method]}`, conf), cls: ok ? "plain" : "hl", pause: 250, lcd: "MATCHING PROPERTY…", item: "property", mark: ok ? "ok" : "fl", label: ok ? `Right property (${conf})` : `Property unsure (${conf})` }];
      if (bill.property_name) lines.push({ text: `    → ${up(ok ? bill.property_name : `Best guess: ${bill.property_name}`)}`.slice(0, 44), cls: "mut" });
      return lines;
    }
    case "VERIFY_VENDOR":
      state.vendorSettled = true;
      return [{ text: row(`${GLYPH[e.decision]} ${t} VENDOR IDENTITY`, CRS_WORD[bill.crs.outcome]), cls: clsOf(e.decision), lcd: "VERIFYING VENDOR…", item: "vendor", mark: markOf(e.decision), label: `Identity check: ${CRS_WORD[bill.crs.outcome].toLowerCase()}` }];
    case "CHECK": {
      const c = checkOf(bill, e);
      const id = c?.id;
      const name = id ? up(CHECK_LABEL[id]) : "RULE";
      const line: StoryLine = { text: row(`${GLYPH[e.decision]} ${t} ${name} CHECK`, WORD[e.decision]), cls: clsOf(e.decision), pause: 120, lcd: `CHECKING ${name}…`, rule: true };
      if (id === "EXACT_DUPLICATE" && e.decision === "BLOCK") { state.dupSettled = true; Object.assign(line, { item: "dup", mark: "bd", label: "Already paid" }); }
      if (id === "FUZZY_DUPLICATE" && !state.dupSettled) Object.assign(line, { item: "dup", mark: e.decision === "BLOCK" ? "bd" : "ok", label: e.decision === "BLOCK" ? "Likely duplicate" : "Not a duplicate" });
      if (id === "LINE_SUM" && e.decision === "BLOCK") { state.items.push({ id: "lines", ch: 1, label: "Line items add up" }); Object.assign(line, { item: "lines", mark: "bd", label: "Lines don't add up" }); }
      if (id === "SPIKE") {
        const usage = num(c?.data.usage_variance_pct);
        const pct = usage ?? num(c?.data.amount_variance_pct);
        const label = e.decision === "INFO" || pct === null ? "No history to compare" : `${usage !== null ? "Usage" : "Amount"} ${formatPct(pct)} vs usual`;
        Object.assign(line, { item: "usage", mark: markOf(e.decision), label });
      }
      if (id === "VENDOR_TRUST" && !state.vendorSettled) {
        const label = e.decision === "INFO" ? "Vendor check not needed" : e.decision === "PASS" ? "Known vendor" : e.decision === "BLOCK" ? "Vendor flagged" : "Vendor not verified";
        Object.assign(line, { item: "vendor", mark: markOf(e.decision), label });
      }
      const lines = [line];
      // The first failing check gets one plain note quoting the engine's numbers.
      if (!state.explained && (e.decision === "HALT" || e.decision === "BLOCK")) {
        state.explained = true;
        lines.push({ text: `    ${up(storyOf(bill).row)}`.slice(0, 44), cls: "mut" });
        const pct = num(check(bill, "SPIKE")?.data.threshold_pct);
        if (id === "SPIKE" && pct !== null) lines.push({ text: `    RULE: HOLD ABOVE +${pct}%`, cls: "mut" });
      }
      return lines;
    }
    case "DECISION": {
      const held = e.decision === "HALT", blocked = e.decision === "BLOCK";
      const right = held ? up(approver(bill)) : blocked ? "NEVER PAID" : "CLEARED";
      const label = held ? `Routed to ${approver(bill)}` : blocked ? "Blocked by rule" : "Auto-pay allowed";
      return [{ text: row(`${GLYPH[e.decision]} ${t} ${held ? "ROUTED TO" : blocked ? "BLOCKED BY RULE" : "PAYS ON ITS OWN"}`, right), cls: clsOf(e.decision), pause: 300, lcd: "APPLYING POLICY…", item: "route", mark: markOf(e.decision), label }];
    }
    case "ROUTE_PAYMENT": {
      const rail = bill.payment?.rail ?? bill.decision.rail;
      return [{ text: row(`✓ ${t} APPROVED`, rail ? up(RAIL_LABEL[rail]) : "PAYMENT"), cls: "plain", pause: 250, lcd: "ROUTING PAYMENT…", item: "pay", mark: "ok", label: "Approved for payment" }];
    }
    case "INVESTIGATION_STARTED":
      return [{ text: `· ${t} AI STARTED A FOLLOW-UP`, cls: "mut", lcd: "DRAFTING FOLLOW-UP…" }];
    case "INVESTIGATION_COMPLETED": {
      const word = bill.investigation?.draft ? DRAFT_WORD[bill.investigation.draft.kind] : "follow-up";
      return [{ text: row(`✓ ${t} AI DRAFTED ${up(word)}`, "READY"), cls: "plain", pause: 300, lcd: "DRAFTING FOLLOW-UP…", item: "draft", mark: "ok", label: `${word[0].toUpperCase()}${word.slice(1)} drafted` }];
    }
    case "INVESTIGATION_FAILED":
      return [{ text: `– ${t} FOLLOW-UP NOT DRAFTED`, cls: "mut", item: "draft", mark: "sk", label: "Follow-up not drafted" }];
    case "HUMAN_ASSIGN_PROPERTY":
      return [{ text: row(`✓ ${t} A PERSON ASSIGNED`, "PROPERTY"), cls: "plain", pause: 300, lcd: "RECORDING YOUR CALL…", item: "human", mark: "ok", label: "A person assigned the property" }];
    case "ALIAS_STORED":
      return [{ text: row(`✓ ${t} ADDRESS REMEMBERED`, "NEXT TIME"), cls: "mut" }];
    case "HUMAN_APPROVE":
      return [{ text: row(`✓ ${t} APPROVED BY`, up(approver(bill))), cls: "plain", pause: 300, lcd: "RECORDING YOUR CALL…", item: "human", mark: "ok", label: `${approver(bill)} approved` }];
    case "HUMAN_REJECT":
      return [{ text: row(`✕ ${t} REJECTED BY`, "A PERSON"), cls: "bad", pause: 300, lcd: "RECORDING YOUR CALL…", item: "human", mark: "bd", label: "A person rejected it" }];
    case "DRAFT_SENT":
      return [{ text: row(`✓ ${t} FOLLOW-UP SENT`, "LOGGED"), cls: "mut" }];
  }
}

export function stampFor(bill: BillView): StoryStamp {
  switch (bill.status) {
    case "HELD":
      return { tone: "review", word: "NEEDS REVIEW", sub: `HELD FOR ${up(approver(bill))}` };
    case "BLOCKED": {
      const kind = storyKind(bill);
      const why = kind === "duplicate" ? "DUPLICATE" : kind === "linesum" ? "LINES DON'T ADD UP" : kind === "vendor" ? "VENDOR FLAGGED" : "BLOCKED BY RULE";
      return { tone: "blocked", word: "BLOCKED", sub: `${why} · NOTHING WILL BE PAID` };
    }
    case "CLEARED":
      return { tone: "paid", word: "APPROVED", sub: bill.resolved_by === "HUMAN" ? "BY A PERSON" : "ON ITS OWN · NO HUMAN NEEDED" };
    case "REJECTED":
      return { tone: "rejected", word: "REJECTED", sub: "BY A PERSON · NOTHING PAID" };
  }
}

function questionFor(bill: BillView | null, decided: boolean): string {
  if (!bill || !decided) return "What will Lintel do with this bill?";
  const who = bill.vendor_name ? `this ${bill.vendor_name} bill` : "this bill";
  switch (bill.status) {
    case "HELD": return `Why is ${who} on hold?`;
    case "BLOCKED": return "Why won't Lintel pay this bill?";
    case "CLEARED": return bill.resolved_by === "HUMAN" ? `Who approved ${who}?` : "Why did this bill pay itself?";
    case "REJECTED": return `Why was ${who} rejected?`;
  }
}

function lcdEndFor(bill: BillView): string {
  switch (bill.status) {
    case "HELD": return `WAITING FOR ${up(approver(bill))}`;
    case "BLOCKED": return "BLOCKED · NOTHING PAID";
    case "CLEARED": return bill.resolved_by === "HUMAN" ? "APPROVED · DONE" : "DONE · NO ONE NEEDED";
    case "REJECTED": return "REJECTED · NOT PAID";
  }
}

function finalFor(bill: BillView): { label: string; mark: Mark } {
  switch (bill.status) {
    case "HELD":
      return bill.decision.reasons.includes("NEEDS_PROPERTY_MATCH")
        ? { label: "Operator picks the property", mark: "fl" }
        : { label: `${approver(bill)} approves or rejects`, mark: "fl" };
    case "BLOCKED": return { label: "No approval needed", mark: "bd" };
    case "CLEARED": return { label: bill.resolved_by === "HUMAN" ? "Paid after a person approved" : "Nothing to do — it cleared", mark: "ok" };
    case "REJECTED": return { label: "Nothing will be paid", mark: "bd" };
  }
}

export function liveScript({ source, startedAt, bill, done, stopWaiting }: LiveInput): StoryScript {
  const items = pendingItems(source);
  const lines: StoryLine[] = [
    { text: "LINTEL", cls: "logo", speed: 0 },
    { text: row(up(DAY.format(new Date(bill?.created_at ?? startedAt))), source === "DOCUMENT" ? "UPLOAD" : source === "FEED" ? "FEED" : "TYPED IN"), cls: "plain", speed: 6 },
    { text: "=".repeat(44), cls: "mut", speed: 2 },
  ];
  const events = bill ? [...bill.audit].sort((a, b) => a.seq - b.seq) : [];
  const decided = events.some((e) => e.action === "DECISION");
  // The header waits for the match so the property name on it is the final one.
  if (bill && (decided || events.some((e) => e.action === "RESOLVE_PROPERTY"))) {
    lines.push(
      { text: up(`${bill.extracted.vendor_name.value ?? "Unknown vendor"} · ${bill.property_name ?? "No property yet"}`).slice(0, 44), cls: "bold", speed: 9 },
      { text: row(up(`Invoice ${bill.extracted.invoice_number.value ?? "none"}`), up(`Due ${shortDate(bill.extracted.due_date.value)}`)), cls: "plain", speed: 7 },
      { text: RULE_LINE, cls: "mut", speed: 2 },
    );
    const state = { explained: false, dupSettled: false, vendorSettled: false, items };
    for (const e of events) lines.push(...eventLines(e, bill, state));
  }

  const followUpOpen = !!bill && decided && (bill.status === "HELD" || bill.status === "BLOCKED") && bill.investigation !== null && (bill.investigation.status === "PENDING" || bill.investigation.status === "RUNNING");
  if (bill && decided && (bill.status === "HELD" || bill.status === "BLOCKED") && bill.investigation) items.push({ id: "draft", ch: 2, label: "AI drafts a follow-up" });
  if (events.some((e) => e.action === "ROUTE_PAYMENT")) items.push({ id: "pay", ch: 2, label: "Approve for payment" });
  if (events.some((e) => e.action.startsWith("HUMAN_"))) items.push({ id: "human", ch: 2, label: "A person decides" });

  const complete = !!bill && decided && done && (!followUpOpen || stopWaiting);
  if (complete && bill) {
    const n = bill.audit.length;
    const last = events[events.length - 1];
    lines.push(...footer(
      bill.amount === null ? "NONE" : formatUsd(bill.amount),
      row("PAYMENT", paymentWord(bill)),
      bill.status === "HELD" ? "hl" : bill.status === "CLEARED" ? "plain" : "bad",
      row(`AUDIT ✓ ${n} ENTRIES`, last ? up(last.hash.slice(0, 8)) : ""),
      row,
    ));
  }

  const waiting = complete ? null
    : !bill ? (source === "DOCUMENT" ? { lcd: "CLAUDE IS READING…", item: "read" } : { lcd: "CHECKING THE FORM…", item: "read" })
    : !decided ? { lcd: "RUNNING THE RULES…" }
    : followUpOpen ? { lcd: `${bill.investigation?.provider === "CREAO" ? "AGENT" : "AI"} IS DRAFTING…`, item: "draft" }
    : { lcd: "FINISHING UP…" };

  return {
    question: questionFor(bill, decided),
    chapters: source === "DOCUMENT" ? undefined : [
      { title: source === "FEED" ? "The feed sends it" : "You type it in", sub: "The fields come straight from the form, no reading needed." },
      { title: "Code decides", sub: "Plain rules — no AI — decide if it gets paid." },
      { title: "A person owns it", sub: "Anything unusual waits for the right human." },
    ],
    items,
    lines,
    complete,
    stamp: complete && bill ? stampFor(bill) : null,
    final: complete && bill ? finalFor(bill) : null,
    lcdEnd: bill ? lcdEndFor(bill) : "DONE",
    waiting,
  };
}
