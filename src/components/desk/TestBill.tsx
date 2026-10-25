"use client";

/**
 * Test a bill. Type a real bill or upload one; Run checks is the only lime thing;
 * the result shows here while the new bill also lands in the bill tabs.
 */
import { useRef, useState, type ReactNode } from "react";
import type { BillFormInput, BillView, UploadedDocument, UsageUnit } from "@/types/bill";
import { errorMessage, type DeskActions } from "./contract";
import { storyOf } from "./story";
import { Button, Icon, Money, StatusChip, T } from "./ui";

const MEDIA: UploadedDocument["media_type"][] = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const UNITS: UsageUnit[] = ["KWH", "CCF", "THERM", "YD3"];
const PHASES = ["Reading", "Matching", "Checking"];

interface FormState {
  vendor_name: string; invoice_number: string; total_amount: string; due_date: string;
  service_address: string; account_number: string; usage_qty: string; usage_unit: string;
  lines: Array<{ description: string; amount: string }>;
}

const EMPTY: FormState = {
  vendor_name: "", invoice_number: "", total_amount: "", due_date: "",
  service_address: "", account_number: "", usage_qty: "", usage_unit: "", lines: [],
};

function toForm(s: FormState): BillFormInput | null {
  const total = Number(s.total_amount);
  if (!s.vendor_name.trim() || !s.invoice_number.trim() || !s.due_date || !(total > 0)) return null;
  const qty = s.usage_qty.trim() ? Number(s.usage_qty) : undefined;
  const lines = s.lines.filter((l) => l.description.trim() && l.amount.trim()).map((l) => ({ description: l.description.trim(), amount: Number(l.amount) }));
  return {
    vendor_name: s.vendor_name.trim(), invoice_number: s.invoice_number.trim(), due_date: s.due_date, total_amount: total,
    service_address: s.service_address.trim() || undefined, account_number: s.account_number.trim() || undefined,
    usage_qty: qty !== undefined && Number.isFinite(qty) ? qty : undefined,
    usage_unit: s.usage_unit ? (s.usage_unit as UsageUnit) : undefined,
    line_items: lines.length ? lines : undefined,
  };
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*;base64,/, ""));
    r.onerror = () => reject(new Error("Could not read that file."));
    r.readAsDataURL(file);
  });
}

export const INPUT = "h-10 w-full min-w-0 rounded-[10px] bg-bar px-3 text-[14px] leading-5 text-paper tabular-nums shadow-[inset_0_0_0_1px_rgba(242,241,236,0.12)] outline-none placeholder:text-muted focus:shadow-[inset_0_0_0_1px_rgba(242,241,236,0.6)]";

export function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${wide ? "col-span-2" : ""}`}>
      <span className={`${T.small} text-muted`}>{label}</span>
      {children}
    </label>
  );
}

export interface TestBillProps {
  actions: DeskActions;
  bills: BillView[];
  onClose(): void;
  /** The new bill landed: select it in the list, keep this panel open. */
  onLanded(bill: BillView): void;
  /** "View in desk": select it and close. */
  onView(bill: BillView): void;
  className?: string;
}

export function TestBill({ actions, bills, onClose, onLanded, onView, className = "" }: TestBillProps) {
  const [form, setForm] = useState<FormState>(() => ({ ...EMPTY, due_date: new Date().toISOString().slice(0, 10) }));
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BillView | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = toForm(form);
  const canRun = phase === null && (file !== null || parsed !== null);
  // Keep the newest copy of the result bill (an investigator brief may arrive later).
  const shown = result ? (bills.find((b) => b.id === result.id) ?? result) : null;

  function patch(p: Partial<FormState>) {
    setForm((f) => ({ ...f, ...p }));
  }

  async function run() {
    if (!canRun) return;
    setError(null);
    setPhase(0);
    // The engine reports no progress, so the phases are paced: a document read takes seconds, a typed bill doesn't.
    const step = file ? 2500 : 300;
    const t1 = window.setTimeout(() => setPhase(1), step);
    const t2 = window.setTimeout(() => setPhase(2), step * 2);
    try {
      const bill = file
        ? await actions.processDocument({ filename: file.name, media_type: file.type as UploadedDocument["media_type"], data_base64: await readBase64(file) })
        : await actions.processForm(parsed as BillFormInput);
      setResult(bill);
      onLanded(bill);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      setPhase(null);
    }
  }

  function reset() {
    setResult(null);
    setForm({ ...EMPTY, due_date: new Date().toISOString().slice(0, 10) });
    setFile(null);
  }

  return (
    <aside aria-label="Test a bill" className={`flex min-h-0 flex-col overflow-hidden rounded-[16px] bg-card ${className}`}>
      <header className="flex shrink-0 items-start gap-4 px-6 pb-4 pt-6">
        <div className="min-w-0 flex-1">
          <h2 className={T.title}>Test a bill</h2>
          <p className={`${T.small} text-muted`}>Runs the same checks as every bill on the desk.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full text-muted outline-none hover:text-paper focus-visible:ring-2 focus-visible:ring-paper">
          <Icon name="close" />
        </button>
      </header>

      {shown ? (
        <Result bill={shown} onView={() => onView(shown)} onAnother={reset} />
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pb-6">
            <section aria-label="Bill details" className="grid grid-cols-2 gap-x-3 gap-y-4">
              <Field label="Vendor"><input className={INPUT} value={form.vendor_name} onChange={(e) => patch({ vendor_name: e.target.value })} placeholder="Utility or contractor" /></Field>
              <Field label="Invoice number"><input className={`${INPUT} font-mono`} value={form.invoice_number} onChange={(e) => patch({ invoice_number: e.target.value })} placeholder="As printed" /></Field>
              <Field label="Amount (USD)"><input className={INPUT} inputMode="decimal" value={form.total_amount} onChange={(e) => patch({ total_amount: e.target.value })} placeholder="0.00" /></Field>
              <Field label="Due date"><input className={`${INPUT} [color-scheme:dark]`} type="date" value={form.due_date} onChange={(e) => patch({ due_date: e.target.value })} /></Field>
              <Field label="Service address" wide><input className={INPUT} value={form.service_address} onChange={(e) => patch({ service_address: e.target.value })} placeholder="Street, city, state ZIP" /></Field>
              <Field label="Account number"><input className={`${INPUT} font-mono`} value={form.account_number} onChange={(e) => patch({ account_number: e.target.value })} placeholder="Optional" /></Field>
              <div className="grid min-w-0 grid-cols-[1fr_96px] gap-2">
                <Field label="Usage"><input className={INPUT} inputMode="decimal" value={form.usage_qty} onChange={(e) => patch({ usage_qty: e.target.value })} placeholder="Optional" /></Field>
                <Field label="Unit">
                  <select className={`${INPUT} cursor-pointer`} value={form.usage_unit} onChange={(e) => patch({ usage_unit: e.target.value })}>
                    <option value="" className="bg-card">None</option>
                    {UNITS.map((u) => <option key={u} value={u} className="bg-card">{u}</option>)}
                  </select>
                </Field>
              </div>
              <div className="col-span-2 flex flex-col gap-2">
                <span className={`${T.small} text-muted`}>Line items</span>
                {form.lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_120px_40px] gap-2">
                    <input aria-label={`Line ${i + 1} description`} className={INPUT} value={l.description} onChange={(e) => patch({ lines: form.lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} />
                    <input aria-label={`Line ${i + 1} amount`} className={INPUT} inputMode="decimal" value={l.amount} onChange={(e) => patch({ lines: form.lines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })} />
                    <button type="button" aria-label={`Remove line ${i + 1}`} onClick={() => patch({ lines: form.lines.filter((_, j) => j !== i) })} className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full text-muted hover:text-paper">
                      <Icon name="x" />
                    </button>
                  </div>
                ))}
                <Button kind="text" className="self-start" onClick={() => patch({ lines: [...form.lines, { description: "", amount: "" }] })}><Icon name="plus" /> Add a line</Button>
              </div>
            </section>

            <section>
              <input
                ref={fileRef}
                type="file"
                accept={MEDIA.join(",")}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && MEDIA.includes(f.type as UploadedDocument["media_type"])) { setFile(f); setError(null); }
                  else if (f) setError("Use a PDF, PNG, JPEG or WEBP.");
                }}
              />
              {file ? (
                <div className="flex h-12 items-center gap-3 rounded-[10px] bg-bar px-4">
                  <Icon name="doc" className="text-muted" />
                  <span className={`${T.small} min-w-0 flex-1 truncate`}>{file.name}</span>
                  <Button kind="text" onClick={() => setFile(null)}>Remove</Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files[0];
                    if (f && MEDIA.includes(f.type as UploadedDocument["media_type"])) { setFile(f); setError(null); }
                    else if (f) setError("Use a PDF, PNG, JPEG or WEBP.");
                  }}
                  className="flex h-12 w-full cursor-pointer items-center gap-3 rounded-[10px] px-4 text-left text-muted outline-none [background-image:url(&quot;data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' rx='10' ry='10' stroke='%238c8c86' stroke-opacity='0.5' stroke-width='1.5' stroke-dasharray='6%2c6'/%3e%3c/svg%3e&quot;)] hover:text-paper focus-visible:ring-2 focus-visible:ring-paper"
                >
                  <Icon name="upload" />
                  <span className={`${T.small} flex-1`}>Or drop a PDF or photo of a bill</span>
                  <span className={`${T.small} font-semibold text-paper`}>Browse</span>
                </button>
              )}
            </section>
          </div>

          <footer className="flex shrink-0 items-center gap-4 border-t border-white/[0.08] px-6 py-4">
            <p className={`${T.small} min-w-0 flex-1 text-muted`} aria-live="polite">
              {error ? <span className="font-semibold text-bad">{error}</span>
                : phase !== null ? PHASES.map((p, i) => <span key={p} className={i <= phase ? "text-paper" : ""}>{i > 0 && " → "}{p}{i === phase && "…"}</span>)
                : file ? "Lintel reads the document, then runs the checks."
                : parsed ? "Nothing is decided ahead of time."
                : "Type a bill above or upload one."}
            </p>
            <Button kind="primary" disabled={!canRun} onClick={run}>
              {phase !== null ? "Running…" : "Run checks"} <Icon name="arrow" />
            </Button>
          </footer>
        </>
      )}
    </aside>
  );
}

function Result({ bill, onView, onAnother }: { bill: BillView; onView(): void; onAnother(): void }) {
  const story = storyOf(bill);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pb-6">
      <div className="flex flex-col gap-4 rounded-[10px] bg-bar p-6">
        <div className="flex items-center gap-3">
          <StatusChip status={bill.status} />
          <span className={`${T.small} text-muted`}>Added to the desk as {bill.id}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={`${T.title}`}>{story.headline}</p>
            <p className={`${T.body} text-muted`}>{bill.vendor_name ?? "Unknown vendor"} · {bill.property_name ?? "No property yet"}</p>
          </div>
          <Money value={bill.amount} struck={bill.status === "BLOCKED"} className={T.title} />
        </div>
        <p className={`${T.body}`}>{story.next}</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button kind="solid" onClick={onView}>View in desk <Icon name="arrow" /></Button>
          <Button kind="secondary" onClick={onAnother}>Test another</Button>
        </div>
      </div>
    </div>
  );
}
