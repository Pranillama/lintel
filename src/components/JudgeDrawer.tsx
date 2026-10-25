"use client";

import { useState, type DragEvent, type KeyboardEvent } from "react";
import type { BillFormInput, BillView, LineItem, UploadedDocument, UsageUnit } from "@/types/bill";
import { ALIAS_TWIN, JUDGE_CHIPS, LINE_SUM_FIXTURE } from "@/seed/demo-inputs";
import { formatUsd } from "@/engine/format";
import { errorMessage, type JudgeDrawerProps } from "./desk";
import { StatusChip } from "./StatusChip";

// Wireframe order: the four judge chips, the line-sum fixture, then the alias twin.
const CHIPS = [...JUDGE_CHIPS, LINE_SUM_FIXTURE, ALIAS_TWIN];
const UNITS: UsageUnit[] = ["KWH", "CCF", "THERM", "YD3"];
const MEDIA_TYPES: UploadedDocument["media_type"][] = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_DUE = "2026-10-25";

type Tab = "type" | "upload";

/** The form exactly as typed. Strings until Run builds a BillFormInput. */
interface Fields {
  amount: string;
  due_date: string;
  vendor_name: string;
  invoice_number: string;
  account_number: string;
  service_address: string;
  usage_qty: string;
  usage_unit: UsageUnit | "";
}

const EMPTY: Fields = {
  amount: "",
  due_date: DEFAULT_DUE,
  vendor_name: "",
  invoice_number: "",
  account_number: "",
  service_address: "",
  usage_qty: "",
  usage_unit: "",
};

const TEXT_FIELDS: { key: Exclude<keyof Fields, "usage_unit">; label: string; type?: string; inputMode?: "decimal" }[] = [
  { key: "amount", label: "Amount", inputMode: "decimal" },
  { key: "due_date", label: "Due date", type: "date" },
  { key: "vendor_name", label: "Vendor" },
  { key: "invoice_number", label: "Invoice number" },
  { key: "account_number", label: "Account number" },
  { key: "service_address", label: "Service address" },
  { key: "usage_qty", label: "Usage qty", inputMode: "decimal" },
];

function fieldsFromForm(form: BillFormInput): Fields {
  return {
    amount: form.total_amount.toFixed(2),
    due_date: form.due_date,
    vendor_name: form.vendor_name,
    invoice_number: form.invoice_number,
    account_number: form.account_number ?? "",
    service_address: form.service_address ?? "",
    usage_qty: form.usage_qty === undefined ? "" : String(form.usage_qty),
    usage_unit: form.usage_unit ?? "",
  };
}

/** Prefill from whatever the intake agent did read. Missing values stay empty. */
function fieldsFromBill(bill: BillView): Fields {
  const x = bill.extracted;
  return {
    amount: x.total_amount.value === null ? "" : x.total_amount.value.toFixed(2),
    due_date: x.due_date.value ?? DEFAULT_DUE,
    vendor_name: x.vendor_name.value ?? "",
    invoice_number: x.invoice_number.value ?? "",
    account_number: x.account_number.value ?? "",
    service_address: x.service_address.value ?? "",
    usage_qty: x.usage_qty.value === null ? "" : String(x.usage_qty.value),
    usage_unit: x.usage_unit.value ?? "",
  };
}

function parseNumber(raw: string): number {
  return Number(raw.replace(/[$,\s]/g, ""));
}

/** Returns the form to send, or a short message saying what is missing. */
function buildForm(f: Fields, lineItems: LineItem[]): BillFormInput | string {
  const amount = parseNumber(f.amount);
  if (!f.vendor_name.trim()) return "Add a vendor.";
  if (!f.invoice_number.trim()) return "Add an invoice number.";
  if (!f.due_date) return "Add a due date.";
  if (!f.amount.trim() || !Number.isFinite(amount) || amount <= 0) return "Amount must be more than $0.";
  const form: BillFormInput = {
    vendor_name: f.vendor_name.trim(),
    invoice_number: f.invoice_number.trim(),
    due_date: f.due_date,
    total_amount: amount,
  };
  if (f.account_number.trim()) form.account_number = f.account_number.trim();
  if (f.service_address.trim()) form.service_address = f.service_address.trim();
  if (f.usage_qty.trim()) {
    const qty = parseNumber(f.usage_qty);
    if (!Number.isFinite(qty) || qty < 0) return "Usage qty must be a number.";
    form.usage_qty = qty;
  }
  if (f.usage_unit) form.usage_unit = f.usage_unit;
  if (lineItems.length > 0) form.line_items = lineItems;
  return form;
}

/** A partial read: the engine held it for extraction, or a required field came back empty. */
function isPartialRead(bill: BillView): boolean {
  const x = bill.extracted;
  return (
    bill.decision.reasons.includes("EXTRACTION_FAILED") ||
    x.extraction_error !== null ||
    [x.vendor_name, x.invoice_number, x.due_date, x.total_amount].some((field) => field.value === null)
  );
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*;base64,/, ""));
    reader.onerror = () => reject(new Error("Couldn’t read that file. Try another."));
    reader.readAsDataURL(file);
  });
}

const INPUT =
  "h-12 w-full rounded-[20px] bg-black/8 px-4 text-[16px] text-bar [color-scheme:light] outline-none transition-colors placeholder:text-bar/40 focus:bg-bar focus:text-paper focus:[color-scheme:dark]";
const LABEL = "mb-1.5 block text-[12.5px] opacity-70";
const DARK_FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bar";

export function JudgeDrawer({ onClose, actions, onCreated }: JudgeDrawerProps) {
  const [tab, setTab] = useState<Tab>("type");
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [partial, setPartial] = useState<BillView | null>(null);

  function switchTab(next: Tab) {
    setTab(next);
    setMessage(null);
  }

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next: Tab = tab === "type" ? "upload" : "type";
    switchTab(next);
    document.getElementById(`judge-tab-${next}`)?.focus();
  }

  function fillChip(key: string, form: BillFormInput) {
    setFields(fieldsFromForm(form));
    setLineItems(form.line_items ?? []);
    setActiveChip(key);
    setMessage(null);
  }

  function setField<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function runForm() {
    const form = buildForm(fields, lineItems);
    if (typeof form === "string") {
      setMessage(form);
      return;
    }
    setRunning(true);
    setMessage(null);
    try {
      const bill = await actions.processForm(form);
      onCreated(bill);
      onClose();
    } catch (err) {
      setMessage(errorMessage(err));
      setRunning(false);
    }
  }

  function chooseFile(next: File | undefined) {
    setPartial(null);
    if (!next) return;
    if (!MEDIA_TYPES.includes(next.type as UploadedDocument["media_type"])) {
      setFile(null);
      setMessage("Use a PDF, PNG, JPEG, or WEBP file.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setFile(null);
      setMessage("That file is over 8 MB.");
      return;
    }
    setFile(next);
    setMessage(null);
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    chooseFile(e.dataTransfer.files[0]);
  }

  async function runDocument() {
    if (!file) {
      setMessage("Choose a file first.");
      return;
    }
    setRunning(true);
    setMessage(null);
    setPartial(null);
    try {
      const data_base64 = await readBase64(file);
      const bill = await actions.processDocument({
        filename: file.name,
        media_type: file.type as UploadedDocument["media_type"],
        data_base64,
      });
      onCreated(bill);
      if (isPartialRead(bill)) {
        setPartial(bill);
        setRunning(false);
      } else {
        onClose();
      }
    } catch (err) {
      setMessage(errorMessage(err));
      setRunning(false);
    }
  }

  function typeInstead(bill: BillView) {
    setFields(fieldsFromBill(bill));
    setLineItems(bill.extracted.line_items);
    setActiveChip(null);
    setPartial(null);
    switchTab("type");
  }

  const tabClass = (on: boolean) =>
    `pill px-5 py-2.5 ${DARK_FOCUS} ${on ? "bg-bar text-paper" : "bg-black/8 text-bar"}`;

  return (
    <section
      role="dialog"
      aria-labelledby="judge-title"
      className="card card-lime h-full w-full gap-4 px-[34px] py-[30px]"
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="judge-title" className="text-[32px] font-medium leading-tight tracking-[-0.01em]">
            Test a bill
          </h2>
          <p className="mt-2 text-[15px]">
            Type any bill. It runs through the same checks as everything else. Nothing is decided ahead of time.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className={`grid size-11 shrink-0 cursor-pointer place-items-center rounded-full bg-bar text-paper ${DARK_FOCUS}`}
        >
          ✕
        </button>
      </header>

      <div role="tablist" aria-label="How to enter the bill" className="flex gap-2">
        <button
          type="button"
          role="tab"
          id="judge-tab-type"
          aria-selected={tab === "type"}
          aria-controls="judge-panel-type"
          tabIndex={tab === "type" ? 0 : -1}
          onClick={() => switchTab("type")}
          onKeyDown={onTabKey}
          className={tabClass(tab === "type")}
        >
          Type it
        </button>
        <button
          type="button"
          role="tab"
          id="judge-tab-upload"
          aria-selected={tab === "upload"}
          aria-controls="judge-panel-upload"
          tabIndex={tab === "upload" ? 0 : -1}
          onClick={() => switchTab("upload")}
          onKeyDown={onTabKey}
          className={tabClass(tab === "upload")}
        >
          Upload a photo or PDF
        </button>
      </div>

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
        {tab === "type" ? (
          <div role="tabpanel" id="judge-panel-type" aria-labelledby="judge-tab-type" className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2" aria-label="Example bills (fill the form only)" role="group">
              {CHIPS.map((chip) => {
                const on = activeChip === chip.key;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => fillChip(chip.key, chip.form)}
                    className={`cursor-pointer rounded-full px-4 py-2 text-[13.5px] font-medium ${DARK_FOCUS} ${
                      on ? "bg-bar text-lime" : "bg-black/8 text-bar"
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-x-3.5 gap-y-3">
              {TEXT_FIELDS.map((f) => (
                <div key={f.key} className="min-w-0">
                  <label htmlFor={`judge-${f.key}`} className={LABEL}>
                    {f.label}
                  </label>
                  <input
                    id={`judge-${f.key}`}
                    type={f.type ?? "text"}
                    inputMode={f.inputMode}
                    autoFocus={f.key === "amount"}
                    autoComplete="off"
                    value={fields[f.key]}
                    onChange={(e) => setField(f.key, e.target.value)}
                    className={INPUT}
                  />
                </div>
              ))}
              <div className="min-w-0">
                <label htmlFor="judge-usage_unit" className={LABEL}>
                  Usage unit
                </label>
                <select
                  id="judge-usage_unit"
                  value={fields.usage_unit}
                  onChange={(e) => setField("usage_unit", e.target.value as UsageUnit | "")}
                  className={`${INPUT} cursor-pointer appearance-none`}
                >
                  <option value="">None</option>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <details className="text-[14px]">
              <summary className={`w-fit cursor-pointer rounded-full font-medium ${DARK_FOCUS}`}>
                Line items ({lineItems.length})
              </summary>
              {lineItems.length === 0 ? (
                <p className="mt-2 opacity-70">No line items. Chips that carry them fill this list.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1">
                  {lineItems.map((item, i) => (
                    <li key={i} className="flex justify-between gap-4 rounded-[14px] bg-black/8 px-4 py-2">
                      <span className="truncate">{item.description}</span>
                      <span className="tabular-nums">{formatUsd(item.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </div>
        ) : (
          <div role="tabpanel" id="judge-panel-upload" aria-labelledby="judge-tab-upload" className="flex flex-col gap-4">
            <input
              id="judge-file"
              type="file"
              accept={MEDIA_TYPES.join(",")}
              className="peer sr-only"
              onChange={(e) => chooseFile(e.target.files?.[0])}
            />
            <label
              htmlFor="judge-file"
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-[26px] border-2 border-dashed border-bar/50 px-6 py-8 text-center peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-bar ${
                dragging ? "bg-black/8" : ""
              }`}
            >
              <span className="text-[20px] font-semibold">
                Drop a bill here, or <span className="underline">browse</span>
              </span>
              <span className="text-[13.5px] opacity-70">PDF, PNG, JPEG, WEBP · up to 8 MB · read by the intake agent</span>
            </label>

            {file && (
              <div className="flex items-center justify-between gap-4 rounded-[20px] bg-black/8 px-4 py-3 text-[15px]">
                <span className="truncate font-medium">{file.name}</span>
                {running && <span className="shrink-0">Reading…</span>}
              </div>
            )}

            {partial && (
              <div className="flex flex-col items-start gap-3 rounded-[24px] bg-bar px-5 py-4 text-paper">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusChip status={partial.status} />
                  <span className="text-[15px] font-semibold">Couldn’t read every field</span>
                </div>
                <p className="text-[14px] text-muted">
                  Lintel won’t decide money on a partial read. The bill is on the desk with every check; fields that came back are kept.
                </p>
                <button type="button" onClick={() => typeInstead(partial)} className="btn btn-light">
                  Type it instead
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="flex items-center justify-end gap-3">
        <p aria-live="polite" className="mr-auto min-w-0 text-[14px] font-medium">
          {message}
        </p>
        <button type="button" onClick={onClose} className={`btn btn-outline ${DARK_FOCUS}`}>
          Cancel
        </button>
        {tab === "type" ? (
          <button type="button" onClick={runForm} disabled={running} className={`btn btn-dark ${DARK_FOCUS}`}>
            {running ? "Running…" : "Run autonomous pipeline →"}
          </button>
        ) : (
          <button type="button" onClick={runDocument} disabled={running} className={`btn btn-dark ${DARK_FOCUS}`}>
            {running ? "Reading…" : "Run it →"}
          </button>
        )}
      </footer>
    </section>
  );
}
