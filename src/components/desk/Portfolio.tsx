"use client";

/**
 * Properties & vendors: what is saved in the database, one list at a time.
 * A row opens a side sheet with the details; admins add properties, vendors
 * and utility accounts from here. Display only: counts and filters, no money math.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { formatUsd } from "@/engine/format";
import type { BillView, Property, UsageUnit, UtilityType, Vendor, VendorAccount, VendorKind } from "@/types/bill";
import { errorMessage, type DeskActions, type DeskData } from "./contract";
import { Sheet } from "./Drawers";
import { RAIL_LABEL } from "./story";
import { Field, INPUT } from "./TestBill";
import { Button, ErrorLine, Icon, Money, StatusMark, T } from "./ui";

type Tab = "properties" | "vendors";
type Open = { kind: "property" | "vendor"; id: string } | { kind: "add-property" | "add-vendor" } | null;

const KIND_LABEL: Record<VendorKind, string> = {
  ENROLLED_UTILITY: "Utility",
  KNOWN_CONTRACTOR: "Known contractor",
  UNVERIFIED_CONTRACTOR: "Unverified contractor",
};
const UTILITY_LABEL: Record<UtilityType, string> = { ELECTRIC: "Electric", WATER: "Water", TRASH: "Trash", GAS: "Gas" };
const UTILITY_TYPES = Object.keys(UTILITY_LABEL) as UtilityType[];
const UNITS: UsageUnit[] = ["KWH", "CCF", "THERM", "YD3"];
const DEFAULT_UNIT: Record<UtilityType, UsageUnit | null> = { ELECTRIC: "KWH", WATER: "CCF", GAS: "THERM", TRASH: null };

const ROW = "grid w-full cursor-pointer items-center gap-4 border-t border-white/[0.08] px-6 py-4 text-left outline-none transition-colors hover:bg-white/[0.04] focus-visible:bg-white/[0.06]";

const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
/** A held "needs a property" bill only carries the matcher's guess; it isn't this property's bill yet. */
const atProperty = (b: BillView, id: string) => b.match.property_id === id && !b.decision.reasons.includes("NEEDS_PROPERTY_MATCH");
const has = (q: string, ...fields: string[]) => fields.some((f) => f.toLowerCase().includes(q));

function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "ok" | "bad" }) {
  const cls = tone === "ok" ? "bg-ok/15 text-ok" : tone === "bad" ? "bg-bad/15 text-bad" : "bg-white/[0.06] text-paper";
  return <span className={`inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] leading-4 ${cls}`}>{children}</span>;
}

function KindChip({ vendor }: { vendor: Vendor }) {
  if (vendor.kind === "ENROLLED_UTILITY") return <Chip>Utility · {vendor.utility_type ? UTILITY_LABEL[vendor.utility_type] : "—"}</Chip>;
  if (vendor.kind === "KNOWN_CONTRACTOR") return <Chip tone="ok"><Icon name="check" className="size-3" /> Known contractor</Chip>;
  return <Chip tone="bad"><Icon name="alert" className="size-3" /> Unverified contractor</Chip>;
}

/** `covered`: Test a bill or Policy is open over this view, so its own sheet steps aside. */
export function Portfolio({ data, actions, onBill, covered }: { data: DeskData; actions: DeskActions; onBill(id: string): void; covered: boolean }) {
  const [tab, setTab] = useState<Tab>("properties");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Open>(null);
  const p = data.portfolio;
  const q = query.trim().toLowerCase();

  useEffect(() => {
    if (!open || covered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // In a field, Esc only leaves the field so a half-typed form isn't lost.
      const el = e.target as HTMLElement | null;
      if (el && ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) el.blur();
      else setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, covered]);

  const properties = (p?.properties ?? []).filter((x) => !q || has(q, x.name, x.street, x.city, x.zip));
  const vendors = (p?.vendors ?? []).filter((x) => !q || has(q, x.name, ...x.aliases));
  const accounts = p?.accounts ?? [];

  const segment = (t: Tab, label: string, count: number) => (
    <button
      type="button"
      aria-pressed={tab === t}
      onClick={() => { setTab(t); setQuery(""); }}
      className={`flex h-10 cursor-pointer items-center gap-2 rounded-full px-4 text-[14px] leading-5 outline-none focus-visible:ring-2 focus-visible:ring-paper ${tab === t ? "bg-paper font-semibold text-bar" : "text-muted hover:text-paper"}`}
    >
      {label} <span className={tab === t ? "text-bar/60" : ""}>{count}</span>
    </button>
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex rounded-full bg-card p-1">
            {segment("properties", "Properties", p?.properties.length ?? 0)}
            {segment("vendors", "Vendors", p?.vendors.length ?? 0)}
          </div>
          <label className="w-80 max-w-full">
            <span className="sr-only">Search</span>
            <input className={INPUT} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tab === "properties" ? "Search name or address…" : "Search vendor or other spelling…"} />
          </label>
          <span className="flex-1" />
          <Button kind="solid" onClick={() => setOpen({ kind: tab === "properties" ? "add-property" : "add-vendor" })}>
            <Icon name="plus" /> {tab === "properties" ? "Add property" : "Add vendor"}
          </Button>
        </div>

        {!p ? (
          <div className="h-64 w-full max-w-[960px] animate-pulse rounded-[16px] bg-card" aria-busy="true" aria-label="Loading" />
        ) : tab === "properties" ? (
          <PropertyTable properties={properties} accounts={accounts} bills={data.bills} total={p.properties.length} selected={open?.kind === "property" ? open.id : null} onOpen={(id) => setOpen({ kind: "property", id })} onAdd={() => setOpen({ kind: "add-property" })} />
        ) : (
          <VendorTable vendors={vendors} accounts={accounts} total={p.vendors.length} selected={open?.kind === "vendor" ? open.id : null} onOpen={(id) => setOpen({ kind: "vendor", id })} onAdd={() => setOpen({ kind: "add-vendor" })} />
        )}
      </div>

      {open && p && !covered && (
        <div className="absolute inset-x-0 bottom-0 top-16 z-10 flex justify-end bg-bar/70 p-4" onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
          {open.kind === "property" && (() => {
            const prop = p.properties.find((x) => x.id === open.id);
            return prop ? <PropertySheet property={prop} vendors={p.vendors} accounts={accounts} bills={data.bills} actions={actions} onBill={onBill} onClose={() => setOpen(null)} /> : null;
          })()}
          {open.kind === "vendor" && (() => {
            const vendor = p.vendors.find((x) => x.id === open.id);
            return vendor ? <VendorSheet vendor={vendor} properties={p.properties} accounts={accounts} bills={data.bills} actions={actions} onBill={onBill} onClose={() => setOpen(null)} /> : null;
          })()}
          {open.kind === "add-property" && <AddPropertySheet actions={actions} onClose={() => setOpen(null)} onSaved={(id) => setOpen({ kind: "property", id })} />}
          {open.kind === "add-vendor" && <AddVendorSheet actions={actions} onClose={() => setOpen(null)} onSaved={(id) => setOpen({ kind: "vendor", id })} />}
        </div>
      )}
    </div>
  );
}

/* ---------- Lists ---------- */

function Empty({ total, noun, onAdd }: { total: number; noun: string; onAdd(): void }) {
  return (
    <div className="flex flex-col items-start gap-3 border-t border-white/[0.08] px-6 py-8">
      {total === 0 ? (
        <>
          <p className={T.body}>No {noun} saved yet.</p>
          <Button kind="secondary" onClick={onAdd}><Icon name="plus" /> Add the first one</Button>
        </>
      ) : (
        <p className={`${T.body} text-muted`}>Nothing matches that search.</p>
      )}
    </div>
  );
}

function PropertyTable({ properties, accounts, bills, total, selected, onOpen, onAdd }: {
  properties: Property[]; accounts: VendorAccount[]; bills: BillView[]; total: number; selected: string | null; onOpen(id: string): void; onAdd(): void;
}) {
  const cols = "grid-cols-[1fr_240px_80px_16px]";
  return (
    <div className="w-full max-w-[960px] overflow-hidden rounded-[16px] bg-card">
      <div className={`grid ${cols} gap-4 px-6 py-3 ${T.label} text-muted`}><span>Property</span><span>Services</span><span>Units</span><span /></div>
      {properties.length === 0 ? <Empty total={total} noun="properties" onAdd={onAdd} /> : properties.map((prop) => {
        const services = [...new Set(accounts.filter((a) => a.property_id === prop.id).map((a) => a.utility_type))];
        const needsYou = bills.some((b) => b.status === "HELD" && atProperty(b, prop.id));
        return (
          <button key={prop.id} type="button" onClick={() => onOpen(prop.id)} className={`${ROW} ${cols} ${selected === prop.id ? "bg-white/[0.06]" : ""}`}>
            <span className="min-w-0">
              <span className={`${T.body} flex items-center gap-2 font-semibold`}>
                <span className="truncate">{prop.name}</span>
                {needsYou && <span className="size-2 shrink-0 rounded-full bg-lime" role="img" aria-label="Has a bill that needs you" />}
              </span>
              <span className={`${T.small} block truncate text-muted`}>{prop.street}, {prop.city}</span>
            </span>
            <span className="flex flex-wrap gap-1">
              {services.length ? services.map((s) => <Chip key={s}>{UTILITY_LABEL[s]}</Chip>) : <span className={`${T.small} text-muted`}>No accounts yet</span>}
            </span>
            <span className={`${T.small} ${prop.units.length ? "" : "text-muted"}`}>{prop.units.length || "—"}</span>
            <Icon name="chevron" className="-rotate-90 text-muted" />
          </button>
        );
      })}
    </div>
  );
}

function VendorTable({ vendors, accounts, total, selected, onOpen, onAdd }: {
  vendors: Vendor[]; accounts: VendorAccount[]; total: number; selected: string | null; onOpen(id: string): void; onAdd(): void;
}) {
  const cols = "grid-cols-[1fr_220px_130px_90px_16px]";
  return (
    <div className="w-full max-w-[960px] overflow-hidden rounded-[16px] bg-card">
      <div className={`grid ${cols} gap-4 px-6 py-3 ${T.label} text-muted`}><span>Vendor</span><span>Type</span><span>Pays by</span><span>Properties</span><span /></div>
      {vendors.length === 0 ? <Empty total={total} noun="vendors" onAdd={onAdd} /> : vendors.map((v) => {
        const served = new Set(accounts.filter((a) => a.vendor_id === v.id).map((a) => a.property_id)).size;
        return (
          <button key={v.id} type="button" onClick={() => onOpen(v.id)} className={`${ROW} ${cols} ${selected === v.id ? "bg-white/[0.06]" : ""}`}>
            <span className={`${T.body} truncate font-semibold`}>{v.name}</span>
            <span><KindChip vendor={v} /></span>
            <span className={`${T.small} text-muted`}>{RAIL_LABEL[v.default_rail]}</span>
            <span className={`${T.small} ${served ? "" : "text-muted"}`}>{served || "—"}</span>
            <Icon name="chevron" className="-rotate-90 text-muted" />
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Detail sheets ---------- */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      <h3 className={`${T.label} pb-2 text-muted`}>{title}</h3>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[10px] bg-bar p-4">
      <span className={`${T.label} text-muted`}>{label}</span>
      <span className={`${T.body} font-semibold`}>{value}</span>
    </div>
  );
}

function BillsOnDesk({ bills, onBill }: { bills: BillView[]; onBill(id: string): void }) {
  return (
    <Section title={`On the desk · ${bills.length}`}>
      {bills.length === 0 ? <p className={`${T.small} border-t border-white/[0.08] py-3 text-muted`}>No bills yet.</p> : bills.map((b) => (
        <button key={b.id} type="button" onClick={() => onBill(b.id)} className="flex w-full cursor-pointer items-center gap-3 border-t border-white/[0.08] py-3 text-left outline-none hover:text-paper focus-visible:ring-2 focus-visible:ring-paper">
          <StatusMark status={b.status} />
          <span className={`${T.small} min-w-0 flex-1 truncate`}>{b.vendor_name ?? b.property_name ?? "Unknown"} · {b.extracted.invoice_number.value ?? b.id}</span>
          <Money value={b.amount} struck={b.status === "BLOCKED"} className={`${T.small} font-semibold`} />
          <Icon name="chevron" className="-rotate-90 text-muted" />
        </button>
      ))}
    </Section>
  );
}

function PropertySheet({ property, vendors, accounts, bills, actions, onBill, onClose }: {
  property: Property; vendors: Vendor[]; accounts: VendorAccount[]; bills: BillView[]; actions: DeskActions; onBill(id: string): void; onClose(): void;
}) {
  const here = accounts.filter((a) => a.property_id === property.id);
  const utilities = vendors.filter((v) => v.kind === "ENROLLED_UTILITY");
  return (
    <Sheet title={property.name} sub={`${property.street}, ${property.city}, ${property.state} ${property.zip}`} onClose={onClose}>
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3">
          <Fact label="Units" value={property.units.length ? `${property.units.length} units` : "Not tracked"} />
          <Fact label="Contractor auto-pay up to" value={formatUsd(property.contractor_auto_pay_limit)} />
        </div>
        <Section title={`Utility accounts · ${here.length}`}>
          {here.map((a) => (
            <div key={a.account_number} className="flex items-center gap-3 border-t border-white/[0.08] py-3">
              <span className={`${T.small} min-w-0 flex-1 truncate font-semibold`}>{vendors.find((v) => v.id === a.vendor_id)?.name ?? a.vendor_id}</span>
              <Chip>{UTILITY_LABEL[a.utility_type]}</Chip>
              <span className="w-36 truncate text-right font-mono text-[12px] leading-4 text-muted">{a.account_number}</span>
            </div>
          ))}
          <AddAccountForm actions={actions} fixed={{ property_id: property.id }} choices={utilities.map((v) => ({ id: v.id, label: v.name, type: v.utility_type }))} empty="Add a utility vendor first, then link its account here." />
        </Section>
        <BillsOnDesk bills={bills.filter((b) => atProperty(b, property.id))} onBill={onBill} />
      </div>
    </Sheet>
  );
}

function VendorSheet({ vendor, properties, accounts, bills, actions, onBill, onClose }: {
  vendor: Vendor; properties: Property[]; accounts: VendorAccount[]; bills: BillView[]; actions: DeskActions; onBill(id: string): void; onClose(): void;
}) {
  const mine = accounts.filter((a) => a.vendor_id === vendor.id);
  const utility = vendor.kind === "ENROLLED_UTILITY";
  return (
    <Sheet title={vendor.name} sub={`${KIND_LABEL[vendor.kind]} · pays by ${RAIL_LABEL[vendor.default_rail]}`} onClose={onClose}>
      <div className="flex flex-col gap-6">
        <Section title="Other spellings the matcher accepts">
          <div className="flex flex-wrap gap-2 border-t border-white/[0.08] pt-3">
            {vendor.aliases.length ? vendor.aliases.map((a) => <Chip key={a}>{a}</Chip>) : <span className={`${T.small} text-muted`}>None</span>}
          </div>
        </Section>
        {utility ? (
          <Section title={`Accounts by property · ${mine.length}`}>
            {mine.map((a) => (
              <div key={a.account_number} className="flex items-center gap-3 border-t border-white/[0.08] py-3">
                <span className={`${T.small} min-w-0 flex-1 truncate font-semibold`}>{properties.find((p) => p.id === a.property_id)?.name ?? a.property_id}</span>
                <span className={`${T.small} text-muted`}>{a.usage_unit ?? "Not metered"}</span>
                <span className="w-36 truncate text-right font-mono text-[12px] leading-4 text-muted">{a.account_number}</span>
              </div>
            ))}
            <AddAccountForm actions={actions} fixed={{ vendor_id: vendor.id, type: vendor.utility_type }} choices={properties.map((p) => ({ id: p.id, label: p.name, type: null }))} empty="Add a property first, then link this account to it." />
          </Section>
        ) : (
          <p className={`${T.small} text-muted`}>
            {vendor.kind === "UNVERIFIED_CONTRACTOR"
              ? "Bills from this contractor wait for a person until its identity is verified."
              : "Bills from this contractor are approved on their own when they are at or under the property's auto-pay limit."}
          </p>
        )}
        <BillsOnDesk bills={bills.filter((b) => b.match.vendor_id === vendor.id)} onBill={onBill} />
      </div>
    </Sheet>
  );
}

/* ---------- Admin forms ---------- */

function useSave() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save<T>(run: () => Promise<T>, done: (value: T) => void) {
    setBusy(true);
    setError(null);
    try {
      done(await run());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, save };
}

function FormFooter({ busy, error, label, onCancel }: { busy: boolean; error: string | null; label: string; onCancel(): void }) {
  return (
    <div className="col-span-2 flex flex-col gap-3 border-t border-white/[0.08] pt-4">
      {error && <ErrorLine>{error}</ErrorLine>}
      <div className="flex gap-2">
        <Button kind="solid" type="submit" disabled={busy}>{busy ? "Saving…" : label}</Button>
        <Button kind="text" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function AddPropertySheet({ actions, onClose, onSaved }: { actions: DeskActions; onClose(): void; onSaved(id: string): void }) {
  const [f, setF] = useState({ name: "", street: "", city: "", state: "", zip: "", units: "", limit: "" });
  const { busy, error, save } = useSave();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  function submit(e: FormEvent) {
    e.preventDefault();
    void save(
      () => actions.addProperty({ name: f.name, street: f.street, city: f.city, state: f.state, zip: f.zip, units: split(f.units), contractor_auto_pay_limit: f.limit.trim() === "" ? NaN : Number(f.limit) }),
      (p) => onSaved(p.id),
    );
  }
  return (
    <Sheet title="Add property" sub="Bills match to a property by its address or a linked utility account." onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-x-3 gap-y-4">
        <Field label="Name" wide><input className={INPUT} value={f.name} onChange={set("name")} placeholder="e.g. Mission Bay Flats" autoFocus /></Field>
        <Field label="Street" wide><input className={INPUT} value={f.street} onChange={set("street")} placeholder="e.g. 500 Channel St" /></Field>
        <Field label="City"><input className={INPUT} value={f.city} onChange={set("city")} /></Field>
        <div className="grid min-w-0 grid-cols-[80px_1fr] gap-2">
          <Field label="State"><input className={INPUT} value={f.state} onChange={set("state")} maxLength={2} placeholder="CA" /></Field>
          <Field label="ZIP"><input className={INPUT} value={f.zip} onChange={set("zip")} inputMode="numeric" maxLength={5} /></Field>
        </div>
        <Field label="Unit numbers, comma-separated" wide><input className={INPUT} value={f.units} onChange={set("units")} placeholder="Leave empty if units aren't tracked" /></Field>
        <Field label="Contractor auto-pay limit (USD)" wide><input className={INPUT} value={f.limit} onChange={set("limit")} inputMode="decimal" placeholder="e.g. 1500" /></Field>
        <p className={`${T.small} col-span-2 -mt-2 text-muted`}>Contractor bills at or under this amount are approved without a person. Utilities don&apos;t use it.</p>
        <FormFooter busy={busy} error={error} label="Save property" onCancel={onClose} />
      </form>
    </Sheet>
  );
}

function AddVendorSheet({ actions, onClose, onSaved }: { actions: DeskActions; onClose(): void; onSaved(id: string): void }) {
  const [f, setF] = useState<{ name: string; aliases: string; kind: VendorKind; type: UtilityType | "" }>({ name: "", aliases: "", kind: "ENROLLED_UTILITY", type: "" });
  const { busy, error, save } = useSave();
  const utility = f.kind === "ENROLLED_UTILITY";
  function submit(e: FormEvent) {
    e.preventDefault();
    void save(
      () => actions.addVendor({ name: f.name, aliases: split(f.aliases), kind: f.kind, utility_type: utility && f.type ? f.type : null }),
      (v) => onSaved(v.id),
    );
  }
  return (
    <Sheet title="Add vendor" sub="Bills match to a vendor by its name or any other spelling listed here." onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-x-3 gap-y-4">
        <Field label="Name" wide><input className={INPUT} value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} autoFocus /></Field>
        <Field label="Type" wide={!utility}>
          <select className={`${INPUT} cursor-pointer`} value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value as VendorKind }))}>
            {(Object.keys(KIND_LABEL) as VendorKind[]).map((k) => <option key={k} value={k} className="bg-card">{KIND_LABEL[k]}</option>)}
          </select>
        </Field>
        {utility && (
          <Field label="Supplies">
            <select className={`${INPUT} cursor-pointer`} value={f.type} onChange={(e) => setF((x) => ({ ...x, type: e.target.value as UtilityType | "" }))}>
              <option value="" className="bg-card">Choose…</option>
              {UTILITY_TYPES.map((t) => <option key={t} value={t} className="bg-card">{UTILITY_LABEL[t]}</option>)}
            </select>
          </Field>
        )}
        <Field label="Other spellings on bills, comma-separated" wide><input className={INPUT} value={f.aliases} onChange={(e) => setF((x) => ({ ...x, aliases: e.target.value }))} placeholder="Optional" /></Field>
        <p className={`${T.small} col-span-2 -mt-2 text-muted`}>
          {utility
            ? "Utilities are paid through their portal. Link an account to each property they serve."
            : f.kind === "KNOWN_CONTRACTOR"
              ? "Paid by ACH. Approved on their own up to each property's auto-pay limit."
              : "Paid by ACH, but every bill waits for a person until the vendor is verified."}
        </p>
        <FormFooter busy={busy} error={error} label="Save vendor" onCancel={onClose} />
      </form>
    </Sheet>
  );
}

/** Link a utility account. On a property, pick the utility; on a utility, pick the property. */
function AddAccountForm({ actions, fixed, choices, empty }: {
  actions: DeskActions;
  fixed: { property_id: string } | { vendor_id: string; type: UtilityType | null };
  choices: Array<{ id: string; label: string; type: UtilityType | null }>;
  empty: string;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState("");
  const [number, setNumber] = useState("");
  const [unit, setUnit] = useState<UsageUnit | "" | null>(null);
  const { busy, error, save } = useSave();
  const type = "type" in fixed ? fixed.type : (choices.find((c) => c.id === choice)?.type ?? null);
  const shownUnit = unit ?? (type ? DEFAULT_UNIT[type] ?? "" : "");

  if (choices.length === 0) return <p className={`${T.small} border-t border-white/[0.08] py-3 text-muted`}>{empty}</p>;
  if (!open) {
    return (
      <div className="border-t border-white/[0.08] pt-3">
        <Button kind="text" onClick={() => setOpen(true)}><Icon name="plus" /> Link an account</Button>
      </div>
    );
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const ids = "property_id" in fixed ? { property_id: fixed.property_id, vendor_id: choice } : { vendor_id: fixed.vendor_id, property_id: choice };
    void save(() => actions.addAccount({ ...ids, account_number: number, usage_unit: shownUnit || null }), () => {
      setOpen(false);
      setChoice("");
      setNumber("");
      setUnit(null);
    });
  }
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-x-3 gap-y-4 border-t border-white/[0.08] pt-4">
      <Field label={"property_id" in fixed ? "Utility" : "Property"} wide>
        <select className={`${INPUT} cursor-pointer`} value={choice} onChange={(e) => { setChoice(e.target.value); setUnit(null); }} autoFocus>
          <option value="" className="bg-card">Choose…</option>
          {choices.map((c) => <option key={c.id} value={c.id} className="bg-card">{c.label}</option>)}
        </select>
      </Field>
      <Field label="Account number"><input className={`${INPUT} font-mono`} value={number} onChange={(e) => setNumber(e.target.value)} placeholder="As printed on the bill" /></Field>
      <Field label="Usage unit">
        <select className={`${INPUT} cursor-pointer`} value={shownUnit} onChange={(e) => setUnit(e.target.value as UsageUnit | "")}>
          <option value="" className="bg-card">Not metered</option>
          {UNITS.map((u) => <option key={u} value={u} className="bg-card">{u}</option>)}
        </select>
      </Field>
      <FormFooter busy={busy} error={error} label="Save account" onCancel={() => setOpen(false)} />
    </form>
  );
}
