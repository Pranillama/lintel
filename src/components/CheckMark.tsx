import type { AuditDecision, CheckOutcome } from "@/types/bill";

type Mark = CheckOutcome | AuditDecision;

const STYLE: Record<"PASS" | "HALT" | "BLOCK" | "SKIP", { cls: string; glyph: string; label: string }> = {
  PASS: { cls: "bg-raised text-paper", glyph: "✓", label: "Pass" },
  HALT: { cls: "bg-lime text-bar", glyph: "!", label: "Needs you" },
  BLOCK: { cls: "bg-paper text-bar", glyph: "✕", label: "Blocked" },
  SKIP: { cls: "bg-raised text-muted", glyph: "–", label: "Skipped" },
};

function normalize(mark: Mark): keyof typeof STYLE {
  if (mark === "EXECUTE") return "PASS";
  if (mark === "INFO") return "SKIP";
  return mark;
}

/** Square check tile used by the guardrail grid and the audit list. */
export function CheckMark({ outcome, className = "" }: { outcome: Mark; className?: string }) {
  const s = STYLE[normalize(outcome)];
  return (
    <span role="img" aria-label={s.label} className={`grid size-10 shrink-0 place-items-center rounded-[14px] text-base font-bold ${s.cls} ${className}`}>
      {s.glyph}
    </span>
  );
}
