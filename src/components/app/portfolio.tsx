"use client";

/**
 * Properties and vendors: shared chips and the admin forms (add property, add vendor,
 * link a utility account). Validation is deterministic in src/portfolio/admin.ts.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import type { BillView, UsageUnit, UtilityType, Vendor, VendorKind } from "@/types/bill";
import { errorMessage, type DeskActions } from "../desk/contract";
import { Sheet } from "../desk/Drawers";
import { Field, INPUT } from "../desk/TestBill";
import { Button, ErrorLine, Icon, T } from "../desk/ui";

export const KIND_LABEL: Record<VendorKind, string> = {
  ENROLLED_UTILITY: "Utility",
  KNOWN_CONTRACTOR: "Known contractor",
  UNVERIFIED_CONTRACTOR: "Unverified contractor",
};
export const UTILITY_LABEL: Record<UtilityType, string> = { ELECTRIC: "Electric", WATER: "Water", TRASH: "Trash", GAS: "Gas" };
const UTILITY_TYPES = Object.keys(UTILITY_LABEL) as UtilityType[];
const UNITS: UsageUnit[] = ["KWH", "CCF", "THERM", "YD3"];
const DEFAULT_UNIT: Record<UtilityType, UsageUnit | null> = { ELECTRIC: "KWH", WATER: "CCF", GAS: "THERM", TRASH: null };

const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
/** A held "needs a property" bill only carries the matcher's guess; it isn't this property's bill yet. */
export const atProperty = (b: BillView, id: string) => b.match.property_id === id && !b.decision.reasons.includes("NEEDS_PROPERTY_MATCH");

export function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "ok" | "bad" }) {
  const cls = tone === "ok" ? "bg-ok/15 text-ok" : tone === "bad" ? "bg-bad/15 text-bad" : "bg-white/[0.06] text-paper";
  return <span className={`inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] leading-4 ${cls}`}>{children}</span>;
}

export function KindChip({ vendor }: { vendor: Vendor }) {
  if (vendor.kind === "ENROLLED_UTILITY") return <Chip>Utility · {vendor.utility_type ? UTILITY_LABEL[vendor.utility_type] : "—"}</Chip>;
  if (vendor.kind === "KNOWN_CONTRACTOR") return <Chip tone="ok"><Icon name="check" className="size-3" /> Known contractor</Chip>;
  return <Chip tone="bad"><Icon name="alert" className="size-3" /> Unverified contractor</Chip>;
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

export function AddPropertySheet({ actions, onClose, onSaved }: { actions: DeskActions; onClose(): void; onSaved(id: string): void }) {
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

export function AddVendorSheet({ actions, onClose, onSaved }: { actions: DeskActions; onClose(): void; onSaved(id: string): void }) {
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
export function AddAccountForm({ actions, fixed, choices, empty }: {
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
