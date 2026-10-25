"use client";

import { useState, type ReactNode } from "react";
import { humanRefusal } from "@/engine/human";
import type { BillView, MatchResult, Property } from "@/types/bill";
import { errorMessage, type DeskActions } from "./desk";

/** Splits a raw address so the trailing unit token (#B, Unit 4, Apt 2C) can be highlighted. Display only. */
function splitUnit(address: string): [string, string | null] {
  const m = address.match(/^(.*?)[\s,]*((?:#|\b(?:unit|apt|ste|suite)\s*#?)\s*[\w-]+)\s*$/i);
  return m ? [m[1], m[2]] : [address, null];
}

function rawAddress(bill: BillView): string | null {
  return bill.extracted.service_address.source_snippet ?? bill.extracted.service_address.value;
}

function Chip({ children, tone }: { children: ReactNode; tone: "lime" | "dark" }) {
  return (
    <span className={`label-mono shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${tone === "lime" ? "bg-bar text-lime" : "bg-raised text-muted"}`}>
      {children}
    </span>
  );
}

/**
 * NEEDS_PROPERTY_MATCH: two grid cells sharing one assign state.
 * Left (dark): the address as printed, unit highlighted, plus "choose another property".
 * Right (lime): the top candidate and "Assign and remember this address".
 */
export function MatchAssignCards({ bill, properties, actions }: { bill: BillView; properties: Property[]; actions: DeskActions }) {
  const [chosen, setChosen] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refusal = humanRefusal(bill, "assign", bill.investigation);
  const top = bill.match.candidates[0];
  const address = rawAddress(bill);
  const [street, unit] = address ? splitUnit(address) : ["No service address on the bill", null];

  async function assign(propertyId: string) {
    setBusy(true);
    setError(null);
    try {
      await actions.assign(bill.id, propertyId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const disabled = refusal !== null || busy;

  return (
    <>
      <section className="card overflow-y-auto" aria-label="Address on the bill">
        <p className="text-[14px] text-muted">On the bill</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[clamp(28px,3.2vw,44px)] font-light leading-tight tracking-tight">
          <span className="min-w-0 break-words">{street}</span>
          {unit && <mark className="rounded-[12px] bg-lime px-2 text-bar">{unit}</mark>}
        </p>
        {bill.match.address_key && (
          <p className="text-[12.5px] text-muted">
            Lintel will remember <span className="font-mono text-paper">{bill.match.address_key}</span>
          </p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-2.5">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Choose another property</span>
            <select
              value={chosen}
              onChange={(e) => setChosen(e.target.value)}
              disabled={disabled || properties.length === 0}
              className="focus-ring w-full rounded-full bg-transparent px-4 py-2.5 text-[14px] font-semibold shadow-[inset_0_0_0_1.5px_currentColor] disabled:opacity-40"
            >
              <option value="" className="bg-card">Choose another property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id} className="bg-card">
                  {p.name} · {p.street}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-light px-5 py-2.5 text-[14px]" disabled={disabled || chosen === ""} onClick={() => assign(chosen)}>
            Assign and remember
          </button>
        </div>
      </section>

      <section className="card card-lime" aria-label="Suggested property">
        {top ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <h3 className="card-title min-w-0 truncate">{top.property_name}</h3>
              <Chip tone="lime">
                {bill.match.method} · {top.score.toFixed(2)}
              </Chip>
            </div>
            <p title={top.reason} className="line-clamp-3 text-[14px] leading-snug">{top.reason}</p>
          </>
        ) : (
          <>
            <h3 className="card-title">No suggested property</h3>
            <p className="text-[14px] leading-snug">Pick the property from the list on the left.</p>
          </>
        )}
        <div className="mt-auto flex flex-col gap-1.5">
          {top && (
            <button type="button" className="btn btn-dark self-start px-5 py-3 text-[14px]" disabled={disabled} onClick={() => assign(top.property_id)}>
              {busy ? "Assigning…" : "Assign and remember this address →"}
            </button>
          )}
          {refusal && <p className="text-[12px]">{refusal}</p>}
          <p aria-live="polite" className="text-[12.5px] font-semibold empty:hidden">{error}</p>
        </div>
      </section>
    </>
  );
}

/** After a person taught an address (HUMAN_ASSIGNED) or Lintel reused one (HUMAN_ALIAS). */
export function LearnedAddress({ match, propertyName }: { match: MatchResult; propertyName: string | null }) {
  const learned = match.method === "HUMAN_ASSIGNED";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="card-title">{learned ? "Lintel learned an address" : "Matched by a learned address"}</h3>
        <Chip tone="dark">
          {match.method} · {match.confidence.toFixed(2)}
        </Chip>
      </div>
      {match.address_key && (
        <p className="truncate text-[clamp(26px,2.8vw,38px)] font-light leading-[1.35] tracking-tight" title={match.address_key}>
          {match.address_key}
        </p>
      )}
      <p className="text-[14px] text-muted">
        → <span className="text-paper">{propertyName ?? match.property_id ?? "Unmatched"}</span>,{" "}
        {learned ? "stored as an alias by a person." : "from an alias a person stored earlier."}
      </p>
    </div>
  );
}

/** Compact match summary: method, confidence, candidates with scores and reasons. */
export function MatchPanel({ match }: { match: MatchResult }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="card-title">Match</h3>
        <Chip tone="dark">
          {match.method} · {match.confidence.toFixed(2)}
        </Chip>
      </div>
      {match.candidates.length === 0 ? (
        <p className="text-[14px] text-muted">No property candidates.</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
          {match.candidates.map((c) => (
            <li key={c.property_id} className="rounded-[18px] bg-raised px-4 py-3">
              <div className="flex items-center justify-between gap-3 text-[14px]">
                <span className="truncate font-medium">{c.property_name}</span>
                <span className="shrink-0 tabular-nums text-muted">{c.score.toFixed(2)}</span>
              </div>
              <p title={c.reason} className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted">{c.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
