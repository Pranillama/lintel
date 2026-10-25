"use client";

/** Home page hero: the receipt story played from a sample script, with the three endings to switch between. */
import Link from "next/link";
import { useState } from "react";
import { demoScript, type DemoEnding } from "./demo";
import { ReceiptStory, storyButton as b } from "./ReceiptStory";

const ENDINGS: Array<[DemoEnding, string]> = [["review", "On hold"], ["blocked", "Blocked"], ["paid", "Paid on its own"]];

export function DemoStory() {
  const [ending, setEnding] = useState<DemoEnding>("review");
  const [run, setRun] = useState(0);
  const script = demoScript(ending);
  return (
    <ReceiptStory
      key={`${ending}-${run}`}
      {...script}
      kicker="Sample bill · one bill, start to finish"
      cta={
        <>
          <div className={b.who}>{script.who}</div>
          <Link href="/inbox" className={`${b.base} ${b.lime}`}>Open the inbox →</Link>
          <Link href="/inbox?upload=1" className={`${b.base} ${b.ghost}`}>Upload a real bill</Link>
        </>
      }
      corner={
        <>
          <span className="font-mono text-[11px] font-semibold uppercase leading-4 tracking-[0.14em] text-muted">Demo · sample data</span>
          <div className="flex items-center gap-2">
            <div role="radiogroup" aria-label="Pick an ending" className="flex rounded-full bg-card p-1">
              {ENDINGS.map(([e, label]) => (
                <button key={e} type="button" role="radio" aria-checked={ending === e} onClick={() => { setEnding(e); setRun((r) => r + 1); }}
                  className={`h-8 cursor-pointer rounded-full px-3 text-[13px] leading-5 outline-none focus-visible:ring-2 focus-visible:ring-lime ${ending === e ? "bg-paper font-semibold text-bar" : "text-muted hover:text-paper"}`}>
                  {label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setRun((r) => r + 1)} className="h-10 cursor-pointer rounded-full px-4 text-[13px] font-semibold leading-5 text-paper shadow-[inset_0_0_0_1.5px_#3a3a3a] outline-none hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-lime">
              ↻ Replay
            </button>
          </div>
        </>
      }
    />
  );
}
