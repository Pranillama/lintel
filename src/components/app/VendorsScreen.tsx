"use client";

/**
 * Vendors: who Lintel will pay and how, and a page per vendor with its trust status.
 * Trust shows the vendor file's kind plus the newest CRS result on a saved bill;
 * nothing is invented when CRS did not run. Counts only, no spend totals.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BillView, Vendor } from "@/types/bill";
import { RAIL_LABEL } from "../desk/story";
import { Button, CARD, Icon, shortDate, T } from "../desk/ui";
import { useApp } from "./AppProvider";
import { BillLinks, Empty, Loading, Overlay, Screen, ScreenHeader } from "./kit";
import { AddAccountForm, AddVendorSheet, Chip, KindChip } from "./portfolio";
import { Fact } from "./PropertiesScreen";

const TRUST_TEXT: Record<Vendor["kind"], string> = {
  ENROLLED_UTILITY: "Enrolled utility. Paid through its portal when the account number matches and nothing looks off.",
  KNOWN_CONTRACTOR: "Onboarded contractor. Approved on its own up to each property's auto-pay limit.",
  UNVERIFIED_CONTRACTOR: "In the vendor file, but its identity isn't verified. Every bill waits for a person.",
};

/** The newest saved CRS result for this vendor, if CRS ever ran on one of its bills. */
function lastCrs(bills: BillView[]): BillView | undefined {
  return bills.find((b) => b.crs.outcome !== "NOT_RUN");
}

const CRS_WORD = { PASS: "Passed", FLAGGED: "Flagged", UNAVAILABLE: "Didn't answer", NOT_RUN: "Not run" } as const;

export function VendorsScreen() {
  const router = useRouter();
  const { data, actions } = useApp();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const p = data.portfolio;
  const q = query.trim().toLowerCase();
  const rows = (p?.vendors ?? []).filter((v) => !q || [v.name, ...v.aliases].some((f) => f.toLowerCase().includes(q)));
  const cols = "grid-cols-[minmax(0,1fr)_200px_130px_100px_120px_16px]";

  return (
    <Screen>
      <ScreenHeader
        title="Vendors"
        sub="Bills match to a vendor by its name or any other spelling listed on its page."
        actions={<>
          <label className="w-64">
            <span className="sr-only">Search</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search vendor or spelling…"
              className="h-10 w-full rounded-full bg-card px-4 text-[14px] text-paper outline-none placeholder:text-muted focus:shadow-[inset_0_0_0_1px_rgba(242,241,236,0.5)]" />
          </label>
          <Button kind="solid" onClick={() => setAdding(true)}><Icon name="plus" /> Add vendor</Button>
        </>}
      />
      {!p ? <Loading /> : p.vendors.length === 0 ? (
        <Empty action={<Button kind="secondary" onClick={() => setAdding(true)}><Icon name="plus" /> Add the first vendor</Button>}>No vendors saved yet.</Empty>
      ) : (
        <div className="overflow-hidden rounded-[16px] bg-card">
          <div className={`grid ${cols} gap-4 px-6 py-3 ${T.label} text-muted`}><span>Vendor</span><span>Type</span><span>Pays by</span><span>Properties</span><span>Needs you</span><span /></div>
          {rows.length === 0 && <p className={`${T.body} border-t border-white/[0.08] px-6 py-6 text-muted`}>Nothing matches that search.</p>}
          {rows.map((v) => {
            const served = new Set(p.accounts.filter((a) => a.vendor_id === v.id).map((a) => a.property_id)).size;
            const needs = data.bills.filter((b) => b.status === "HELD" && b.match.vendor_id === v.id).length;
            return (
              <Link key={v.id} href={`/vendors/${encodeURIComponent(v.id)}`}
                className={`grid ${cols} items-center gap-4 border-t border-white/[0.08] px-6 py-4 outline-none transition-colors hover:bg-white/[0.04] focus-visible:bg-white/[0.06]`}>
                <span className={`${T.body} truncate font-semibold`}>{v.name}</span>
                <span><KindChip vendor={v} /></span>
                <span className={`${T.small} text-muted`}>{RAIL_LABEL[v.default_rail]}</span>
                <span className={`${T.small} ${served ? "" : "text-muted"}`}>{served || "—"}</span>
                <span className={`${T.small} ${needs ? "font-semibold text-lime" : "text-muted"}`}>{needs ? `${needs} bill${needs > 1 ? "s" : ""}` : "—"}</span>
                <Icon name="chevron" className="-rotate-90 text-muted" />
              </Link>
            );
          })}
        </div>
      )}
      {adding && (
        <Overlay onClose={() => setAdding(false)}>
          <AddVendorSheet actions={actions} onClose={() => setAdding(false)} onSaved={(id) => router.push(`/vendors/${encodeURIComponent(id)}`)} />
        </Overlay>
      )}
    </Screen>
  );
}

export function VendorScreen({ id }: { id: string }) {
  const { data, actions } = useApp();
  const p = data.portfolio;
  if (!p) return <Screen><Loading rows={3} /></Screen>;
  const vendor = p.vendors.find((v) => v.id === id);
  if (!vendor) return <Screen><ScreenHeader title="Vendor not found" back={{ href: "/vendors", label: "Vendors" }} /></Screen>;

  const bills = data.bills.filter((b) => b.match.vendor_id === vendor.id);
  const needs = bills.filter((b) => b.status === "HELD").length;
  const accounts = p.accounts.filter((a) => a.vendor_id === vendor.id);
  const utility = vendor.kind === "ENROLLED_UTILITY";
  const crs = lastCrs(bills);
  const trusted = vendor.kind !== "UNVERIFIED_CONTRACTOR" && crs?.crs.outcome !== "FLAGGED";

  return (
    <Screen>
      <ScreenHeader back={{ href: "/vendors", label: "Vendors" }} title={<span className="flex items-center gap-3">{vendor.name}<KindChip vendor={vendor} /></span>} />
      <div className="grid grid-cols-3 gap-4">
        <Fact label="Needs you" value={needs ? `${needs} bill${needs > 1 ? "s" : ""}` : "Nothing"} strong={needs > 0} />
        <Fact label="Pays by" value={RAIL_LABEL[vendor.default_rail]} />
        <Fact label="Properties served" value={String(new Set(accounts.map((a) => a.property_id)).size || "—")} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className={`${CARD} flex flex-col gap-3 ${trusted ? "" : "shadow-[inset_0_0_0_2px_var(--color-bad)]"}`}>
            <div className="flex items-center gap-2">
              <span className={trusted ? "text-ok" : "text-bad"}><Icon name={trusted ? "check" : "alert"} /></span>
              <h2 className={`${T.body} font-semibold`}>{trusted ? "Trusted to pay" : "Not trusted to pay on its own"}</h2>
            </div>
            <p className={`${T.body} text-muted`}>{TRUST_TEXT[vendor.kind]}</p>
            <div className="flex items-center gap-3 border-t border-white/[0.08] pt-3">
              <span className={`${T.small} w-44 shrink-0 text-muted`}>CRS identity check</span>
              {crs ? (
                <span className={`${T.small} ${crs.crs.outcome === "PASS" ? "text-ok" : "text-bad"}`}>{CRS_WORD[crs.crs.outcome]} · on the {shortDate(crs.extracted.due_date.value)} bill</span>
              ) : <span className={`${T.small} text-muted`}>Not run at this desk yet</span>}
            </div>
            {crs && crs.crs.signals.length > 0 && (
              <div className="flex flex-wrap gap-2">{crs.crs.signals.map((s) => <Chip key={s} tone={crs.crs.outcome === "FLAGGED" ? "bad" : "plain"}>{s}</Chip>)}</div>
            )}
          </section>
          <section className={`${CARD} flex flex-col gap-3`}>
            <h2 className={`${T.label} text-muted`}>Other spellings Lintel accepts</h2>
            <div className="flex flex-wrap gap-2">{vendor.aliases.length ? vendor.aliases.map((a) => <Chip key={a}>{a}</Chip>) : <span className={`${T.small} text-muted`}>None</span>}</div>
          </section>
          {utility && (
            <section className={`${CARD} flex flex-col`}>
              <h2 className={`${T.label} pb-2 text-muted`}>Accounts by property · {accounts.length}</h2>
              {accounts.map((a) => (
                <div key={a.account_number} className="flex items-center gap-3 border-t border-white/[0.08] py-3">
                  <Link href={`/properties/${encodeURIComponent(a.property_id)}`} className={`${T.small} min-w-0 flex-1 truncate font-semibold hover:underline`}>{p.properties.find((x) => x.id === a.property_id)?.name ?? "Unknown property"}</Link>
                  <span className={`${T.small} text-muted`}>{a.usage_unit ?? "Not metered"}</span>
                  <span className="w-36 truncate text-right font-mono text-[12px] leading-4 text-muted" title="Account number as printed on the bill">{a.account_number}</span>
                </div>
              ))}
              <AddAccountForm actions={actions} fixed={{ vendor_id: vendor.id, type: vendor.utility_type }} choices={p.properties.map((x) => ({ id: x.id, label: x.name, type: null }))} empty="Add a property first, then link this account to it." />
            </section>
          )}
        </div>
        <section className={`${CARD} flex h-fit min-w-0 flex-col gap-3`}>
          <h2 className={`${T.label} text-muted`}>Bills · {bills.length}</h2>
          <BillLinks bills={bills} show="property" />
        </section>
      </div>
    </Screen>
  );
}
