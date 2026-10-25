"use client";

/** The bill as it was uploaded: a clickable vendor name on the bill page and a modal showing the PDF or photo. */
import type { useBillDocument } from "../desk/useConvexDesk";
import { Icon, T } from "../desk/ui";
import { Overlay } from "./kit";

export type BillDocument = NonNullable<ReturnType<typeof useBillDocument>>;

/** The vendor name; clickable with a "View original" hint only when an uploaded file exists. */
export function OriginalTitle({ name, doc, onOpen }: { name: string; doc: BillDocument | null; onOpen(): void }) {
  if (!doc) return <>{name}</>;
  return (
    <button type="button" onClick={onOpen} aria-haspopup="dialog" title="View the original bill"
      className="group inline-flex cursor-pointer items-center gap-2 rounded-[6px] text-left outline-none focus-visible:ring-2 focus-visible:ring-paper">
      <span className="underline-offset-4 group-hover:underline group-focus-visible:underline">{name}</span>
      <span className={`${T.small} inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-normal text-muted shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] group-hover:text-paper`}>
        <Icon name="doc" className="size-3.5" /> View original
      </span>
    </button>
  );
}

export function OriginalModal({ doc, vendor, onClose }: { doc: BillDocument; vendor: string; onClose(): void }) {
  const image = doc.media_type?.startsWith("image/") ?? false;
  const label = `Original bill from ${vendor}`;
  return (
    <Overlay onClose={onClose}>
      <div role="dialog" aria-modal="true" aria-label={label} className="mx-auto flex h-full w-[960px] max-w-full flex-col overflow-hidden rounded-[16px] bg-card">
        <header className="flex shrink-0 items-center gap-3 px-5 py-3">
          <Icon name="doc" className="text-muted" />
          <div className="min-w-0 flex-1">
            <h2 className={`${T.body} font-semibold`}>{label}</h2>
            <p className={`${T.small} truncate text-muted`}>{doc.filename ?? "Uploaded file"} · as uploaded</p>
          </div>
          <a href={doc.url} target="_blank" rel="noreferrer" className={`${T.small} rounded-full px-3 py-2 font-semibold text-paper outline-none shadow-[inset_0_0_0_1.5px_#3a3a3a] hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-paper`}>
            Open in new tab
          </a>
          <button type="button" onClick={onClose} aria-label="Close" autoFocus className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full text-muted outline-none hover:text-paper focus-visible:ring-2 focus-visible:ring-paper">
            <Icon name="close" />
          </button>
        </header>
        <div className="min-h-0 flex-1 bg-bar">
          {image
            ? (
              <div className="flex h-full items-start justify-center overflow-auto p-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- a Convex storage URL, not a static asset */}
                <img src={doc.url} alt={label} className="max-w-full" />
              </div>
            )
            : <iframe src={doc.url} title={label} className="size-full border-0 bg-white" />}
        </div>
      </div>
    </Overlay>
  );
}
