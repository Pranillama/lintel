"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BillView } from "@/types/bill";
import { Blotter } from "./Blotter";
import { DetailPane } from "./DetailPane";
import { HeaderBar } from "./HeaderBar";
import { JudgeDrawer } from "./JudgeDrawer";
import { PolicyDrawer } from "./PolicyDrawer";
import { RealVsSimulatedDrawer } from "./RealVsSimulatedDrawer";
import { TotalsBar } from "./TotalsBar";
import { useConvexDesk } from "./useConvexDesk";
import { errorMessage, inTab, type BlotterTab, type DeskActions, type DeskData, type DrawerKind } from "./desk";

const TABS: BlotterTab[] = ["all", "held", "blocked", "cleared", "live"];

/** The bill to show after a replay: the first held bill with a spike reason, else the first held bill. */
function openingPick(bills: BillView[]): BillView | undefined {
  const held = bills.filter((b) => b.status === "HELD");
  return held.find((b) => b.decision.reasons.some((r) => r === "USAGE_SPIKE" || r === "AMOUNT_SPIKE")) ?? held[0] ?? bills[0];
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/** The AP Command Center, live on Convex. This is what `/` renders. */
export function CommandCenter() {
  const { data, actions } = useConvexDesk();
  return <DeskView data={data} actions={actions} />;
}

/** Layout and screen state for the desk. Works with the Convex desk or a mock desk of the same shape. */
export function DeskView({ data, actions, autoReplay = true }: { data: DeskData; actions: DeskActions; autoReplay?: boolean }) {
  const [tab, setTab] = useState<BlotterTab>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerKind | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const replayedOnce = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const replay = useCallback(async () => {
    setReplaying(true);
    setReplayError(null);
    setSelectedId(null);
    try {
      // Pick from what replayOpening returned; the subscription may still be catching up.
      const bills = await actions.replay();
      setSelectedId(openingPick(bills)?.id ?? null);
    } catch (err) {
      setReplayError(errorMessage(err));
    } finally {
      setReplaying(false);
    }
  }, [actions]);

  // ui-context §3: replay the opening batch on first load.
  useEffect(() => {
    if (!autoReplay || replayedOnce.current) return;
    replayedOnce.current = true;
    void replay();
  }, [autoReplay, replay]);

  // Keep the selection valid when the subscription updates.
  const selected = useMemo(() => data.bills.find((b) => b.id === selectedId), [data.bills, selectedId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drawer) {
        // In a field, Esc only leaves the field so a half-typed bill isn't lost.
        if (isTyping(e.target)) (e.target as HTMLElement).blur();
        else setDrawer(null);
        return;
      }
      if ((e.key === "j" || e.key === "J") && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault();
        setDrawer("judge");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t, data.bills.filter((b) => inTab(b, t)).length])) as Record<BlotterTab, number>,
    [data.bills],
  );
  const visible = useMemo(() => data.bills.filter((b) => inTab(b, tab)), [data.bills, tab]);
  const intakeLabel = data.bills.find((b) => b.source === "FEED")?.source_label ?? (data.bills.length ? "Live desk" : "Saturday intake");

  const onCreated = (bill: BillView) => {
    if (!inTab(bill, tab)) setTab("all");
    setSelectedId(bill.id);
    setFlashId(bill.id);
    window.setTimeout(() => setFlashId((id) => (id === bill.id ? null : id)), 1200);
  };

  return (
    <main className="flex h-screen min-h-[740px] flex-col gap-[22px] overflow-hidden px-9 py-7 [@media(max-height:820px)]:gap-4 [@media(max-height:820px)]:py-5">
      <HeaderBar
        tab={tab}
        onTab={setTab}
        counts={counts}
        seatsLine={data.portfolio?.seats_line}
        propertiesLoaded={data.portfolio?.properties.length ?? 0}
        openDrawer={drawer}
        onOpenDrawer={(kind) => setDrawer((open) => (open === kind ? null : kind))}
      />
      <TotalsBar totals={data.totals} auditChainIntact={data.auditChainIntact} intakeLabel={intakeLabel} countUp={!reduceMotion} replaying={replaying} />

      {replayError && (
        <p role="alert" className="-my-2 text-sm text-paper">
          Replay failed: {replayError}
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,400px)_1fr_1fr] grid-rows-2 gap-[14px]">
        <div className="row-span-2 min-h-0">
          <Blotter
            bills={visible}
            tab={tab}
            selectedId={selectedId}
            onSelect={setSelectedId}
            intakeLabel={intakeLabel}
            onReplay={() => void replay()}
            replaying={replaying || data.loading}
            flashId={flashId}
          />
        </div>
        <div className="relative col-span-2 row-span-2 min-h-0">
          <DetailPane bill={selected} properties={data.portfolio?.properties ?? []} actions={actions} auditChainIntact={data.auditChainIntact} />
          {drawer && (
            <div className="absolute inset-0 z-10">
              {drawer === "judge" && <JudgeDrawer onClose={() => setDrawer(null)} actions={actions} onCreated={onCreated} />}
              {drawer === "policy" && <PolicyDrawer onClose={() => setDrawer(null)} portfolio={data.portfolio} />}
              {drawer === "rvs" && <RealVsSimulatedDrawer onClose={() => setDrawer(null)} portfolio={data.portfolio} />}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
