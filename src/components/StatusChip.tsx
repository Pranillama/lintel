import type { BillStatus } from "@/types/bill";
import { STATUS_LABEL } from "./desk";

const STYLE: Record<BillStatus | "READING", string> = {
  // lime = needs you; paper outline = cleared; muted = blocked / rejected
  HELD: "bg-lime text-bar",
  CLEARED: "shadow-[inset_0_0_0_1.5px_currentColor]",
  BLOCKED: "bg-raised text-muted",
  REJECTED: "text-muted shadow-[inset_0_0_0_1.5px_var(--color-raised)]",
  READING: "bg-raised text-muted",
};

/** Status pill. Shows the engine's status; `reading` is UI-only while a replay is in flight. */
export function StatusChip({ status, reading = false, className = "" }: { status?: BillStatus; reading?: boolean; className?: string }) {
  const key = reading || !status ? "READING" : status;
  const label = key === "READING" ? "Reading…" : STATUS_LABEL[key];
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${STYLE[key]} ${className}`}>
      {label}
    </span>
  );
}
