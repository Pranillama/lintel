"use client";

/**
 * The bill ticket printing out of the thermal printer (Variation C, "Receipt Story").
 * Each line is a real audit row; the printer's display narrates the step; the stamp
 * drops when the decision is on paper. `animate={false}` renders the final ticket at once.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { BillView } from "@/types/bill";
import { billTicket, finalLcd, stampOf, type LineKind, type TicketLine } from "./ticket";

const HEIGHT: Partial<Record<LineKind, number>> = { logo: 56, big: 30, gap: 96, bars: 44 };
const START = 350;

interface Slot extends TicketLine { start: number; dur: number }

function schedule(lines: TicketLine[]): { slots: Slot[]; printEnd: number } {
  let t = START;
  const slots = lines.map((l) => {
    t += l.lcd ? 60 : 15;
    const dur = l.kind === "logo" || l.kind === "gap" || l.kind === "bars" ? 80 : Math.max(60, l.text.length * 4);
    const s = { ...l, start: t, dur };
    t += dur;
    return s;
  });
  return { slots, printEnd: t };
}

export function ReceiptTicket({ bill, animate, onProgress, onDone }: {
  bill: BillView;
  animate: boolean;
  /** Checks printed so far, how many there are, and whether the stamp is down. */
  onProgress(done: number, total: number, stamped: boolean): void;
  /** The stamp has settled. */
  onDone(): void;
}) {
  const lines = useMemo(() => billTicket(bill), [bill]);
  const { slots, printEnd } = useMemo(() => schedule(lines), [lines]);
  const stampAt = printEnd + 300;
  // Rows that arrive mid-print (a finished brief) join the schedule without restarting it.
  const stampRef = useRef(stampAt);
  useEffect(() => { stampRef.current = stampAt; }, [stampAt]);
  const [clock, setClock] = useState(0);
  const t = animate ? clock : Number.POSITIVE_INFINITY;
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!animate) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const tt = now - t0;
      if (tt < stampRef.current + 600) {
        setClock(tt);
        raf = requestAnimationFrame(tick);
      } else {
        setClock(Number.POSITIVE_INFINITY);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate]);

  const printing = t >= START && t < printEnd;
  const stamped = t >= stampAt;

  // Keep the newest printed line in view while the paper feeds.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (el && animate && Number.isFinite(t)) el.scrollTop = el.scrollHeight;
  }, [t, animate]);

  const total = slots.filter((s) => s.check).length;
  const done = stamped ? total : slots.filter((s) => s.check && t >= s.start + s.dur).length;
  const settled = !Number.isFinite(t);
  useEffect(() => { onProgress(done, total, stamped); }, [done, total, stamped, onProgress]);
  useEffect(() => { if (animate && settled) onDone(); }, [animate, settled, onDone]);

  const current = [...slots].reverse().find((s) => s.lcd && t >= s.start - 60);
  const lcd = t < START ? "READY" : stamped || t >= printEnd ? finalLcd(bill) : `${current?.lcd ?? "PRINTING TICKET…"}`;
  const stamp = stampOf(bill);

  return (
    <div ref={stageRef} aria-label="Bill ticket" className="flex h-full min-h-0 flex-col overflow-y-auto rounded-[16px] bg-[radial-gradient(ellipse_at_50%_100%,#1d1d1d,#0e0e0e_70%)] [scrollbar-width:thin]">
      <div className="mt-auto flex flex-col items-center px-4 pt-8">
        <div className={`relative z-[1] w-[400px] max-w-full bg-[#f6f4ec] px-5 pb-7 pt-5 font-mono text-[12.5px] leading-[21px] text-[#1b1b1b] shadow-[0_30px_60px_rgba(0,0,0,0.55)] ${stamped && animate ? "motion-safe:animate-[paper-hit_380ms_ease-out_200ms]" : ""}`}>
          {slots.map((s, i) => {
            if (t < s.start) return null;
            const n = Math.floor(s.text.length * Math.min(1, (t - s.start) / s.dur));
            const text = s.text.slice(0, n);
            const h = HEIGHT[s.kind] ?? 21;
            if (s.kind === "logo") return (
              <div key={i} style={{ height: h }} className="text-center font-sans text-[24px] font-bold leading-8 tracking-[0.02em]">
                LINTEL<small className="block font-mono text-[11px] font-medium leading-4 tracking-[0.1em] text-[#8a877c]">AP DESK · BILL TICKET</small>
              </div>
            );
            if (s.kind === "bars") return <div key={i} style={{ height: h }} className="pt-1.5"><div className="h-8 bg-[repeating-linear-gradient(90deg,#1b1b1b_0_2px,transparent_2px_4px,#1b1b1b_4px_7px,transparent_7px_9px,#1b1b1b_9px_10px,transparent_10px_13px)]" /></div>;
            if (s.kind === "gap") return (
              <div key={i} style={{ height: h }} className="relative">
                {stamped && <Stamp key={bill.status} status={bill.status} word={stamp.word} sub={stamp.sub} animate={animate} />}
              </div>
            );
            const cls = s.kind === "mut" ? "text-[#8a877c]" : s.kind === "bold" ? "font-bold" : s.kind === "big" ? "text-[17px] font-bold leading-[30px]" : "";
            const mark = s.kind === "hl" ? "bg-lime shadow-[0_0_0_2px_var(--color-lime)]" : s.kind === "bad" ? "bg-[#ffd6d4] shadow-[0_0_0_2px_#ffd6d4]" : "";
            return <div key={i} style={{ height: h }} className={`overflow-hidden whitespace-pre ${cls}`}><span className={mark}>{text}</span></div>;
          })}
        </div>
        <Printer lcd={lcd} printing={printing} />
      </div>
    </div>
  );
}

const STAMP_STYLE: Record<BillView["status"], string> = {
  HELD: "bg-lime/90 text-[#1b1b1b] shadow-[inset_0_0_0_3px_#1b1b1b]",
  BLOCKED: "text-[#d8362b] shadow-[inset_0_0_0_3px_#d8362b]",
  CLEARED: "text-[#13804f] shadow-[inset_0_0_0_3px_#13804f]",
  REJECTED: "text-[#6b6960] shadow-[inset_0_0_0_3px_#6b6960]",
};

function Stamp({ status, word, sub, animate }: { status: BillView["status"]; word: string; sub: string; animate: boolean }) {
  return (
    <div role="img" aria-label={`Stamped ${word.toLowerCase()}: ${sub.toLowerCase()}`}
      className={`absolute left-1/2 top-3 -translate-x-1/2 -rotate-[9deg] whitespace-nowrap rounded-[10px] px-5 py-2 text-center mix-blend-multiply ${STAMP_STYLE[status]} ${animate ? "motion-safe:animate-[stamp-drop_420ms_cubic-bezier(.2,.9,.3,1.25)_both]" : ""}`}>
      <span className="block font-sans text-[28px] font-extrabold leading-8 tracking-[0.06em]">{word}</span>
      <span className="block font-mono text-[11px] font-bold leading-4 tracking-[0.14em]">{sub}</span>
    </div>
  );
}

function Printer({ lcd, printing }: { lcd: string; printing: boolean }) {
  return (
    <div className={`relative z-[2] -mt-2 h-[104px] w-[480px] max-w-full shrink-0 ${printing ? "motion-safe:animate-[printer-buzz_90ms_linear_infinite]" : ""}`} aria-hidden>
      <div className="absolute inset-x-0 top-0 h-6 rounded-t-[14px] rounded-b-[4px] bg-gradient-to-b from-[#3a3a3a] to-[#262626]">
        <div className="absolute inset-x-[48px] top-2 h-[7px] rounded bg-black" />
      </div>
      <div className="absolute inset-x-0 bottom-0 top-[22px] flex items-center gap-4 rounded-b-[16px] rounded-t-[4px] bg-gradient-to-b from-[#202020] to-[#121212] px-6">
        <div className="shrink-0">
          <div className="text-[20px] font-semibold tracking-[0.04em] text-paper">LINTEL</div>
          <div className="font-mono text-[10px] font-medium tracking-[0.1em] text-muted">THERMAL · 80 MM</div>
        </div>
        <div className="ml-auto h-9 min-w-0 flex-1 truncate rounded-[8px] bg-[#0d1406] px-3 font-mono text-[11.5px] font-semibold leading-9 tracking-[0.08em] text-lime shadow-[inset_0_0_0_1px_#2a3a12] [text-shadow:0_0_8px_rgba(200,242,90,0.6)]">
          {lcd}
        </div>
        <span className={`size-2.5 shrink-0 rounded-full ${printing ? "bg-lime motion-safe:animate-[led-blink_160ms_steps(2)_infinite]" : "bg-lime"}`} />
      </div>
    </div>
  );
}
