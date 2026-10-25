"use client";

/**
 * Screen state for the desk: the opening replay, selection, Test a bill, drawers
 * and keyboard. Works with the Convex desk or the mock desk (same shape).
 *
 * Optional, read-only URL hints (handy for demos and screenshots):
 *   ?bill=EBMUD | recology | bayline | pge | BILL-103   select a bill after the replay
 *   ?panel=test                                          open Test a bill
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BillView } from "@/types/bill";
import { errorMessage, type DeskActions, type DeskData, type DrawerKind } from "./contract";

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

/** The bill to show after a replay: the first held spike bill, else the first held bill, else the first bill. */
function openingPick(bills: BillView[]): BillView | undefined {
  const held = bills.filter((b) => b.status === "HELD");
  return held.find((b) => b.decision.reasons.some((r) => r === "USAGE_SPIKE" || r === "AMOUNT_SPIKE")) ?? held[0] ?? bills[0];
}

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

export function useDesk(data: DeskData, actions: DeskActions, hints: DeskHints = {}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(true);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(hints.panel === "test");
  const [drawer, setDrawer] = useState<DrawerKind | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const started = useRef(false);

  const replay = useCallback(async (pickQuery?: string) => {
    setReplaying(true);
    setReplayError(null);
    setSelectedId(null);
    try {
      // Pick from what the replay returned; the subscription may still be catching up.
      const bills = await actions.replay();
      setSelectedId((findBill(bills, pickQuery) ?? openingPick(bills))?.id ?? null);
    } catch (err) {
      setReplayError(errorMessage(err));
    } finally {
      setReplaying(false);
    }
  }, [actions]);

  // Replay the opening batch once on first load.
  useEffect(() => {
    // Deferred so StrictMode's mount, unmount, mount runs it exactly once.
    const t = window.setTimeout(() => {
      if (started.current) return;
      started.current = true;
      void replay(hints.bill);
    }, 0);
    return () => window.clearTimeout(t);
  }, [replay, hints.bill]);

  // Keep the selection valid as the subscription updates; fall back to the first bill.
  const selected = useMemo(() => data.bills.find((b) => b.id === selectedId) ?? (replaying ? undefined : data.bills[0]), [data.bills, selectedId, replaying]);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    setTestOpen(false);
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
    replaying: replaying || data.loading, replayError, replay: () => void replay(),
    testOpen, setTestOpen, drawer, setDrawer, landed, flashId,
  };
}

export type DeskState = ReturnType<typeof useDesk>;
