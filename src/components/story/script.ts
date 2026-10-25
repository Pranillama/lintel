import type { ReceiptStoryProps, StoryLine } from "./ReceiptStory";

/** Everything the story needs except the surrounding controls. */
export type StoryScript = Pick<ReceiptStoryProps, "question" | "chapters" | "items" | "lines" | "complete" | "stamp" | "final" | "lcdEnd" | "waiting">;

export const RULE_LINE = "-".repeat(44);

/** The ticket's closing block, with the mockup's pacing: amount, payment, gap for the stamp, audit seal, barcode. */
export function footer(amount: string, pay: string, payCls: StoryLine["cls"], audit: string, row: (l: string, r: string, w?: number) => string): StoryLine[] {
  return [
    { text: RULE_LINE, cls: "mut", speed: 2, pause: 200 },
    { text: row("AMOUNT", amount, 32), cls: "big", speed: 10 },
    { text: pay, cls: payCls, speed: 10 },
    { text: "", cls: "gap", speed: 0 },
    { text: RULE_LINE, cls: "mut", speed: 2 },
    { text: audit, cls: "plain", speed: 8, lcd: "SEALING AUDIT LOG…" },
    { text: "", cls: "bc", speed: 0 },
  ];
}
