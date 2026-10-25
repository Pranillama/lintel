"use client";

import { useCallback, useEffect, useRef } from "react";
import type { BillsResponse } from "@/types/bill";
import { ReceiptPrinter } from "../ReceiptPrinter";
import { Desk } from "./Desk";
import type { DeskHints } from "./useDesk";
import { useConvexDesk } from "./useConvexDesk";

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

/**
 * The landing page, live on Convex. This is what `/` renders: the scroll-driven receipt printer
 * prints the live tab first, then the desk sits below it. Both read the same desk data.
 */
export function LiveDesk({ hints }: { hints: DeskHints }) {
  const { data, actions } = useConvexDesk();
  const deskRef = useRef<HTMLDivElement>(null);
  // Feed the printer once there are bills; until then it shows its warming-up state.
  const response: BillsResponse | undefined =
    data.totals && data.bills.length > 0 ? { bills: data.bills, totals: data.totals, audit_chain_intact: data.auditChainIntact } : undefined;
  const revealDesk = useCallback(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    deskRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, []);

  // `J` opens Test a bill inside the desk, so bring the desk into view from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "j" || e.key === "J") && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) revealDesk();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealDesk]);

  // URL hints (`?bill=`, `?panel=`) point at the desk, so skip the printer.
  useEffect(() => {
    if (hints.bill || hints.panel) deskRef.current?.scrollIntoView({ block: "start" });
  }, [hints.bill, hints.panel]);

  return (
    <>
      <a href="#desk" className="sr-only z-50 rounded-full bg-lime px-5 py-3 text-sm font-semibold text-bar focus:not-sr-only focus:fixed focus:left-6 focus:top-6">
        Skip to the AP desk
      </a>
      <ReceiptPrinter response={response} trackHeight="700vh" onOpenDesk={revealDesk} />
      <div id="desk" ref={deskRef}>
        <Desk data={data} actions={actions} hints={hints} />
      </div>
    </>
  );
}
