"use client";

/**
 * `/`: the receipt printer prints today's tab from listBills, with a one-line pitch
 * and an always-visible way into the inbox. Short scroll; the inbox is one click away.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BillsResponse } from "@/types/bill";
import { ReceiptPrinter } from "../ReceiptPrinter";
import { useConvexDesk } from "../desk/useConvexDesk";
import { PrinterMark } from "./AppShell";

export function Landing() {
  const router = useRouter();
  const { data } = useConvexDesk();
  const response: BillsResponse | undefined =
    data.totals && data.bills.length > 0 ? { bills: data.bills, totals: data.totals, audit_chain_intact: data.auditChainIntact } : undefined;
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center gap-4 px-6">
        <span className="flex items-center gap-2 text-[24px] font-semibold leading-8 tracking-[-0.02em] text-paper"><PrinterMark /> Lintel</span>
        <span className="flex-1" />
        <Link href="/inbox" className="inline-flex h-10 items-center rounded-full bg-paper px-5 text-[14px] font-semibold leading-5 text-bar outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-lime">
          Skip to the inbox →
        </Link>
      </header>
      <ReceiptPrinter response={response} trackHeight="320vh" onOpenDesk={() => router.push("/inbox")} />
    </>
  );
}
