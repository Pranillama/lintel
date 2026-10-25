"use client";

/**
 * One Convex subscription for every screen under the app shell, plus the
 * Upload drawer state. Screens read `useApp()`; only `useConvexDesk` talks to Convex.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { BillView } from "@/types/bill";
import { errorMessage, type DeskActions, type DeskData } from "../desk/contract";
import type { LiveRun } from "../story/LiveStory";
import { useConvexDesk } from "../desk/useConvexDesk";

/** An upload this browser sent that has not come back yet. The engine reports no progress, so this is all "Processing" can honestly show. */
export interface PendingUpload {
  key: number;
  label: string;
  startedAt: number;
}

interface AppState {
  data: DeskData;
  actions: DeskActions;
  uploadOpen: boolean;
  setUploadOpen(open: boolean): void;
  pending: PendingUpload[];
  /** Wraps a processBill call so the Inbox can show it under "Processing now". */
  track<T>(label: string, run: () => Promise<T>): Promise<T>;
  /** The upload the full-screen story is following, if it is open. */
  story: LiveRun | null;
  /** Runs an upload through `track` and opens the story on it. */
  runStory(source: LiveRun["source"], label: string, match: { filename: string } | { invoice: string }, call: () => Promise<BillView>): void;
  closeStory(): void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { data, actions } = useConvexDesk();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [story, setStory] = useState<LiveRun | null>(null);
  const billsRef = useRef(data.bills);
  useEffect(() => { billsRef.current = data.bills; }, [data.bills]);

  const track = useCallback(async <T,>(label: string, run: () => Promise<T>) => {
    const item = { key: Date.now() + Math.random(), label, startedAt: Date.now() };
    setPending((p) => [...p, item]);
    try {
      return await run();
    } finally {
      setPending((p) => p.filter((x) => x.key !== item.key));
    }
  }, []);

  const runStory = useCallback<AppState["runStory"]>((source, label, match, call) => {
    const key = Date.now();
    setStory({
      key, source, startedAt: key, knownIds: new Set(billsRef.current.map((b) => b.id)),
      filename: "filename" in match ? match.filename : null, invoice: "invoice" in match ? match.invoice : null,
      result: null, error: null,
    });
    const settle = (patch: Partial<LiveRun>) => setStory((s) => (s?.key === key ? { ...s, ...patch } : s));
    track(label, call).then((result) => settle({ result }), (err) => settle({ error: errorMessage(err) }));
  }, [track]);
  const closeStory = useCallback(() => setStory(null), []);

  const value = useMemo(() => ({ data, actions, uploadOpen, setUploadOpen, pending, track, story, runStory, closeStory }), [data, actions, uploadOpen, pending, track, story, runStory, closeStory]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
}
