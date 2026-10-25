// Renders every demo input in src/seed/demo-inputs.ts as a realistic sample bill in fixtures/bills/,
// plus one phone photo, using the local Google Chrome in headless mode.
//
// Utility bills are two pages like real ones: an account summary with a tear-off payment stub, then meter
// reads, itemized charges and a 13-month usage chart. Contractor bills are one-page invoices. Every bill
// carries the form's vendor, invoice number, account, service address, due date, total and usage, so an
// upload lands on the same verdict as typing it. Line items always add up to the total, except on the
// SFPUC line-sum fixture, which is wrong on purpose. No real logos or trade dress; each bill says it is a sample.
//
//   npm run fixtures:bills

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ALIAS_TWIN, JUDGE_CHIPS, LINE_SUM_FIXTURE, OPENING_BATCH } from "../src/seed/demo-inputs.ts";
import { ACCOUNTS, HISTORY } from "../src/seed/portfolio.ts";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, "fixtures", "bills");

/** The phone photo is page 1 of this bill, which clears when typed, to show a partial read is held instead. */
const PHOTO_OF = "CHIP-CLEAN-PGE";

/** Who the bills are mailed to: the AP desk, never the service address. */
const PAYER = ["Lintel Property Holdings LLC", "Attn: Accounts Payable", "PO Box 7741", "Oakland, CA 94604-7741"];
const SAMPLE = "SAMPLE BILL FOR SOFTWARE TESTING. Fictional document generated for the Lintel demo; not issued by the named company. No money moves.";

/* ---------- Vendors: letterhead text only (no logos or trade dress) ---------- */

const UTILITIES = {
  "PG&E": {
    mark: "PG&E", full: "Pacific Gas and Electric Company", kind: "Energy Statement", accent: "#1f4e6b",
    remit: ["PG&E", "PO Box 99731", "Sacramento, CA 95899-7317"], phone: "1-800-555-0187",
  },
  EBMUD: {
    mark: "EBMUD", full: "East Bay Municipal Utility District", kind: "Water and Wastewater Bill", accent: "#205d57",
    remit: ["EBMUD", "PO Box 24051", "Oakland, CA 94623-1051"], phone: "1-866-555-0133",
  },
  SFPUC: {
    mark: "SFPUC", full: "San Francisco Public Utilities Commission, Water Enterprise", kind: "Water and Sewer Bill", accent: "#2d4a7a",
    remit: ["SFPUC Customer Service", "PO Box 7369", "San Francisco, CA 94120-7369"], phone: "(415) 555-0172",
  },
  Recology: {
    mark: "Recology", full: "Recology East Bay", kind: "Collection Services Invoice", accent: "#3f5e2a",
    remit: ["Recology East Bay", "PO Box 60846", "Los Angeles, CA 90060-0846"], phone: "(510) 555-0118",
  },
};

const CONTRACTORS = {
  "Bayline Plumbing": {
    name: "Bayline Plumbing & Rooter", lines: ["2231 Adeline St, Suite B", "Oakland, CA 94607"], phone: "(510) 555-0164",
    email: "billing@bayline.example", license: "CA Lic. #SAMPLE-1029 (C-36)", accent: "#24486b", tech: "D. Ortega",
  },
  "Apex Rapid HVAC LLC": {
    name: "Apex Rapid HVAC LLC", lines: ["88 Bluxome St, Unit 4", "San Francisco, CA 94107"], phone: "(415) 555-0191",
    email: "ap@apexrapidhvac.example", license: "CA Lic. #SAMPLE-4410 (C-20)", accent: "#7a3b1f", tech: "R. Mendez",
  },
  "Pacific Green Landscaping": {
    name: "Pacific Green Landscaping LLC", lines: ["1450 Evans Ave", "San Francisco, CA 94124"], phone: "(415) 555-0126",
    email: "accounts@pacificgreen.example", license: "CA Lic. #SAMPLE-7781 (C-27)", accent: "#2f6b3a", tech: "Crew 3",
  },
};

/* ---------- Per-bill detail beyond the form: periods, meters, itemized charges ---------- */
// A line is { d: description, q?: quantity, u?: unit, r?: rate } (amount = q x r) or { d, a } (fixed amount).
// The line marked rest: true takes whatever is left of the total, so the lines always add up exactly.

const DETAILS = {
  "BILL-101": {
    period: ["2026-09-16", "2026-10-15"], meter: "1010298477", startRead: 48213,
    lines: [
      { d: "Basic customer charge (30 days)", a: 29.57 },
      { d: "Distribution", q: 8120, u: "kWh", r: 0.10215 },
      { d: "Transmission", q: 8120, u: "kWh", r: 0.0412 },
      { d: "Public purpose programs", q: 8120, u: "kWh", r: 0.0185 },
      { d: "Generation, commercial A-10 (secondary)", q: 8120, u: "kWh", r: 0.1101 },
      { d: "Energy commission tax", q: 8120, u: "kWh", r: 0.0003 },
      { d: "San Francisco utility users' tax", rest: true },
    ],
  },
  "CHIP-CLEAN-PGE": {
    period: ["2026-09-18", "2026-10-17"], meter: "1010377204", startRead: 31877,
    lines: [
      { d: "Basic customer charge (30 days)", a: 29.57 },
      { d: "Distribution", q: 5650, u: "kWh", r: 0.10215 },
      { d: "Transmission", q: 5650, u: "kWh", r: 0.0412 },
      { d: "Public purpose programs", q: 5650, u: "kWh", r: 0.0185 },
      { d: "Generation, commercial A-10 (secondary)", q: 5650, u: "kWh", r: 0.1101 },
      { d: "Energy commission tax", q: 5650, u: "kWh", r: 0.0003 },
      { d: "San Francisco utility users' tax", rest: true },
    ],
  },
  "BILL-103": {
    period: ["2026-09-13", "2026-10-12"], meter: "WM-66310452", startRead: 7104,
    lines: [
      { d: "Water service charge, 1-1/2 in. meter (30 days)", a: 112.4 },
      { d: "Water flow charge", q: 160, u: "CCF", r: 9.41 },
      { d: "Drought and seismic surcharge", q: 160, u: "CCF", r: 1.02 },
      { d: "Wastewater volume charge", q: 160, u: "CCF", r: 22.5 },
      { d: "Wastewater treatment service charge", rest: true },
    ],
  },
  "BILL-LINESUM": {
    period: ["2026-09-20", "2026-10-19"], meter: "SF-20419938", startRead: 3388,
    // Wrong on purpose: the printed total is $1,000.00 more than the lines.
    lines: [
      { d: "Water service", a: 520.0 },
      { d: "Wastewater service", a: 330.0 },
    ],
  },
  "BILL-102": {
    period: ["2026-10-01", "2026-10-31"],
    lines: [
      { d: "Landfill, 3 cu yd bin, collected 1x weekly", q: 4, u: "pickups", r: 103.0 },
      { d: "Compost, 96-gal carts (4), collected 1x weekly", q: 4, u: "pickups", r: 42.0 },
      { d: "Recycling, 3 cu yd bin, collected 1x weekly", q: 4, u: "pickups", r: 16.0 },
      { d: "Bin locking and push-out service", rest: true },
    ],
  },
  "CHIP-FUZZY-DUP": {
    period: ["2026-10-01", "2026-10-31"],
    lines: [
      { d: "Landfill, 3 cu yd bin, collected 1x weekly", q: 4, u: "pickups", r: 103.0 },
      { d: "Compost, 96-gal carts (4), collected 1x weekly", q: 4, u: "pickups", r: 42.0 },
      { d: "Recycling, 3 cu yd bin, collected 1x weekly", q: 4, u: "pickups", r: 16.0 },
      { d: "Bin locking and push-out service", a: 36.0 },
      { d: "Fuel and environmental recovery fee", rest: true },
    ],
  },
  "BILL-104": {
    workOrder: "WO-55812", serviced: "2026-10-14",
    note: "Customer reported slow drains on the ground floor. Cleared the main line with a cable machine and ran water for 15 minutes; flow is normal.",
    lines: [
      { d: "Service call and diagnosis", q: 1, u: "ea", r: 120.0 },
      { d: "Main line drain clearing, cable machine", q: 1, u: "ea", r: 300.0 },
    ],
  },
  "BILL-104B": {
    workOrder: "WO-55947", serviced: "2026-10-21",
    note: "Kitchen sink drain backed up. Cleared the branch line and checked the trap; no leaks.",
    lines: [
      { d: "Service call and diagnosis", q: 1, u: "ea", r: 120.0 },
      { d: "Kitchen branch drain clearing", q: 1, u: "ea", r: 270.0 },
    ],
  },
  "CHIP-NEW-CONTRACTOR": {
    workOrder: "SVC-0091", serviced: "2026-10-15",
    note: "After-hours call: rooftop unit RTU-2 not cooling. Replaced condenser fan motor and run capacitors, recharged refrigerant, tested.",
    lines: [
      { d: "Emergency after-hours dispatch", q: 1, u: "ea", r: 450.0 },
      { d: "HVAC technician labor", q: 6, u: "hr", r: 225.0 },
      { d: "Condenser fan motor, 1/2 HP (OEM)", q: 1, u: "ea", r: 1180.0 },
      { d: "Run capacitor, 45/5 MFD", q: 2, u: "ea", r: 85.0 },
      { d: "Refrigerant R-410A recharge", rest: true },
    ],
  },
  "CHIP-CONTRACTOR-CLEAN": {
    workOrder: "PGL-OCT-26", serviced: "2026-10-28",
    note: "Monthly grounds maintenance for October: mowing, edging, hedge trim, debris removal. Irrigation zones 1-6 checked and adjusted.",
    lines: [
      { d: "Monthly grounds maintenance, October", q: 1, u: "mo", r: 760.0 },
      { d: "Irrigation inspection and adjustment", q: 1, u: "ea", r: 130.0 },
    ],
  },
};

/* ---------- Helpers ---------- */

const cents = (n) => Math.round(n * 100);
const money = (n) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plain = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Unit rates keep their precision but never fewer than 2 decimals: $22.50, $0.10215. */
const rate = (r) => r.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 });
const longDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const shortDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC" });
const addDays = (iso, days) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const dayCount = ([a, b]) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fileStem = ({ key, form }) => `${key}-${form.vendor_name.split(" ")[0].toLowerCase().replace(/[^a-z0-9]/g, "")}`;

/** Prices every line; the `rest` line takes the remainder so the lines add up to the total exactly. */
function priced(key, lines, total) {
  const out = lines.map((l) => ({ ...l, amount: l.rest ? 0 : l.a ?? cents(l.q * l.r) / 100 }));
  const rest = out.find((l) => l.rest);
  const sum = out.reduce((s, l) => s + cents(l.amount), 0);
  if (rest) rest.amount = (cents(total) - sum) / 100;
  const check = out.reduce((s, l) => s + cents(l.amount), 0);
  const wrongOnPurpose = key === "BILL-LINESUM";
  if (!wrongOnPurpose && check !== cents(total)) throw new Error(`${key}: lines add to ${check / 100}, total is ${total}`);
  if (out.some((l) => l.amount <= 0)) throw new Error(`${key}: a line came out at or below zero`);
  return out;
}

/** Prior bill for the same vendor and account from the seed, for the balance-forward block and the chart. */
function priorBills(form) {
  const account = ACCOUNTS.find((a) => a.account_number === form.account_number);
  if (!account) return [];
  return HISTORY.filter((h) => h.vendor_id === account.vendor_id && h.property_id === account.property_id && h.due_date < form.due_date && h.invoice_number !== form.invoice_number)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}

/** 13 months ending with this bill: 10 plausible earlier months, the 3 seeded ones, then this one. */
function usageHistory(form, prior, periodEnd) {
  const seeded = prior.map((h) => h.usage_qty).filter((q) => typeof q === "number");
  const base = seeded.length ? seeded.reduce((s, q) => s + q, 0) / seeded.length : form.usage_qty;
  const wave = [0.97, 0.94, 0.92, 0.95, 1.01, 1.04, 1.06, 1.03, 0.99, 0.96];
  const earlier = wave.map((w) => Math.round(base * w));
  const values = [...earlier, ...seeded, form.usage_qty].slice(-13);
  const end = new Date(`${periodEnd}T12:00:00Z`);
  return values.map((v, i) => {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (values.length - 1 - i), 1));
    return { label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }), value: v, current: i === values.length - 1 };
  });
}

function usageChart(bars, unit, accent) {
  const w = 640, h = 150, pad = 26, max = Math.max(...bars.map((b) => b.value)) * 1.12;
  const bw = (w - pad * 2) / bars.length;
  const rects = bars.map((b, i) => {
    const bh = Math.max(2, (b.value / max) * (h - 44));
    const x = pad + i * bw + 4, y = h - 22 - bh;
    return `<rect x="${x}" y="${y}" width="${bw - 8}" height="${bh}" fill="${b.current ? accent : "#c9ced3"}"/>` +
      `<text x="${x + (bw - 8) / 2}" y="${h - 8}" font-size="9" text-anchor="middle" fill="#52606d">${b.label}</text>` +
      (b.current ? `<text x="${x + (bw - 8) / 2}" y="${y - 4}" font-size="9" font-weight="700" text-anchor="middle" fill="#1f2933">${b.value.toLocaleString("en-US")}</text>` : "");
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Monthly usage in ${unit}, last 13 months">${rects.join("")}<line x1="${pad}" x2="${w - pad}" y1="${h - 22}" y2="${h - 22}" stroke="#9aa5b1"/></svg>`;
}

function scanLine(account, amount, due) {
  const digits = `${account}`.replace(/\D/g, "").padStart(11, "0");
  return `${digits} ${String(cents(amount)).padStart(9, "0")} ${due.replace(/-/g, "")} 7`;
}

const CSS = `
  @page { size: Letter; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 10.5px/1.4 Helvetica, Arial, sans-serif; color: #1f2933; }
  .page { width: 8.5in; height: 11in; padding: 0.45in 0.5in 0.4in; position: relative; page-break-after: always; display: flex; flex-direction: column; }
  .page:last-child { page-break-after: auto; }
  .row { display: flex; gap: 18px; }
  .grow { flex: 1; }
  .mark { font-size: 30px; font-weight: 800; letter-spacing: -0.5px; }
  .muted { color: #52606d; }
  .k { font-size: 8.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #52606d; }
  .box { border: 1px solid #cfd5db; border-radius: 3px; padding: 10px 12px; }
  .band { color: #fff; padding: 5px 10px; font-weight: 700; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 5px 8px; text-align: left; vertical-align: top; }
  th { font-size: 8.5px; letter-spacing: .06em; text-transform: uppercase; color: #52606d; border-bottom: 1px solid #9aa5b1; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .lines td { border-bottom: 1px solid #e4e7eb; }
  .due { font-size: 22px; font-weight: 800; }
  .stub { margin-top: auto; border-top: 1.5px dashed #7b8794; padding-top: 10px; }
  .scan { font-family: "OCR B", "Courier New", monospace; font-size: 12px; letter-spacing: 2px; }
  .sample { margin-top: 8px; font-size: 7.5px; color: #8a94a0; text-align: center; }
  .pagenum { position: absolute; right: 0.5in; top: 0.25in; font-size: 8px; color: #8a94a0; }
`;

/* ---------- Utility bill: two pages ---------- */

function utilityHtml(input, { photo = false } = {}) {
  const { key, form } = input;
  const v = UTILITIES[form.vendor_name];
  const det = DETAILS[key];
  const lines = priced(key, det.lines, form.total_amount);
  const prior = priorBills(form);
  const last = prior.at(-1);
  const statementDate = addDays(form.due_date, -21);
  const period = form.billing_period_start ? [form.billing_period_start, form.billing_period_end] : det.period;
  const paidOn = last ? addDays(last.due_date, -3) : null;
  const usage = form.usage_qty != null ? `${form.usage_qty.toLocaleString("en-US")} ${form.usage_unit}` : null;
  const sumLines = lines.reduce((s, l) => s + cents(l.amount), 0) / 100;

  const page1 = `
  <section class="page">
    <div class="pagenum">Page 1 of 2</div>
    <div class="row" style="align-items:flex-start">
      <div class="grow">
        <div class="mark" style="color:${v.accent}">${esc(v.mark)}</div>
        <div class="muted">${esc(v.full)}</div>
        <div style="margin-top:4px;font-weight:700">${esc(v.kind)}</div>
      </div>
      <div class="box" style="width:3.1in">
        <table>
          <tr><td class="k">Account number</td><td class="num" style="font-weight:700">${esc(form.account_number)}</td></tr>
          <tr><td class="k">Invoice number</td><td class="num">${esc(form.invoice_number)}</td></tr>
          <tr><td class="k">Statement date</td><td class="num">${shortDate(statementDate)}</td></tr>
          <tr><td class="k">Due date</td><td class="num" style="font-weight:700">${shortDate(form.due_date)}</td></tr>
          <tr><td class="k">Amount due</td><td class="num due" style="color:${v.accent}">${money(form.total_amount)}</td></tr>
        </table>
      </div>
    </div>

    <div class="row" style="margin-top:18px">
      <div class="grow">
        <div class="k">Mailing address</div>
        <div>${PAYER.map(esc).join("<br>")}</div>
      </div>
      <div class="grow">
        <div class="k">Service for</div>
        <div><b>${esc(form.service_address)}</b></div>
        <div class="muted" style="margin-top:4px">Service period ${shortDate(period[0])} - ${shortDate(period[1])} (${dayCount(period)} days)</div>
      </div>
    </div>

    <div class="band" style="background:${v.accent};margin-top:18px">Your account summary</div>
    <table>
      <tr><td>Amount due on previous statement</td><td class="num">${last ? plain(last.amount) : "0.00"}</td></tr>
      <tr><td>Payment received${paidOn ? ` ${shortDate(paidOn)}` : ""} - thank you</td><td class="num">${last ? `-${plain(last.amount)}` : "0.00"}</td></tr>
      <tr><td>Balance forward</td><td class="num">0.00</td></tr>
      <tr><td>Current charges (see page 2)</td><td class="num">${plain(form.total_amount)}</td></tr>
      <tr style="border-top:1.5px solid #1f2933"><td><b>Total amount due by ${longDate(form.due_date)}</b></td><td class="num"><b>${money(form.total_amount)}</b></td></tr>
    </table>
    ${usage ? `<p style="margin-top:10px">Your usage this period was <b>${usage}</b>. See page 2 for meter reads and your 13-month history.</p>` : ""}

    <div class="row" style="margin-top:14px">
      <div class="box grow">
        <div class="k">Important messages</div>
        <p>Pay online, by phone at ${esc(v.phone)}, or by mail with the stub below. Payments can take up to 3 business days to post.</p>
        <p>A late payment charge of 1.5% may apply to balances unpaid after the due date. Questions about this bill? Call ${esc(v.phone)}, Monday to Friday, 7 a.m. to 7 p.m.</p>
      </div>
      <div class="box" style="width:2.6in">
        <div class="k">Ways to save</div>
        <p>Enroll in paperless billing and automatic payment to avoid missed due dates. Commercial customers can request a free usage review.</p>
      </div>
    </div>

    <div class="stub">
      <div class="muted" style="font-size:8.5px">Please detach and return this portion with your payment. Make checks payable to ${esc(v.mark)}.</div>
      <div class="row" style="margin-top:8px">
        <div class="grow">
          <div style="font-weight:800;font-size:15px;color:${v.accent}">${esc(v.mark)}</div>
          <div style="margin-top:8px">${PAYER.map(esc).join("<br>")}</div>
        </div>
        <div style="width:3.3in">
          <table>
            <tr><td class="k">Account number</td><td class="num">${esc(form.account_number)}</td></tr>
            <tr><td class="k">Due date</td><td class="num">${shortDate(form.due_date)}</td></tr>
            <tr><td class="k">Amount due</td><td class="num"><b>${money(form.total_amount)}</b></td></tr>
            <tr><td class="k">Amount enclosed</td><td class="num">$ ____________</td></tr>
          </table>
          <div style="margin-top:8px">${v.remit.map(esc).join("<br>")}</div>
        </div>
      </div>
      <div class="scan" style="margin-top:10px">${scanLine(form.account_number, form.total_amount, form.due_date)}</div>
      <div class="sample">${SAMPLE}</div>
    </div>
  </section>`;

  if (photo) return page1;

  const meter = usage
    ? `<table style="margin-top:6px">
        <tr><th>Meter</th><th>Read dates</th><th class="num">Prior read</th><th class="num">Current read</th><th class="num">Usage</th></tr>
        <tr><td>${esc(det.meter)}</td><td>${shortDate(period[0])} - ${shortDate(period[1])}</td><td class="num">${det.startRead.toLocaleString("en-US")}</td><td class="num">${(det.startRead + form.usage_qty).toLocaleString("en-US")}</td><td class="num"><b>${usage}</b></td></tr>
      </table>`
    : "";
  const chart = usage
    ? `<div class="band" style="background:${v.accent};margin-top:16px">Your usage, last 13 months (${esc(form.usage_unit)})</div>
       <div class="box" style="margin-top:6px">${usageChart(usageHistory(form, prior, period[1]), form.usage_unit, v.accent)}</div>`
    : "";

  const page2 = `
  <section class="page">
    <div class="pagenum">Page 2 of 2</div>
    <div class="row" style="align-items:baseline">
      <div class="grow"><span style="font-weight:800;font-size:16px;color:${v.accent}">${esc(v.mark)}</span> <span class="muted">${esc(v.kind)} details</span></div>
      <div class="muted">Account ${esc(form.account_number)} · Invoice ${esc(form.invoice_number)}</div>
    </div>
    <div class="muted" style="margin-top:2px">Service for ${esc(form.service_address)}</div>
    ${usage ? `<div class="band" style="background:${v.accent};margin-top:14px">Meter reads</div>${meter}` : ""}
    <div class="band" style="background:${v.accent};margin-top:16px">Current charges, ${shortDate(period[0])} - ${shortDate(period[1])}</div>
    <table class="lines" style="margin-top:4px">
      <tr><th>Description</th><th class="num">Quantity</th><th class="num">Rate</th><th class="num">Amount</th></tr>
      ${lines.map((l) => `<tr><td>${esc(l.d)}</td><td class="num">${l.q != null ? `${l.q.toLocaleString("en-US")} ${esc(l.u)}` : ""}</td><td class="num">${l.r != null ? `$${rate(l.r)}` : ""}</td><td class="num">${plain(l.amount)}</td></tr>`).join("")}
    </table>
    <div class="row" style="justify-content:flex-end;margin-top:8px">
      <div class="box" style="width:3.1in">
        <table><tr><td><b>Total current charges</b></td><td class="num"><b>${money(key === "BILL-LINESUM" ? form.total_amount : sumLines)}</b></td></tr></table>
      </div>
    </div>
    ${chart}
    <div class="box" style="margin-top:16px">
      <div class="k">Rate information</div>
      <p class="muted">Charges are billed under the commercial rate schedule on file for this account. Rates, taxes and fees are set by the governing board or commission and may change. Tax and surcharge amounts are rounded to the nearest cent.</p>
    </div>
    <div class="sample" style="margin-top:auto">${SAMPLE}</div>
  </section>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${page1}${page2}</body></html>`;
}

/* ---------- Contractor invoice: one page ---------- */

function contractorHtml(input) {
  const { key, form } = input;
  const c = CONTRACTORS[form.vendor_name];
  const det = DETAILS[key];
  const lines = priced(key, det.lines, form.total_amount);
  const invoiceDate = addDays(form.due_date, -15);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
  <section class="page">
    <div class="row" style="align-items:flex-start;border-bottom:3px solid ${c.accent};padding-bottom:12px">
      <div class="grow">
        <div style="font-size:24px;font-weight:800;color:${c.accent}">${esc(c.name)}</div>
        <div class="muted">${c.lines.map(esc).join("<br>")}<br>${esc(c.phone)} · ${esc(c.email)}<br>${esc(c.license)}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:26px;font-weight:800;letter-spacing:2px">INVOICE</div>
        <table style="margin-top:6px">
          <tr><td class="k">Invoice no.</td><td class="num" style="font-weight:700">${esc(form.invoice_number)}</td></tr>
          <tr><td class="k">Invoice date</td><td class="num">${shortDate(invoiceDate)}</td></tr>
          <tr><td class="k">Terms</td><td class="num">Net 15</td></tr>
          <tr><td class="k">Due date</td><td class="num" style="font-weight:700">${shortDate(form.due_date)}</td></tr>
          <tr><td class="k">Work order</td><td class="num">${esc(det.workOrder)}</td></tr>
        </table>
      </div>
    </div>

    <div class="row" style="margin-top:16px">
      <div class="box grow"><div class="k">Bill to</div><div>${PAYER.map(esc).join("<br>")}</div></div>
      <div class="box grow"><div class="k">Service address (job site)</div><div><b>${esc(form.service_address)}</b></div>
        <div class="muted" style="margin-top:4px">Date of service: ${shortDate(det.serviced)}<br>Technician: ${esc(c.tech)}</div></div>
    </div>

    <table class="lines" style="margin-top:18px">
      <tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr>
      ${lines.map((l) => `<tr><td>${esc(l.d)}</td><td class="num">${l.q ?? 1} ${esc(l.u ?? "ea")}</td><td class="num">${plain(l.r ?? l.amount)}</td><td class="num">${plain(l.amount)}</td></tr>`).join("")}
    </table>

    <div class="row" style="margin-top:12px">
      <div class="grow">
        <div class="k">Work performed</div>
        <p>At ${esc(form.service_address)}: ${esc(det.note)}</p>
        <div class="k" style="margin-top:10px">Payment</div>
        <p>Please reference invoice ${esc(form.invoice_number)} with your payment. ACH or check accepted. A 1.5% monthly finance charge applies to balances past due.</p>
      </div>
      <div class="box" style="width:2.7in">
        <table>
          <tr><td>Subtotal</td><td class="num">${plain(form.total_amount)}</td></tr>
          <tr><td>Sales tax (labor and services, not taxable)</td><td class="num">0.00</td></tr>
          <tr style="border-top:1.5px solid #1f2933"><td><b>Total due</b></td><td class="num" style="font-size:16px"><b>${money(form.total_amount)}</b></td></tr>
        </table>
      </div>
    </div>

    <div style="margin-top:auto;text-align:center" class="muted">Thank you for your business.</div>
    <div class="sample">${SAMPLE}</div>
  </section></body></html>`;
}

/* ---------- Phone photo of page 1 ---------- */

function photoHtml(input) {
  const page = utilityHtml(input, { photo: true });
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}
    html { min-height: 100%; background: radial-gradient(circle at 30% 20%, #8a7f73, #4f463d) fixed; }
    body { padding: 70px 60px; margin: 0; }
    .page { background: #fbfaf6; box-shadow: 0 30px 60px rgba(0,0,0,.5); transform: perspective(1600px) rotateX(9deg) rotateZ(-3deg) skewX(1.5deg);
      filter: blur(1.9px) contrast(0.85) brightness(1.03); }
  </style></head><body>${page}</body></html>`;
}

/* ---------- Render ---------- */

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
    const html = UTILITIES[input.form.vendor_name] ? utilityHtml(input) : contractorHtml(input);
    const out = path.join(outDir, `${fileStem(input)}.pdf`);
    chrome(["--no-pdf-header-footer", `--print-to-pdf=${out}`], html, work);
    console.log(path.relative(root, out));
  }
  const photo = inputs.find((input) => input.key === PHOTO_OF);
  const out = path.join(outDir, `${fileStem(photo)}-photo.png`);
  chrome(["--window-size=1040,1380", "--hide-scrollbars", `--screenshot=${out}`], photoHtml(photo), work);
  console.log(path.relative(root, out));
} finally {
  rmSync(work, { recursive: true, force: true });
}
