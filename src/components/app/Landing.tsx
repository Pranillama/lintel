"use client";

/** `/`: the receipt story plays a sample bill (labelled as a demo). The inbox and upload are always one click away. */
import Link from "next/link";
import { DemoStory } from "../story/DemoStory";
import { PrinterMark } from "./AppShell";

export function Landing() {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center gap-4 px-6">
        <span className="flex items-center gap-2 text-[24px] font-semibold leading-8 tracking-[-0.02em] text-paper"><PrinterMark /> Lintel</span>
        <p className="hidden flex-1 text-center text-[14px] leading-5 text-muted lg:block">Every property bill, checked before it&apos;s paid. Routine bills pay themselves; you only see the ones that need a person.</p>
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
    </>
  );
}
