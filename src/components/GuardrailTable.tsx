import type { CheckResult } from "@/types/bill";
import { CheckMark } from "./CheckMark";
import { CHECK_LABEL } from "./desk";

/** Every engine check in order: tile, name, and the engine's rationale verbatim. */
export function GuardrailTable({ checks }: { checks: CheckResult[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-5 gap-y-3">
      {checks.map((check) => (
        <li key={check.id} className="flex min-w-0 items-start gap-3">
          <CheckMark outcome={check.outcome} className="size-8! rounded-[11px]! text-sm!" />
          <div className="min-w-0">
            <p className="text-[14px] font-medium leading-tight">{CHECK_LABEL[check.id]}</p>
            <p title={check.rationale} className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-muted">
              {check.rationale}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Short muted summary for the card header. Counts outcomes only. */
export function checksSummary(checks: CheckResult[]): string {
  const failed = checks.filter((c) => c.outcome === "BLOCK").length;
  const halted = checks.filter((c) => c.outcome === "HALT").length;
  if (failed > 0) return `${failed} failed`;
  if (halted > 0) return `${halted} needs you`;
  return "all clear";
}
