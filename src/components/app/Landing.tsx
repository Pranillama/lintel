"use client";

/**
 * `/`: the receipt story plays a sample bill (labelled as a demo), then the 3D receipt
 * printer prints today's real tab from listBills. The inbox and upload are always one click away.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { BillsResponse } from "@/types/bill";
import { ReceiptPrinter } from "../ReceiptPrinter";
import { useConvexDesk } from "../desk/useConvexDesk";
import { DemoStory } from "../story/DemoStory";
import { PrinterMark } from "./AppShell";

export function Landing() {
  const router = useRouter();
  const { data } = useConvexDesk();
  const [past, setPast] = useState(false);
  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const response: BillsResponse | undefined =
    data.totals && data.bills.length > 0 ? { bills: data.bills, totals: data.totals, audit_chain_intact: data.auditChainIntact } : undefined;
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center gap-4 px-6">
        <span className="flex items-center gap-2 text-[24px] font-semibold leading-8 tracking-[-0.02em] text-paper"><PrinterMark /> Lintel</span>
        <p className={`hidden flex-1 text-center text-[14px] leading-5 text-muted transition-opacity lg:block ${past ? "opacity-0" : ""}`} aria-hidden={past}>Every property bill, checked before it&apos;s paid. Routine bills pay themselves; you only see the ones that need a person.</p>
        <span className="flex-1 lg:hidden" />
        <Link href="/inbox?upload=1" className="inline-flex h-10 items-center rounded-full px-4 text-[14px] font-semibold leading-5 text-paper shadow-[inset_0_0_0_1.5px_#3a3a3a] outline-none hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-lime">
          Upload a bill
        </Link>
        <Link href="/inbox" className="inline-flex h-10 items-center rounded-full bg-paper px-5 text-[14px] font-semibold leading-5 text-bar outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-lime">
          Skip to the inbox →
        </Link>
      </header>
      <section aria-label="Sample bill, start to finish" className="h-[100svh] min-h-[720px] pt-16">
        <DemoStory />
      </section>
      <div className="border-t border-white/[0.08] bg-bar px-6 py-10 text-center">
        <p className="font-mono text-[12px] font-semibold uppercase leading-4 tracking-[0.14em] text-muted">Today&apos;s real tab</p>
        <p className="mt-2 text-[16px] leading-6 text-paper">Scroll to print every bill Lintel has handled today, straight from your data.</p>
      </div>
      <ReceiptPrinter response={response} trackHeight="320vh" onOpenDesk={() => router.push("/inbox")} />
    </>
  );
}
