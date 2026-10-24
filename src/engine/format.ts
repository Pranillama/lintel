import { roundUsd } from "@/shared/normalize";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const qty = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function formatUsd(n: number): string {
  return usd.format(roundUsd(n));
}

/** Signed one-decimal percent. Negative uses U+2212, matching master-spec §5.3. */
export function formatPct(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const body = Math.abs(rounded).toFixed(1);
  if (rounded > 0) return `+${body}%`;
  if (rounded < 0) return `−${body}%`;
  return `${body}%`;
}

export function formatQty(n: number): string {
  return qty.format(Math.round(n * 10) / 10);
}
