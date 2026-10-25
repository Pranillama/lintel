"use client";

/**
 * The app shell: one top bar (Inbox, Properties, Vendors, Audit log · Policy, Upload a bill)
 * and one quiet totals strip, on every screen. Totals and the chain flag come from listBills.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Icon, Money, T } from "../desk/ui";
import { useApp } from "./AppProvider";
import { UploadDrawer } from "./UploadDrawer";

const NAV = [
  { href: "/inbox", label: "Inbox", match: ["/inbox", "/bills"] },
  { href: "/properties", label: "Properties", match: ["/properties"] },
  { href: "/vendors", label: "Vendors", match: ["/vendors"] },
  { href: "/audit", label: "Audit log", match: ["/audit"] },
];

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-paper";

export function isTyping(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { data, uploadOpen, setUploadOpen } = useApp();
  const t = data.loading ? undefined : data.totals;
  const on = (prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "j" || e.key === "J") && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault();
        setUploadOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setUploadOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-bar text-paper">
      <header className="sticky top-0 z-30 bg-bar">
        <div className="flex h-16 items-center gap-8 border-b border-white/[0.08] px-6">
          <Link href="/" className={`flex shrink-0 items-center gap-2 rounded-[10px] text-[24px] font-semibold leading-8 tracking-[-0.02em] ${FOCUS}`} title="Back to the printer">
            <PrinterMark /> Lintel
          </Link>
          <nav aria-label="Main" className="flex min-w-0 flex-1 items-center gap-1">
            {NAV.map((n) => {
              const active = on(n.match);
              return (
                <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                  className={`flex h-10 items-center gap-2 whitespace-nowrap rounded-full px-4 text-[14px] leading-5 transition-colors ${FOCUS} ${active ? "bg-paper font-semibold text-bar" : "text-muted hover:text-paper"}`}>
                  {n.label}
                  {n.href === "/inbox" && t && t.count.held > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-lime px-1.5 font-mono text-[12px] font-bold leading-4 text-bar" aria-label={`${t.count.held} need you`}>{t.count.held}</span>
                  )}
                </Link>
              );
            })}
          </nav>
          <Link href="/policy" aria-current={on(["/policy"]) ? "page" : undefined}
            className={`flex h-10 items-center rounded-full px-3 text-[14px] leading-5 ${FOCUS} ${on(["/policy"]) ? "font-semibold text-paper" : "text-muted hover:text-paper"}`}>
            Policy
          </Link>
          <button type="button" onClick={() => setUploadOpen(true)} aria-haspopup="dialog" aria-expanded={uploadOpen}
            className={`inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-paper px-4 text-[14px] font-semibold leading-5 text-bar hover:brightness-95 ${FOCUS}`}>
            <Icon name="plus" /> Upload a bill
            <kbd className="ml-1 rounded-[4px] px-1 font-mono text-[12px] leading-4 text-bar/60 shadow-[inset_0_0_0_1px_rgba(10,10,10,0.25)]">J</kbd>
          </button>
        </div>
        <div className="flex h-10 items-center gap-6 overflow-x-auto border-b border-white/[0.08] bg-card/40 px-6 [scrollbar-width:none]">
          <span className={`${T.label} shrink-0 text-muted`}>Today</span>
          <Total href="/inbox?status=held" dot="bg-lime" label="Needs you" value={t?.held} count={t?.count.held} strong />
          <Total href="/inbox?status=blocked" dot="bg-bad" label="Blocked" value={t?.blocked} count={t?.count.blocked} />
          <Total href="/inbox?status=cleared" dot="bg-ok" label="Cleared" value={t?.cleared} count={t?.count.cleared} />
          <span className="flex-1" />
          <Link href="/audit" title="Every bill's history is chained and re-checked on every load"
            className={`${T.small} flex shrink-0 items-center gap-1 rounded-full ${FOCUS} ${data.auditChainIntact ? "text-muted hover:text-paper" : "font-semibold text-bad"}`}>
            <Icon name={data.auditChainIntact ? "check" : "x"} className={data.auditChainIntact ? "text-ok" : ""} />
            {data.auditChainIntact ? "Audit trail intact" : "Audit trail broken"}
          </Link>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {uploadOpen && <UploadDrawer onClose={() => setUploadOpen(false)} />}
    </div>
  );
}

function Total({ href, dot, label, value, count, strong = false }: { href: string; dot: string; label: string; value: number | undefined; count: number | undefined; strong?: boolean }) {
  return (
    <Link href={href} className={`flex shrink-0 items-center gap-2 rounded-full ${FOCUS} ${strong ? "text-paper" : "text-muted hover:text-paper"}`}>
      <span className={`size-2 rounded-full ${dot}`} aria-hidden />
      <span className={T.small}>{label}</span>
      <Money value={value ?? 0} className={`${T.small} font-semibold`} />
      {count !== undefined && <span className={`${T.small} text-muted`}>· {count}</span>}
    </Link>
  );
}

/** The brand mark: a receipt coming out of a slot. */
export function PrinterMark() {
  return (
    <span aria-hidden className="relative inline-block h-4 w-[22px] rounded-[4px] bg-gradient-to-b from-[#3a3a3a] to-[#1a1a1a]">
      <span className="absolute -top-1.5 left-[5px] right-[5px] h-[9px] rounded-[1px] bg-paper" />
    </span>
  );
}
