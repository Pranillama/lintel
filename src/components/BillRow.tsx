import type { BillView, PaymentRail } from "@/types/bill";
import { Money } from "./Money";
import { StatusChip } from "./StatusChip";
import { REASON_LABEL, type BillRowProps } from "./desk";

const RAIL_LABEL: Record<PaymentRail, string> = {
  UTILITY_PORTAL: "Portal",
  ACH: "ACH",
  CHECK: "Check",
  X402_USDC: "x402 USDC",
};

function subline(bill: BillView): string {
  switch (bill.status) {
    case "CLEARED": {
      const rail = bill.payment?.rail ?? bill.decision.rail;
      const parts = [
        rail ? RAIL_LABEL[rail] : "Payment",
        bill.payment?.mode === "LIVE_TESTNET" ? "testnet" : "simulated",
      ];
      if (bill.resolved_by === "HUMAN") parts.push("resolved by you");
      return parts.join(" · ");
    }
    case "HELD":
    case "BLOCKED":
      return bill.decision.reasons.slice(0, 2).map((r) => REASON_LABEL[r]).join(" · ");
    case "REJECTED":
      return "Rejected by a person";
  }
}

function ringClass(bill: BillView, selected: boolean): string {
  if (bill.status === "HELD") return "border-[5px] border-lime";
  if (bill.status === "CLEARED") return `border-2 ${selected ? "border-bar" : "border-paper"}`;
  return "border-2 border-dashed border-muted";
}

export function BillRow({ bill, selected, onSelect, flash, revealIndex }: BillRowProps) {
  const reveal = revealIndex >= 0;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(bill.id)}
      style={reveal ? { animationDelay: `${revealIndex * 250}ms` } : undefined}
      className={`flex min-h-[104px] w-full flex-none cursor-pointer items-center gap-4 rounded-card px-5 py-4 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-lime ${
        selected ? "bg-paper text-bar" : "bg-card text-paper"
      } ${reveal ? "animate-reveal" : ""} ${flash ? "animate-flash" : ""}`}
    >
      <span aria-hidden className={`flex size-[58px] flex-none items-center justify-center rounded-full text-[18px] font-medium ${ringClass(bill, selected)}`}>
        {(bill.vendor_name ?? "?").charAt(0).toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] opacity-70">
          {bill.vendor_name ?? "Unknown vendor"} · {bill.property_name ?? "Unmatched"}
        </span>
        <Money value={bill.amount} struck={bill.status === "BLOCKED"} className="truncate text-[26px] leading-tight" />
        <span className="truncate text-[13px] opacity-80">{subline(bill)}</span>
      </span>
      <StatusChip status={bill.status} className="flex-none" />
    </button>
  );
}
