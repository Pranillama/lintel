"use client";

/**
 * Desk visual system: the type scale, the one card, the one chip anatomy and the
 * button kinds, so every part of the screen reads as one product.
 *
 * Colors: base (bar), one surface (card), paper, muted (a text tone), lime, ok, bad.
 * Lime means "needs a human" or "the one primary action". Green = cleared / passed.
 * Red = blocked / failed / error. Status is never color alone: icon + word.
 * Type: 12 / 14 / 16 / 24 / 40. Weights 400 / 600. Radius 16 / 10 / full. Spacing on 4px.
 */
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { formatUsd } from "@/engine/format";
import type { BillStatus } from "@/types/bill";
import { STATUS_LABEL } from "./contract";

export const T = {
  label: "font-mono text-[12px] font-semibold uppercase tracking-[0.08em] leading-4",
  small: "text-[14px] leading-5",
  body: "text-[16px] leading-6",
  title: "text-[24px] leading-8 font-semibold tracking-[-0.01em]",
  hero: "text-[40px] leading-[48px] tracking-[-0.02em] tabular-nums",
} as const;

export const CARD = "rounded-[16px] bg-card p-6";
export const HAIRLINE = "border-white/[0.08]";

/* ---------- Icons (16px, currentColor) ---------- */

type IconName = "check" | "x" | "alert" | "plus" | "arrow" | "upload" | "chevron" | "dot" | "close" | "slash" | "send" | "doc";

const PATHS: Record<IconName, ReactNode> = {
  check: <path d="M3.5 8.5l3 3 6-7" />,
  x: <path d="M4.5 4.5l7 7m0-7l-7 7" />,
  alert: <><path d="M8 4.5v4.5" /><path d="M8 11.5v.01" /></>,
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  arrow: <path d="M3.5 8h9m-3.5-3.5L12.5 8 9 11.5" />,
  upload: <path d="M8 11V3.5M5 6.5l3-3 3 3M3.5 12.5h9" />,
  chevron: <path d="M5.5 6.5L8 9l2.5-2.5" />,
  dot: <circle cx="8" cy="8" r="3" fill="currentColor" stroke="none" />,
  close: <path d="M4.5 4.5l7 7m0-7l-7 7" />,
  slash: <path d="M5 11l6-6" />,
  send: <path d="M3 8l10-4.5L9.5 13 8 9z" />,
  doc: <><path d="M4.5 2.5h5l2 2v9h-7z" /><path d="M6.5 8h3M6.5 10.5h3" /></>,
};

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`size-4 shrink-0 ${className}`}>
      {PATHS[name]}
    </svg>
  );
}

/* ---------- Status chip: icon + word, never color alone ---------- */

const STATUS_STYLE: Record<BillStatus, { chip: string; solid: string; icon: IconName }> = {
  HELD: { chip: "bg-lime text-bar", solid: "bg-lime text-bar", icon: "alert" },
  CLEARED: { chip: "bg-ok/15 text-ok", solid: "bg-ok text-bar", icon: "check" },
  BLOCKED: { chip: "bg-bad/15 text-bad", solid: "bg-bad text-bar", icon: "x" },
  REJECTED: { chip: "bg-bad/15 text-bad", solid: "bg-bad text-bar", icon: "slash" },
};

export function StatusChip({ status, className = "" }: { status: BillStatus; className?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full pl-2 pr-3 text-[14px] font-semibold leading-5 ${s.chip} ${className}`}>
      <Icon name={s.icon} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Status mark for dense spots: the icon in a 24px circle, labelled for screen readers. `solid` on a paper background. */
export function StatusMark({ status, solid = false }: { status: BillStatus; solid?: boolean }) {
  const s = STATUS_STYLE[status];
  return (
    <span role="img" aria-label={STATUS_LABEL[status]} className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full ${solid ? s.solid : s.chip}`}>
      <Icon name={s.icon} className="size-[14px]" />
    </span>
  );
}

/** One line of inline error text. */
export function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 text-[14px] font-semibold leading-5 text-bad">
      <Icon name="alert" className="mt-0.5" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Quiet mono tag: Testnet, CREAO, RUN id. */
export function Tag({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex h-6 shrink-0 items-center rounded-full px-2 text-muted shadow-[inset_0_0_0_1px_rgba(140,140,134,0.45)] ${T.label}`}>
      {children}
    </span>
  );
}

export function Money({ value, struck = false, className = "" }: { value: number | null | undefined; struck?: boolean; className?: string }) {
  const text = value === null || value === undefined ? "No amount" : formatUsd(value);
  return <span className={`whitespace-nowrap tabular-nums ${struck ? "line-through decoration-1 opacity-60" : ""} ${className}`}>{text}</span>;
}

/* ---------- Buttons: primary (lime), solid (paper), secondary (outline), text ---------- */

type Kind = "primary" | "solid" | "secondary" | "text";
const BTN: Record<Kind, string> = {
  primary: "bg-lime text-bar hover:brightness-95",
  solid: "bg-paper text-bar hover:brightness-95",
  secondary: "text-paper shadow-[inset_0_0_0_1px_rgba(242,241,236,0.3)] hover:shadow-[inset_0_0_0_1px_rgba(242,241,236,0.6)]",
  text: "text-muted hover:text-paper px-2!",
};

export function Button({ kind = "secondary", className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: Kind }) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-[14px] font-semibold leading-5 outline-none transition-[filter,box-shadow,color] focus-visible:ring-2 focus-visible:ring-paper focus-visible:ring-offset-2 focus-visible:ring-offset-bar disabled:cursor-not-allowed disabled:opacity-40 ${BTN[kind]} ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * Extra information opens here, never by expanding a card. Native <dialog> gives the
 * focus trap, Esc and the top layer; a click on the backdrop closes it too.
 * Mount it to open it; unmounting returns focus to whatever opened it.
 */
export function Modal({ title, sub, aside, footer, onClose, children }: {
  title: ReactNode;
  sub?: ReactNode;
  /** Right side of the header: tabs, tags, status. */
  aside?: ReactNode;
  /** Pinned under the scrolling body, e.g. the Send action. */
  footer?: ReactNode;
  onClose(): void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      opener?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={typeof title === "string" ? title : undefined}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="m-auto max-h-[min(760px,calc(100vh-48px))] w-[min(880px,calc(100vw-32px))] overflow-hidden rounded-[16px] border-0 bg-card p-0 text-paper backdrop:bg-bar/75"
    >
      <div className="relative flex max-h-[inherit] flex-col">
        {/* Close stays top-right even when the aside wraps under the title on narrow screens. */}
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-5 inline-flex size-10 cursor-pointer items-center justify-center rounded-full text-muted outline-none hover:text-paper focus-visible:ring-2 focus-visible:ring-paper">
          <Icon name="close" />
        </button>
        <header className="flex shrink-0 flex-wrap items-start gap-x-4 gap-y-3 border-b border-white/[0.08] pb-4 pl-6 pr-16 pt-6">
          <div className="min-w-0 flex-1 basis-[280px]">
            <h2 className={T.title}>{title}</h2>
            {sub && <p className={`${T.small} mt-1 text-muted`}>{sub}</p>}
          </div>
          {aside && <div className="flex flex-wrap items-center gap-2">{aside}</div>}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-white/[0.08] px-6 py-4">{footer}</footer>}
      </div>
    </dialog>
  );
}

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "2026-10-17" -> "Oct 17". Display only. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "No date";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : DAY.format(d);
}
