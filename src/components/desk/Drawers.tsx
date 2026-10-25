"use client";

/** The right-hand sheet the add forms open in. */
import type { ReactNode } from "react";
import { Icon, T } from "./ui";

export function Sheet({ title, sub, onClose, children }: { title: string; sub: string; onClose(): void; children: ReactNode }) {
  return (
    <aside role="dialog" aria-label={title} className="flex h-full w-[640px] max-w-full flex-col overflow-hidden rounded-[16px] bg-card">
      <header className="flex shrink-0 items-start gap-4 px-6 pb-4 pt-6">
        <div className="min-w-0 flex-1">
          <h2 className={T.title}>{title}</h2>
          <p className={`${T.small} text-muted`}>{sub}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full text-muted outline-none hover:text-paper focus-visible:ring-2 focus-visible:ring-paper">
          <Icon name="close" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>
    </aside>
  );
}
