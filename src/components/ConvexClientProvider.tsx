"use client";

import type { ReactNode } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const client = url ? new ConvexReactClient(url) : null;

/** Wraps the app in Convex. Without NEXT_PUBLIC_CONVEX_URL it says how to fix that instead of crashing. */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!client) {
    return (
      <main className="grid min-h-screen place-items-center px-6">
        <div className="flex max-w-lg flex-col gap-3 rounded-[16px] bg-card p-6">
          <h1 className="text-[24px] font-semibold leading-8">Convex isn’t connected</h1>
          <p className="text-[16px] leading-6 text-muted">
            Set <code className="font-mono text-paper">NEXT_PUBLIC_CONVEX_URL</code> in <code className="font-mono text-paper">.env.local</code>. Running{" "}
            <code className="font-mono text-paper">npx convex dev</code> writes it for you.
          </p>
        </div>
      </main>
    );
  }
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
