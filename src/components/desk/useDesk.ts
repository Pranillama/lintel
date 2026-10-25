"use client";

/**
 * Screen state for the desk: the view (desk or properties & vendors), selection,
 * Test a bill, drawers and keyboard.
 *
 * Optional, read-only URL hints (handy for demos and screenshots):
 *   ?bill=<vendor name or bill id>   select that bill once bills load
 *   ?panel=test                       open Test a bill
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BillView } from "@/types/bill";
import type { DeskActions, DeskData, DeskView, DrawerKind } from "./contract";

export interface DeskHints {
  bill?: string;
  panel?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function findBill(bills: BillView[], query: string | undefined): BillView | undefined {
  if (!query) return undefined;
  const q = norm(query);
  return bills.find((b) => norm(b.id) === q) ?? bills.find((b) => norm(b.vendor_name ?? "").includes(q));
}

/** The bill to show by default: the first held spike bill, else the first held bill, else the newest bill. */
function defaultPick(bills: BillView[]): BillView | undefined {
  const held = bills.filter((b) => b.status === "HELD");
  return held.find((b) => b.decision.reasons.some((r) => r === "USAGE_SPIKE" || r === "AMOUNT_SPIKE")) ?? held[0] ?? bills[0];
}

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

export function useDesk(data: DeskData, actions: DeskActions, hints: DeskHints = {}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<DeskView>("desk");
  const [testOpen, setTestOpen] = useState(hints.panel === "test");
  const [drawer, setDrawer] = useState<DrawerKind | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  // Keep the selection valid as the subscription updates. Until someone picks a bill, the ?bill= hint wins, then the default pick.
  const selected = useMemo(
    () => data.bills.find((b) => b.id === selectedId) ?? (selectedId === null ? findBill(data.bills, hints.bill) : undefined) ?? defaultPick(data.bills),
    [data.bills, selectedId, hints.bill],
  );

  const select = useCallback((id: string) => {
    setSelectedId(id);
    setTestOpen(false);
    setView("desk");
  }, []);

  /** A bill from Test a bill landed: select and flash it, keep the panel open. */
  const landed = useCallback((bill: BillView) => {
    setSelectedId(bill.id);
    setFlashId(bill.id);
    window.setTimeout(() => setFlashId((id) => (id === bill.id ? null : id)), 1600);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // In a field, Esc only leaves the field so a half-typed bill isn't lost.
        if (isTyping(e.target)) (e.target as HTMLElement).blur();
        else { setTestOpen(false); setDrawer(null); }
        return;
      }
      if ((e.key === "j" || e.key === "J") && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault();
        setDrawer(null);
        setTestOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return {
    data, actions, bills: data.bills, selected, select,
    loading: data.loading, view, setView,
    testOpen, setTestOpen, drawer, setDrawer, landed, flashId,
  };
}

export type DeskState = ReturnType<typeof useDesk>;
