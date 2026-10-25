// Renders every demo input in src/seed/demo-inputs.ts as a printed bill PDF in fixtures/bills/,
// plus one blurred phone photo, using the local Google Chrome in headless mode.
// The PDFs print exactly the fields of each form, so an upload should land on the same verdict as typing it.
//
//   npm run fixtures:bills

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ALIAS_TWIN, JUDGE_CHIPS, LINE_SUM_FIXTURE, OPENING_BATCH } from "../src/seed/demo-inputs.ts";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, "fixtures", "bills");

/** The blurred photo reuses this bill, which clears when typed, to show a partial read is held instead. */
const PHOTO_OF = "CHIP-CLEAN-PGE";

const money = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fileStem = ({ key, form }) => `${key}-${form.vendor_name.split(" ")[0].toLowerCase().replace(/[^a-z0-9]/g, "")}`;

function billHtml({ form }, { photo = false } = {}) {
  const usage = form.usage_qty != null ? `${form.usage_qty.toLocaleString("en-US")} ${form.usage_unit}` : null;
  // Print a table only when the form has line items; otherwise the intake agent reads a lone row as a line item.
  const table = form.line_items?.length
    ? `<table><thead><tr><th>Description</th><th class="num">Amount</th></tr></thead><tbody>${form.line_items
        .map((li) => `<tr><td>${esc(li.description)}</td><td class="num">${money(li.amount)}</td></tr>`)
        .join("")}</tbody></table>`
    : "";
  const facts = [
    ["Account number", form.account_number],
    ["Service address", form.service_address],
    ["Billing period", form.billing_period_start && `${date(form.billing_period_start)} - ${date(form.billing_period_end)}`],
    ["Usage this period", usage],
  ].filter(([, v]) => v);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: Letter; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 13px/1.45 Helvetica, Arial, sans-serif; color: #1f2933; ${photo ? "background: #6b6259; padding: 60px;" : ""} }
  .sheet { width: 8.5in; min-height: 11in; padding: 0.6in 0.65in; background: #fff; display: flex; flex-direction: column;
    ${photo ? "transform: rotate(-3.5deg) skewX(1.5deg); filter: blur(2.1px) contrast(0.8) brightness(1.04); box-shadow: 0 30px 60px rgba(0,0,0,.45);" : ""} }
  .top { display: flex; justify-content: space-between; align-items: flex-start; }
  .brand { border-left: 6px solid #2f3e46; padding-left: 16px; }
  .brand h1 { margin: 0; font-size: 28px; }
  .brand p { margin: 2px 0 0; letter-spacing: .08em; font-size: 11px; color: #52606d; }
  .ref { background: #f1f3f5; padding: 14px 18px; min-width: 2.6in; }
  .k { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #52606d; margin-top: 8px; }
  .k:first-child { margin-top: 0; }
  .facts { margin: 34px 0 26px; display: grid; grid-template-columns: 1.5in 1fr; row-gap: 6px; }
  .facts .k { margin: 0; align-self: center; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #2f3e46; color: #fff; text-align: left; font-size: 11px; letter-spacing: .08em; padding: 9px 12px; }
  td { padding: 10px 12px; border-bottom: 1px solid #e4e7eb; }
  .num { text-align: right; white-space: nowrap; }
  .due { margin-top: 26px; margin-left: auto; width: 3.1in; background: #f1f3f5; padding: 16px 18px; }
  .due .amt { font-size: 30px; font-weight: 700; text-align: right; }
  .due .when { text-align: right; color: #52606d; }
  .foot { margin-top: auto; padding-top: 14px; border-top: 1px solid #d9dde1; font-size: 10.5px; color: #7b8794; }
  .foot b { color: #b42318; }
  </style></head><body><div class="sheet">
  <div class="top">
    <div class="brand"><h1>${esc(form.vendor_name)}</h1><p>STATEMENT AND INVOICE</p></div>
    <div class="ref"><div class="k">Invoice number</div><div>${esc(form.invoice_number)}</div>
      <div class="k">Payment due</div><div>${date(form.due_date)}</div></div>
  </div>
  <div class="facts">${facts.map(([k, v]) => `<div class="k">${k}</div><div>${esc(v)}</div>`).join("")}</div>
  ${table}
  <div class="due"><div class="k">Total amount due</div><div class="amt">${money(form.total_amount)}</div>
    <div class="when">by ${date(form.due_date)}</div></div>
  <div class="foot"><b>SAMPLE - DEMO FIXTURE.</b> Fictional bill generated for Lintel software testing. Not issued by ${esc(form.vendor_name)}. No money moves.</div>
  </div></body></html>`;
}

function chrome(args, html, work) {
  const page = path.join(work, "page.html");
  writeFileSync(page, html);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", `--user-data-dir=${path.join(work, "profile")}`, ...args, pathToFileURL(page).href], {
    stdio: "ignore",
  });
}

const inputs = [...OPENING_BATCH, ALIAS_TWIN, ...JUDGE_CHIPS, LINE_SUM_FIXTURE];
const work = mkdtempSync(path.join(tmpdir(), "lintel-bills-"));
mkdirSync(outDir, { recursive: true });
try {
  for (const input of inputs) {
    const out = path.join(outDir, `${fileStem(input)}.pdf`);
    chrome(["--no-pdf-header-footer", `--print-to-pdf=${out}`], billHtml(input), work);
    console.log(path.relative(root, out));
  }
  const photo = inputs.find((input) => input.key === PHOTO_OF);
  const out = path.join(outDir, `${fileStem(photo)}-photo.png`);
  chrome(["--window-size=1000,1250", "--hide-scrollbars", `--screenshot=${out}`], billHtml(photo, { photo: true }), work);
  console.log(path.relative(root, out));
} finally {
  rmSync(work, { recursive: true, force: true });
}
