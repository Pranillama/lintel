import { formatUsd } from "@/engine/format";

/** Dollar amount as $1,234.56 with tabular figures. BLOCKED amounts get one strike-through. */
export function Money({ value, struck = false, className = "" }: { value: number | null | undefined; struck?: boolean; className?: string }) {
  const text = value === null || value === undefined ? "—" : formatUsd(value);
  return <span className={`tabular-nums ${struck ? "text-muted line-through" : ""} ${className}`}>{text}</span>;
}
