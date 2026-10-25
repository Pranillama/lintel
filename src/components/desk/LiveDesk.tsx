"use client";

import { Desk } from "./Desk";
import type { DeskHints } from "./useDesk";
import { useConvexDesk } from "./useConvexDesk";

/** The desk, live on Convex. This is what `/` renders. */
export function LiveDesk({ hints }: { hints: DeskHints }) {
  const { data, actions } = useConvexDesk();
  return <Desk data={data} actions={actions} hints={hints} />;
}
