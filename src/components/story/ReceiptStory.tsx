"use client";

/**
 * The receipt story (Variation C): chapter rail on the left, live counters and the next
 * action on the right, a thermal printer in the middle typing the ticket line by line,
 * then the status stamp slams down. Ported from the design-review mockup's render(t).
 *
 * Driven only by props. Lines may be appended while it plays (live pipeline); each line
 * prints after the one before it, or as soon as it arrives. The stamp waits for
 * `complete` and the last line. Reduced motion shows whatever has arrived, finished.
 * Remount (React `key`) to replay.
 */
import { useEffect, useRef, type ReactNode } from "react";
import s from "./ReceiptStory.module.css";

export type Mark = "ok" | "fl" | "bd" | "sk";
export type LineCls = "plain" | "mut" | "bold" | "hl" | "bad" | "big" | "logo" | "gap" | "bc";

export interface StoryLine {
  text: string;
  cls: LineCls;
  /** ms per character (default 7). */
  speed?: number;
  /** ms of quiet before this line starts (default 70). */
  pause?: number;
  /** What the printer's display says from the pause before this line until the next display change. */
  lcd?: string;
  /** Chapter item this line ticks once it has printed, with its mark and (optionally) a new label. */
  item?: string;
  mark?: Mark;
  label?: string;
  /** Counts toward RULES CHECKED once printed. */
  rule?: boolean;
}

export interface StoryItem {
  id: string;
  ch: 0 | 1 | 2;
  /** Shown greyed until a line ticks it. */
  label: string;
}

export interface StoryStamp {
  tone: "review" | "paid" | "blocked" | "rejected";
  word: string;
  sub: string;
}

export interface ReceiptStoryProps {
  question: string;
  kicker?: string;
  chapters?: Array<{ title: string; sub: string }>;
  items: StoryItem[];
  lines: StoryLine[];
  /** No more lines will come: the stamp falls after the last one prints. */
  complete: boolean;
  stamp: StoryStamp | null;
  /** The last chapter-3 item; it ticks when the stamp lands. */
  final: { label: string; mark: Mark } | null;
  lcdEnd: string;
  /** While every arrived line has printed but more are expected: what the display says and which item is in progress. */
  waiting?: { lcd: string; item?: string } | null;
  /** Wall-clock ms (Date.now). ELAPSED runs from start until `stop`, or until the story completes. Omit to time it by the print schedule, as the scripted demo does. */
  clock?: { start: number; stop?: number };
  cta?: ReactNode;
  corner?: ReactNode;
  tag?: string;
}

const CHAPTERS = [
  { title: "AI reads", sub: "Claude turns the PDF into fields, each with a confidence." },
  { title: "Code decides", sub: "Plain rules — no AI — decide if it gets paid." },
  { title: "A person owns it", sub: "Anything unusual waits for the right human." },
];
const HEIGHT: Partial<Record<LineCls, number>> = { logo: 58, big: 30, bc: 46, gap: 92 };
const GLYPH: Record<Mark, string> = { ok: "✓", fl: "!", bd: "✕", sk: "–" };
const MARKS: Mark[] = ["ok", "fl", "bd", "sk"];
const START = 400;
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const prog = (t: number, start: number, dur: number) => clamp((t - start) / dur);
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

interface Slot { line: StoryLine; start: number; dur: number; h: number }

export function ReceiptStory(props: ReceiptStoryProps) {
  const { question, kicker = "One bill, start to finish", chapters = CHAPTERS, items, lines, stamp, final, cta, corner, tag = "AI READS · CODE DECIDES · A PERSON OWNS IT" } = props;
  const latest = useRef(props);
  useEffect(() => { latest.current = props; });

  const paperRef = useRef<HTMLDivElement>(null);
  const printerRef = useRef<HTMLDivElement>(null);
  const lcdRef = useRef<HTMLDivElement>(null);
  const ledRef = useRef<HTMLSpanElement>(null);
  const stampRef = useRef<HTMLDivElement>(null);
  const splatRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef<HTMLDivElement>(null);
  const rulesRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const chRefs = useRef<Array<HTMLDivElement | null>>([]);
  const lineEls = useRef<Array<HTMLDivElement | null>>([]);
  const itemEls = useRef(new Map<string, HTMLLIElement>());
  const finalRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    const sched: Slot[] = [];
    let tEnd = START;
    let stampAt: number | null = null;
    let completedAt: number | null = null;
    let raf = 0;

    const setText = (el: Element | null | undefined, text: string) => { if (el && el.textContent !== text) el.textContent = text; };
    const setMark = (li: HTMLLIElement, cls: Mark | "cur" | "", label: string) => {
      for (const m of [...MARKS, "cur"]) li.classList.toggle(s[m], m === cls);
      setText(li.firstElementChild, cls && cls !== "cur" ? GLYPH[cls] : "");
      setText(li.lastElementChild, label);
    };

    const frame = (now: number) => {
      const p = latest.current;
      const real = now - t0;
      const tt = reduce ? Number.MAX_SAFE_INTEGER : real;

      // Schedule any line that has arrived since the last frame.
      while (sched.length < p.lines.length) {
        const line = { ...p.lines[sched.length] };
        const start = Math.max(tEnd, real) + (line.pause ?? 70);
        const dur = Math.max(80, line.text.length * (line.speed ?? 7));
        sched.push({ line, start, dur, h: HEIGHT[line.cls] ?? 21 });
        tEnd = start + dur;
      }
      if (stampAt === null && p.complete && p.stamp && sched.length === p.lines.length) {
        stampAt = tEnd + 450;
        completedAt = Date.now();
      }
      const printEnd = stampAt === null ? null : stampAt - 450;

      let h = 56;
      let typing = false;
      let cur: Slot | null = null;
      sched.forEach((sl, i) => {
        const el = lineEls.current[i];
        if (!el) return;
        const started = tt >= sl.start;
        el.style.display = started ? "block" : "none";
        if (started) h += sl.h * easeOut(prog(tt, sl.start - 40, 120));
        if (el.dataset.typed) {
          const n = Math.floor(sl.line.text.length * prog(tt, sl.start, sl.dur));
          setText(el.firstElementChild, sl.line.text.slice(0, n));
          if (started && n < sl.line.text.length) typing = true;
        }
        if (sl.line.lcd && tt >= sl.start - (sl.line.pause ?? 0)) cur = sl;
      });
      const paper = paperRef.current;
      if (paper) paper.style.height = `${h}px`;

      // Impact shake when the stamp lands.
      const hit = stampAt === null ? 0 : prog(tt, stampAt + 200, 380);
      const shake = hit > 0 && hit < 1 ? Math.sin(hit * 30) * (1 - hit) * 4 : 0;
      if (paper) paper.style.transform = `translateY(${shake}px)`;
      const printing = tt > START && (printEnd === null || tt < printEnd);
      const done = printEnd !== null && tt >= printEnd;
      if (printerRef.current) printerRef.current.style.transform = printing && typing ? `translateX(${Math.sin(tt / 18) * 0.7}px)` : "none";
      if (ledRef.current) {
        const on = printing ? Math.sin(real / 50) > 0 : done;
        ledRef.current.style.background = on ? "#c8f25a" : "#3b4a1a";
        ledRef.current.style.boxShadow = printing || done ? "0 0 10px #c8f25a" : "none";
      }
      const idle = !typing && tt >= tEnd;
      const blink = reduce ? "" : Math.floor(real / 400) % 2 ? "▍" : " ";
      const lcd = tt < START ? "READY" : done ? p.lcdEnd : `${idle && p.waiting ? p.waiting.lcd : ((cur as Slot | null)?.line.lcd ?? "PRINTING TICKET…")}${blink}`;
      setText(lcdRef.current, lcd);

      // Stamp: drops from above at 2.6x, slams to 1x, overshoots; the ink ring bursts.
      const st = stampRef.current, sl = splatRef.current;
      if (st && sl) {
        if (stampAt === null) {
          st.style.opacity = "0";
          sl.style.opacity = "0";
        } else {
          let y = 22;
          for (const x of sched) { if (x.line.cls === "gap") break; y += x.h; }
          y += 12;
          const sp = prog(tt, stampAt, 220);
          const scale = sp < 1 ? 2.6 - 1.6 * (sp * sp) : 1 - 0.04 * Math.sin(Math.PI * prog(tt, stampAt + 220, 180));
          st.style.top = `${y}px`;
          st.style.opacity = String(sp > 0 ? Math.min(1, sp * 2) : 0);
          st.style.transform = `translateX(-50%) rotate(${-18 + 9 * sp}deg) scale(${scale})`;
          const spl = prog(tt, stampAt + 200, 600);
          sl.style.top = `${y - 30}px`;
          sl.style.opacity = String(spl > 0 && spl < 1 ? (1 - spl) * 0.8 : 0);
          sl.style.transform = `scale(${0.6 + spl * 0.7})`;
        }
      }

      // Chapters and counters mirror what has printed.
      let active = 0;
      const chOf = new Map(p.items.map((it) => [it.id, it.ch]));
      const state = new Map<string, { cls: Mark | "cur"; label?: string }>();
      for (const x of sched) {
        if (!x.line.item) continue;
        const finished = tt >= x.start + x.dur;
        const working = !finished && tt >= x.start - (x.line.pause ?? 0);
        if (finished) state.set(x.line.item, { cls: x.line.mark ?? "ok", label: x.line.label });
        else if (working) state.set(x.line.item, { cls: "cur" });
        if ((working || finished) && chOf.has(x.line.item)) active = chOf.get(x.line.item)!;
      }
      const waitItem = idle && !done ? p.waiting?.item : undefined;
      if (waitItem && !state.has(waitItem)) {
        state.set(waitItem, { cls: "cur" });
        if (chOf.has(waitItem)) active = Math.max(active, chOf.get(waitItem)!);
      }
      for (const it of p.items) {
        const li = itemEls.current.get(it.id);
        const st2 = state.get(it.id);
        if (li) setMark(li, st2?.cls ?? "", st2?.label ?? it.label);
      }
      const stamped = stampAt !== null && tt >= stampAt + 200;
      if (finalRef.current && p.final) setMark(finalRef.current, stamped ? p.final.mark : "", p.final.label);
      if (stamped) active = 2;
      chRefs.current.forEach((el, i) => {
        if (!el) return;
        el.classList.toggle(s.on, i === active);
        el.classList.toggle(s.past, i < active);
      });
      setText(rulesRef.current, String(sched.filter((x) => x.line.rule && tt >= x.start + x.dur).length));
      const secs = p.clock ? ((p.clock.stop ?? completedAt ?? Date.now()) - p.clock.start) / 1000 : (Math.max(0, Math.min(tt, printEnd ?? tt) - START)) / 1000;
      setText(elapsedRef.current, `${Math.max(0, secs).toFixed(1)}s`);
      const c = ctaRef.current;
      if (c) {
        const cp = stampAt === null ? 0 : easeOut(prog(tt, stampAt + 500, 500));
        c.style.opacity = String(cp);
        c.style.transform = `translateY(${(1 - cp) * 8}px)`;
        c.classList.toggle(s.live, cp > 0.5);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={s.stage}>
      <div className={s.chapters}>
        <div>
          <div className={s.kicker}>{kicker}</div>
          <div className={s.bigq}>{question}</div>
        </div>
        {chapters.map((c, i) => (
          <div key={i} className={s.ch} ref={(el) => { chRefs.current[i] = el; }}>
            <h2><span className={s.n}>{i + 1}</span>{c.title}</h2>
            <p>{c.sub}</p>
            <ul>
              {items.filter((it) => it.ch === i).map((it) => (
                <li key={it.id} ref={(el) => { if (el) itemEls.current.set(it.id, el); else itemEls.current.delete(it.id); }}>
                  <span className={s.b} /><span />
                </li>
              ))}
              {i === 2 && final && <li ref={finalRef}><span className={s.b} /><span /></li>}
            </ul>
          </div>
        ))}
      </div>

      <div className={s.side}>
        <div className={s.stat}><div className={s.v} ref={elapsedRef}>0.0s</div><div className={s.k}>ELAPSED</div></div>
        <div className={s.stat}><div className={s.v} ref={rulesRef}>0</div><div className={s.k}>RULES CHECKED</div></div>
        <div className={s.stat}><div className={s.v}>0</div><div className={s.k}>AI DECISIONS ON MONEY</div></div>
        <div className={s.cta} ref={ctaRef}>{cta}</div>
      </div>

      <div className={s.paper} ref={paperRef} aria-hidden="true">
        <div>
          {lines.map((l, i) => (
            <div key={i} ref={(el) => { lineEls.current[i] = el; }} className={`${s.ln} ${l.cls === "plain" ? "" : s[l.cls]}`}
              data-typed={l.cls === "logo" || l.cls === "gap" || l.cls === "bc" ? undefined : "1"}>
              {l.cls === "logo" ? <>{l.text}<small>AP DESK · BILL TICKET</small></> : l.cls === "bc" ? <div className={s.bars} /> : l.cls === "gap" ? null : <span />}
            </div>
          ))}
        </div>
        <div className={s.splat} ref={splatRef} />
        <div className={`${s.stamp} ${stamp ? s[stamp.tone] : ""}`} ref={stampRef}>
          {stamp && <>{stamp.word}<small>{stamp.sub}</small></>}
        </div>
      </div>

      <div className={s.printer} ref={printerRef}>
        <div className={s.pTop}><div className={s.pSlot} /></div>
        <div className={s.pFront}>
          <div><div className={s.pBrand}>LINTEL</div><div className={s.pSub}>THERMAL · 80 MM</div></div>
          <div className={s.lcd} ref={lcdRef}>READY</div>
          <span className={s.led} ref={ledRef} />
        </div>
      </div>

      <div className={s.tag}>{tag}</div>
      {corner && <div className={s.corner}>{corner}</div>}
    </div>
  );
}

/** Button styles shared by story CTAs and corners. */
export const storyButton = { base: s.btn, lime: s.lime, ghost: s.ghost, who: s.who, err: s.err };
