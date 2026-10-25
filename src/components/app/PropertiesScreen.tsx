"use client";

/**
 * Properties: the saved portfolio, one row per property, and a page per property.
 * Usage trends reuse the SPIKE check's own baseline from the newest bill per utility,
 * so the chart shows exactly what the engine compared. Counts only, no money math.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatUsd } from "@/engine/format";
import { spikeSeries, SpikeEvidence } from "../desk/Evidence";
import { Button, CARD, Icon, shortDate, T } from "../desk/ui";
import { useApp } from "./AppProvider";
import { BillLinks, Empty, Loading, Overlay, Screen, ScreenHeader } from "./kit";
import { AddAccountForm, AddPropertySheet, atProperty, Chip, UTILITY_LABEL } from "./portfolio";

export function PropertiesScreen() {
  const router = useRouter();
  const { data, actions } = useApp();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const p = data.portfolio;
  const q = query.trim().toLowerCase();
  const rows = (p?.properties ?? []).filter((x) => !q || [x.name, x.street, x.city, x.zip].some((f) => f.toLowerCase().includes(q)));

  return (
    <Screen>
      <ScreenHeader
        title="Properties"
        sub="Bills match to a property by its utility account or its address."
        actions={<>
          <label className="w-64">
            <span className="sr-only">Search</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or address…"
              className="h-10 w-full rounded-full bg-card px-4 text-[14px] text-paper outline-none placeholder:text-muted focus:shadow-[inset_0_0_0_1px_rgba(242,241,236,0.5)]" />
          </label>
          <Button kind="solid" onClick={() => setAdding(true)}><Icon name="plus" /> Add property</Button>
        </>}
      />
      {!p ? <Loading /> : p.properties.length === 0 ? (
        <Empty action={<Button kind="secondary" onClick={() => setAdding(true)}><Icon name="plus" /> Add the first property</Button>}>No properties saved yet.</Empty>
      ) : (
        <div className="overflow-hidden rounded-[16px] bg-card">
          <div className={`grid grid-cols-[minmax(0,1fr)_240px_80px_120px_16px] gap-4 px-6 py-3 ${T.label} text-muted`}><span>Property</span><span>Utilities</span><span>Units</span><span>Needs you</span><span /></div>
          {rows.length === 0 && <p className={`${T.body} border-t border-white/[0.08] px-6 py-6 text-muted`}>Nothing matches that search.</p>}
          {rows.map((prop) => {
            const services = [...new Set(p.accounts.filter((a) => a.property_id === prop.id).map((a) => a.utility_type))];
            const needs = data.bills.filter((b) => b.status === "HELD" && atProperty(b, prop.id)).length;
            return (
              <Link key={prop.id} href={`/properties/${encodeURIComponent(prop.id)}`}
                className="grid grid-cols-[minmax(0,1fr)_240px_80px_120px_16px] items-center gap-4 border-t border-white/[0.08] px-6 py-4 outline-none transition-colors hover:bg-white/[0.04] focus-visible:bg-white/[0.06]">
                <span className="min-w-0">
                  <span className={`${T.body} block truncate font-semibold`}>{prop.name}</span>
                  <span className={`${T.small} block truncate text-muted`}>{prop.street}, {prop.city}</span>
                </span>
                <span className="flex flex-wrap gap-1">
                  {services.length ? services.map((s) => <Chip key={s}>{UTILITY_LABEL[s]}</Chip>) : <span className={`${T.small} text-muted`}>None linked</span>}
                </span>
                <span className={`${T.small} ${prop.units.length ? "" : "text-muted"}`}>{prop.units.length || "—"}</span>
                <span className={`${T.small} ${needs ? "font-semibold text-lime" : "text-muted"}`}>{needs ? `${needs} bill${needs > 1 ? "s" : ""}` : "—"}</span>
                <Icon name="chevron" className="-rotate-90 text-muted" />
              </Link>
            );
          })}
        </div>
      )}
      {adding && (
        <Overlay onClose={() => setAdding(false)}>
          <AddPropertySheet actions={actions} onClose={() => setAdding(false)} onSaved={(id) => router.push(`/properties/${encodeURIComponent(id)}`)} />
        </Overlay>
      )}
    </Screen>
  );
}

export function PropertyScreen({ id }: { id: string }) {
  const { data, actions } = useApp();
  const p = data.portfolio;
  if (!p) return <Screen><Loading rows={3} /></Screen>;
  const prop = p.properties.find((x) => x.id === id);
  if (!prop) return <Screen><ScreenHeader title="Property not found" back={{ href: "/properties", label: "Properties" }} /></Screen>;

  const accounts = p.accounts.filter((a) => a.property_id === prop.id);
  const bills = data.bills.filter((b) => atProperty(b, prop.id));
  const needs = bills.filter((b) => b.status === "HELD").length;
  const utilities = p.vendors.filter((v) => v.kind === "ENROLLED_UTILITY");
  // Newest bill per linked utility that carries a usage or amount baseline.
  const trends = accounts.flatMap((a) => {
    const bill = bills.find((b) => b.match.vendor_id === a.vendor_id && spikeSeries(b) !== null);
    return bill ? [{ account: a, bill }] : [];
  });

  return (
    <Screen>
      <ScreenHeader back={{ href: "/properties", label: "Properties" }} title={prop.name} sub={`${prop.street}, ${prop.city}, ${prop.state} ${prop.zip}`} />
      <div className="grid grid-cols-3 gap-4">
        <Fact label="Needs you" value={needs ? `${needs} bill${needs > 1 ? "s" : ""}` : "Nothing"} strong={needs > 0} />
        <Fact label="Contractor auto-pay up to" value={formatUsd(prop.contractor_auto_pay_limit)} />
        <Fact label="Units" value={prop.units.length ? `${prop.units.length} units` : "Not tracked"} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <h2 className={`${T.label} text-muted`}>Usage vs usual</h2>
          {trends.length === 0 ? (
            <Empty>No usage history yet. It shows once a utility bill here has past bills to compare against.</Empty>
          ) : trends.map(({ account, bill }) => (
            <section key={account.account_number} className={`${CARD} flex flex-col gap-4`}>
              <div className="flex items-baseline gap-2">
                <h3 className={`${T.body} font-semibold`}>{UTILITY_LABEL[account.utility_type]} · {bill.vendor_name}</h3>
                <Link href={`/bills/${encodeURIComponent(bill.id)}`} className={`${T.small} ml-auto text-muted hover:text-paper`}>From the {shortDate(bill.extracted.due_date.value)} bill →</Link>
              </div>
              <SpikeEvidence bill={bill} />
            </section>
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <section className={`${CARD} flex flex-col gap-3`}>
            <h2 className={`${T.label} text-muted`}>Bills · {bills.length}</h2>
            <BillLinks bills={bills} show="vendor" />
          </section>
          <section className={`${CARD} flex flex-col`}>
            <h2 className={`${T.label} pb-2 text-muted`}>Utility accounts · {accounts.length}</h2>
            {accounts.map((a) => (
              <div key={a.account_number} className="flex items-center gap-3 border-t border-white/[0.08] py-3">
                <span className={`${T.small} min-w-0 flex-1 truncate font-semibold`}>{p.vendors.find((v) => v.id === a.vendor_id)?.name ?? "Unknown utility"}</span>
                <Chip>{UTILITY_LABEL[a.utility_type]}</Chip>
                <span className="w-36 truncate text-right font-mono text-[12px] leading-4 text-muted" title="Account number as printed on the bill">{a.account_number}</span>
              </div>
            ))}
            <AddAccountForm actions={actions} fixed={{ property_id: prop.id }} choices={utilities.map((v) => ({ id: v.id, label: v.name, type: v.utility_type }))} empty="Add a utility vendor first, then link its account here." />
          </section>
        </div>
      </div>
    </Screen>
  );
}

export function Fact({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`${CARD} flex flex-col gap-1 py-4 ${strong ? "shadow-[inset_0_0_0_2px_var(--color-lime)]" : ""}`}>
      <span className={`${T.label} text-muted`}>{label}</span>
      <span className={`${T.title} ${strong ? "text-lime" : ""}`}>{value}</span>
    </div>
  );
}
