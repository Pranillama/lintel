"use client";

/**
 * One Convex subscription for every screen under the app shell, plus the
 * Upload drawer state. Screens read `useApp()`; only `useConvexDesk` talks to Convex.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { DeskActions, DeskData } from "../desk/contract";
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
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { data, actions } = useConvexDesk();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pending, setPending] = useState<PendingUpload[]>([]);

  const track = useCallback(async <T,>(label: string, run: () => Promise<T>) => {
    const item = { key: Date.now() + Math.random(), label, startedAt: Date.now() };
    setPending((p) => [...p, item]);
    try {
      return await run();
    } finally {
      setPending((p) => p.filter((x) => x.key !== item.key));
    }
  }, []);

  const value = useMemo(() => ({ data, actions, uploadOpen, setUploadOpen, pending, track }), [data, actions, uploadOpen, pending, track]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
}
