"use client";

/**
 * Upload a bill. The PDF or photo comes first; typing a bill in is tucked behind a disclosure.
 * "Read and check" closes this and opens the full-screen receipt story on the run, which
 * goes through `track`, so it also shows under "Processing now" in the Inbox.
 */
import { useRef, useState } from "react";
import type { BillFormInput, UploadedDocument, UsageUnit } from "@/types/bill";
import { Button, Icon, T } from "../desk/ui";
import { useApp } from "./AppProvider";
import { Overlay } from "./kit";
import { Field, INPUT } from "./portfolio";

const MEDIA: UploadedDocument["media_type"][] = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const UNITS: UsageUnit[] = ["KWH", "CCF", "THERM", "YD3"];

interface FormState {
  vendor_name: string; invoice_number: string; total_amount: string; due_date: string;
  service_address: string; account_number: string; usage_qty: string; usage_unit: string;
  lines: Array<{ description: string; amount: string }>;
}

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY: FormState = { vendor_name: "", invoice_number: "", total_amount: "", due_date: "", service_address: "", account_number: "", usage_qty: "", usage_unit: "", lines: [] };

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

export function UploadDrawer({ onClose }: { onClose(): void }) {
  const { actions, runStory } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [typing, setTyping] = useState(false);
  const [form, setForm] = useState<FormState>(() => ({ ...EMPTY, due_date: today() }));
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = typing && !file ? toForm(form) : null;
  const canRun = file !== null || parsed !== null;

  function pick(f: File | undefined) {
    if (!f) return;
    if (MEDIA.includes(f.type as UploadedDocument["media_type"])) { setFile(f); setError(null); }
    else setError("Use a PDF, or a PNG, JPEG or WEBP photo.");
  }

  function run() {
    if (!canRun) return;
    if (file) {
      runStory("DOCUMENT", file.name, { filename: file.name }, async () =>
        actions.processDocument({ filename: file.name, media_type: file.type as UploadedDocument["media_type"], data_base64: await readBase64(file) }));
    } else {
      const form = parsed as BillFormInput;
      runStory("FORM", `${form.vendor_name} · ${form.invoice_number}`, { invoice: form.invoice_number }, () => actions.processForm(form));
    }
    onClose();
  }

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  return (
    <Overlay onClose={onClose}>
      <aside role="dialog" aria-label="Upload a bill" className="flex h-full w-[520px] max-w-full flex-col overflow-hidden rounded-[16px] bg-card">
        <header className="flex shrink-0 items-start gap-4 px-6 pb-4 pt-6">
          <div className="min-w-0 flex-1">
            <h2 className={T.title}>Upload a bill</h2>
            <p className={`${T.small} text-muted`}>Lintel reads it, matches it to a property and runs the same checks as every other bill.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full text-muted outline-none hover:text-paper focus-visible:ring-2 focus-visible:ring-paper">
            <Icon name="close" />
          </button>
        </header>

        <>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6">
            <input ref={fileRef} type="file" accept={MEDIA.join(",")} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
            {file ? (
              <div className="flex h-14 items-center gap-3 rounded-[10px] bg-bar px-4">
                <Icon name="doc" className="text-muted" />
                <span className={`${T.small} min-w-0 flex-1 truncate`}>{file.name}</span>
                <Button kind="text" onClick={() => setFile(null)}>Remove</Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
                className={`flex h-48 w-full shrink-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-[12px] border-[1.5px] border-dashed text-center outline-none focus-visible:ring-2 focus-visible:ring-paper ${over ? "border-lime bg-lime/5" : "border-muted/50 hover:border-paper/70"}`}
              >
                <Icon name="upload" className="size-6 text-paper" />
                <span className={`${T.body} font-semibold`}>Drop the bill here</span>
                <span className={`${T.small} text-muted`}>A PDF, or a photo of a paper bill · <span className="text-paper underline underline-offset-2">browse</span></span>
              </button>
            )}

            {!file && (
              <div className="shrink-0 rounded-[10px] bg-bar">
                <button type="button" aria-expanded={typing} onClick={() => setTyping((t) => !t)}
                  className={`${T.small} flex w-full cursor-pointer items-center gap-2 rounded-[10px] px-4 py-3 text-left text-muted outline-none hover:text-paper focus-visible:ring-2 focus-visible:ring-paper`}>
                  <Icon name="chevron" className={typing ? "" : "-rotate-90"} /> No file? Type it in
                </button>
                {typing && (
                  <section aria-label="Bill details" className="grid grid-cols-2 gap-x-3 gap-y-4 px-4 pb-4">
                    <Field label="Vendor"><input className={INPUT} value={form.vendor_name} onChange={(e) => patch({ vendor_name: e.target.value })} placeholder="Utility or contractor" /></Field>
                    <Field label="Invoice number"><input className={`${INPUT} font-mono`} value={form.invoice_number} onChange={(e) => patch({ invoice_number: e.target.value })} placeholder="As printed" /></Field>
                    <Field label="Amount (USD)"><input className={INPUT} inputMode="decimal" value={form.total_amount} onChange={(e) => patch({ total_amount: e.target.value })} placeholder="0.00" /></Field>
                    <Field label="Due date"><input className={`${INPUT} [color-scheme:dark]`} type="date" value={form.due_date} onChange={(e) => patch({ due_date: e.target.value })} /></Field>
                    <Field label="Service address" wide><input className={INPUT} value={form.service_address} onChange={(e) => patch({ service_address: e.target.value })} placeholder="Street, city, state ZIP" /></Field>
                    <Field label="Account number (optional)"><input className={`${INPUT} font-mono`} value={form.account_number} onChange={(e) => patch({ account_number: e.target.value })} /></Field>
                    <div className="grid min-w-0 grid-cols-[1fr_96px] gap-2">
                      <Field label="Usage (optional)"><input className={INPUT} inputMode="decimal" value={form.usage_qty} onChange={(e) => patch({ usage_qty: e.target.value })} /></Field>
                      <Field label="Unit">
                        <select className={`${INPUT} cursor-pointer`} value={form.usage_unit} onChange={(e) => patch({ usage_unit: e.target.value })}>
                          <option value="" className="bg-card">None</option>
                          {UNITS.map((u) => <option key={u} value={u} className="bg-card">{u}</option>)}
                        </select>
                      </Field>
                    </div>
                    <div className="col-span-2 flex flex-col gap-2">
                      <span className={`${T.small} text-muted`}>Line items (optional)</span>
                      {form.lines.map((l, i) => (
                        <div key={i} className="grid grid-cols-[1fr_112px_40px] gap-2">
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
                )}
              </div>
            )}
          </div>

          <footer className="flex shrink-0 items-center gap-4 border-t border-white/[0.08] px-6 py-4">
            <p className={`${T.small} min-w-0 flex-1 text-muted`} aria-live="polite">
              {error ? <span className="font-semibold text-bad">{error}</span>
                : file ? "Nothing is decided ahead of time."
                : typing ? (parsed ? "Nothing is decided ahead of time." : "Vendor, invoice number, amount and due date are needed.")
                : "Add a file to start."}
            </p>
            <Button kind="primary" disabled={!canRun} onClick={run}>Read and check <Icon name="arrow" /></Button>
          </footer>
        </>
      </aside>
    </Overlay>
  );
}

