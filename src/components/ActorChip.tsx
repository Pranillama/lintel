import type { Actor } from "@/types/bill";

export type ActorFamily = "AI" | "CODE" | "HUMAN" | "CRS";

/** Groups audit actors the way the header legend reads: AI reads · CODE decides · HUMAN owns. */
export function actorFamily(actor: Actor): ActorFamily {
  if (actor === "AI_EXTRACTION" || actor === "AI_INVESTIGATOR") return "AI";
  if (actor === "HUMAN_INPUT" || actor === "HUMAN_OPERATOR" || actor === "HUMAN_ALIAS") return "HUMAN";
  if (actor === "CRS_SANDBOX") return "CRS";
  return "CODE"; // DETERMINISTIC_RULE, PAYMENT_ROUTER, SYSTEM_FEED
}

// Three-color rule: families differ by shape, not hue. Lime is reserved for "needs you".
const STYLE: Record<ActorFamily, string> = {
  AI: "shadow-[inset_0_0_0_1.5px_currentColor]",
  CODE: "bg-raised text-muted",
  HUMAN: "bg-paper text-bar",
  CRS: "text-muted shadow-[inset_0_0_0_1.5px_var(--color-muted)] [border-style:dashed]",
};

export function ActorChip({ actor, className = "" }: { actor: Actor; className?: string }) {
  const family = actorFamily(actor);
  return (
    <span title={actor} className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[10.5px] font-semibold tracking-[0.06em] ${STYLE[family]} ${className}`}>
      {family}
    </span>
  );
}
