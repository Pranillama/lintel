/**
 * Scripted sample bills for the home page demo, from the Variation C mockup.
 * Hand-written copy, not data: the home page labels it as a sample.
 */
import { row } from "../app/ticket";
import type { Mark, StoryItem, StoryLine } from "./ReceiptStory";
import { footer, RULE_LINE, type StoryScript } from "./script";

export type DemoEnding = "review" | "blocked" | "paid";

type Step = [text: string, cls: StoryLine["cls"], o?: { pause?: number; lcd?: string; ch?: 0 | 1 | 2; li?: string; mark?: Mark }];

interface Demo {
  question: string;
  head: [string, string];
  steps: Step[];
  amount: string;
  pay: string;
  payCls: StoryLine["cls"];
  audit: string;
  stamp: NonNullable<StoryScript["stamp"]>;
  lcdEnd: string;
  final: NonNullable<StoryScript["final"]>;
  who: string;
}

const DEMOS: Record<DemoEnding, Demo> = {
  review: {
    question: "Why is this water bill on hold?",
    head: ["EBMUD · SHATTUCK STUDENT LIVING", row("INVOICE EB-4471-2611", "DUE NOV 10")],
    steps: [
      [row("✓ 10:42:01 PDF RECEIVED", "1 PAGE"), "plain", { pause: 300, lcd: "RECEIVING PDF…", ch: 0, li: "PDF received", mark: "ok" }],
      [row("✓ 10:42:04 CLAUDE READ THE BILL", "7 FIELDS"), "plain", { pause: 1100, lcd: "CLAUDE IS READING…", ch: 0, li: "Read 7 fields", mark: "ok" }],
      [row("    LOWEST CONFIDENCE", "0.91"), "mut", { ch: 0, li: "Lowest confidence 0.91", mark: "ok" }],
      [row("✓ 10:42:04 MATCHED BY ACCOUNT", "1.00"), "plain", { pause: 450, lcd: "MATCHING PROPERTY…", ch: 1, li: "Right property (1.00)", mark: "ok" }],
      ["    → SHATTUCK STUDENT LIVING", "mut"],
      [row("✓ 10:42:05 DUPLICATE CHECK", "CLEAR"), "plain", { pause: 400, lcd: "CHECKING DUPLICATES…", ch: 1, li: "Not a duplicate", mark: "ok" }],
      [row("! 10:42:05 USAGE 160 VS 42 CCF", "+281.0%"), "hl", { pause: 650, lcd: "COMPARING HISTORY…", ch: 1, li: "Usage +281.0%", mark: "fl" }],
      ["    RULE: HOLD ABOVE +25%", "mut"],
      [row("– 10:42:05 VENDOR CHECK", "NOT NEEDED"), "mut", { pause: 200, lcd: "VENDOR CHECK…", ch: 1, li: "Vendor check not needed", mark: "sk" }],
      [row("! 10:42:06 ROUTED TO", "VP FINANCE"), "hl", { pause: 400, lcd: "APPLYING POLICY…", ch: 1, li: "Routed to VP Finance", mark: "fl" }],
      [row("✓ 10:42:09 AI DRAFTED WORK ORDER", "READY"), "plain", { pause: 900, lcd: "DRAFTING FOLLOW-UP…", ch: 2, li: "Work order drafted", mark: "ok" }],
    ],
    amount: "$5,680.00", pay: row("PAYMENT", "WAITS FOR YOU"), payCls: "hl",
    audit: row("AUDIT ✓ 15 ENTRIES", "3F9A1C7E"),
    stamp: { tone: "review", word: "NEEDS REVIEW", sub: "HELD FOR VP FINANCE" }, lcdEnd: "WAITING FOR VP FINANCE",
    final: { mark: "fl", label: "VP Finance approves or rejects" },
    who: "Waiting on VP Finance to approve or reject",
  },
  blocked: {
    question: "Why won't Lintel pay this bill?",
    head: ["RECOLOGY · SHATTUCK STUDENT LIVING", row("INVOICE RW-10021", "DUE OCT 25")],
    steps: [
      [row("✓ 10:47:12 PDF RECEIVED", "1 PAGE"), "plain", { pause: 300, lcd: "RECEIVING PDF…", ch: 0, li: "PDF received", mark: "ok" }],
      [row("✓ 10:47:14 CLAUDE READ THE BILL", "7 FIELDS"), "plain", { pause: 1100, lcd: "CLAUDE IS READING…", ch: 0, li: "Read 7 fields", mark: "ok" }],
      [row("    LOWEST CONFIDENCE", "0.93"), "mut", { ch: 0, li: "Lowest confidence 0.93", mark: "ok" }],
      [row("✓ 10:47:15 MATCHED BY ACCOUNT", "1.00"), "plain", { pause: 450, lcd: "MATCHING PROPERTY…", ch: 1, li: "Right property (1.00)", mark: "ok" }],
      ["    → SHATTUCK STUDENT LIVING", "mut"],
      [row("✕ 10:47:16 LOOKS LIKE RW-99201", "DUPLICATE"), "bad", { pause: 650, lcd: "CHECKING DUPLICATES…", ch: 1, li: "Likely duplicate", mark: "bd" }],
      ["    $686 VS $680 PAID · 0.9% · 5 DAYS", "mut"],
      [row("✓ 10:47:16 USAGE & COST", "NORMAL"), "plain", { pause: 300, lcd: "COMPARING HISTORY…", ch: 1, li: "Usage normal", mark: "ok" }],
      [row("– 10:47:16 VENDOR CHECK", "NOT NEEDED"), "mut", { pause: 200, lcd: "VENDOR CHECK…", ch: 1, li: "Vendor check not needed", mark: "sk" }],
      [row("✕ 10:47:17 DUPLICATES", "NEVER PAID"), "bad", { pause: 400, lcd: "APPLYING POLICY…", ch: 1, li: "Blocked by rule", mark: "bd" }],
      [row("✓ 10:47:18 AI DRAFTED VENDOR EMAIL", "READY"), "plain", { pause: 800, lcd: "DRAFTING FOLLOW-UP…", ch: 2, li: "Vendor email drafted", mark: "ok" }],
    ],
    amount: "$686.00", pay: row("PAYMENT", "NOT PAID"), payCls: "bad",
    audit: row("AUDIT ✓ 12 ENTRIES", "7C41E09A"),
    stamp: { tone: "blocked", word: "BLOCKED", sub: "DUPLICATE · NOTHING WILL BE PAID" }, lcdEnd: "BLOCKED · NOTHING PAID",
    final: { mark: "bd", label: "No approval needed" },
    who: "Duplicates are never paid. Lintel drafted an email to Recology.",
  },
  paid: {
    question: "Why did this bill pay itself?",
    head: ["PG&E · BAYVIEW COMMONS", row("INVOICE PGE-1108-4491", "DUE NOV 08")],
    steps: [
      [row("✓ 10:41:12 PDF RECEIVED", "1 PAGE"), "plain", { pause: 300, lcd: "RECEIVING PDF…", ch: 0, li: "PDF received", mark: "ok" }],
      [row("✓ 10:41:15 CLAUDE READ THE BILL", "7 FIELDS"), "plain", { pause: 1100, lcd: "CLAUDE IS READING…", ch: 0, li: "Read 7 fields", mark: "ok" }],
      [row("    LOWEST CONFIDENCE", "0.96"), "mut", { ch: 0, li: "Lowest confidence 0.96", mark: "ok" }],
      [row("✓ 10:41:15 MATCHED BY ACCOUNT", "1.00"), "plain", { pause: 450, lcd: "MATCHING PROPERTY…", ch: 1, li: "Right property (1.00)", mark: "ok" }],
      ["    → BAYVIEW COMMONS", "mut"],
      [row("✓ 10:41:16 DUPLICATE CHECK", "CLEAR"), "plain", { pause: 400, lcd: "CHECKING DUPLICATES…", ch: 1, li: "Not a duplicate", mark: "ok" }],
      [row("✓ 10:41:16 $2,290 VS $2,340 AVG", "−2.1%"), "plain", { pause: 650, lcd: "COMPARING HISTORY…", ch: 1, li: "−2.1% vs usual", mark: "ok" }],
      ["    RULE: HOLD ABOVE +25%", "mut"],
      [row("– 10:41:16 VENDOR CHECK", "NOT NEEDED"), "mut", { pause: 200, lcd: "VENDOR CHECK…", ch: 1, li: "Vendor check not needed", mark: "sk" }],
      [row("✓ 10:41:16 ENROLLED UTILITY", "AUTO-PAY"), "plain", { pause: 400, lcd: "APPLYING POLICY…", ch: 1, li: "Auto-pay allowed", mark: "ok" }],
      [row("✓ 10:41:17 APPROVED", "UTILITY PORTAL"), "plain", { pause: 500, lcd: "ROUTING PAYMENT…", ch: 2, li: "Approved for payment", mark: "ok" }],
    ],
    amount: "$2,290.40", pay: row("PAYMENT", "APPROVED · UTILITY PORTAL"), payCls: "plain",
    audit: row("AUDIT ✓ 11 ENTRIES", "A41C77D2"),
    stamp: { tone: "paid", word: "APPROVED", sub: "ON ITS OWN · NO HUMAN NEEDED" }, lcdEnd: "DONE · NO ONE NEEDED",
    final: { mark: "ok", label: "Nothing to do — it cleared" },
    who: "No one needed to touch it",
  },
};

export function demoScript(ending: DemoEnding): StoryScript & { who: string } {
  const d = DEMOS[ending];
  const items: StoryItem[] = [];
  const steps: StoryLine[] = d.steps.map(([text, cls, o = {}], i) => {
    const id = o.li ? `s${i}` : undefined;
    if (id && o.ch !== undefined) items.push({ id, ch: o.ch, label: o.li! });
    return { text, cls, pause: o.pause, lcd: o.lcd, item: id, mark: o.mark, rule: o.ch === 1 };
  });
  return {
    question: d.question,
    items,
    lines: [
      { text: "LINTEL", cls: "logo", speed: 0 },
      { text: row("SAT OCT 24 2026", "SAMPLE TICKET"), cls: "plain", speed: 6 },
      { text: "=".repeat(44), cls: "mut", speed: 2 },
      { text: d.head[0], cls: "bold", speed: 9 },
      { text: d.head[1], cls: "plain", speed: 7 },
      { text: RULE_LINE, cls: "mut", speed: 2 },
      ...steps,
      ...footer(d.amount, d.pay, d.payCls, d.audit, row),
    ],
    complete: true,
    stamp: d.stamp,
    final: d.final,
    lcdEnd: d.lcdEnd,
    who: d.who,
  };
}
