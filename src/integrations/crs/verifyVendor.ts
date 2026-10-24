import { z } from "zod";
import type { CrsResult, VerifyVendorFn, Vendor } from "@/types/bill";

const CRS_TIMEOUT_MS = 5_000;
const DEFAULT_BASE_URL = "https://api-sandbox.stitchcredit.com/api";

/**
 * Official CRS sandbox personas (fake). P08 is the contractor-dispute identity.
 * Unknown refs are not guessed.
 */
const PERSONAS: Record<string, { firstName: string; lastName: string; ssn: string }> = {
  P08: { firstName: "PRIYA", lastName: "VENKATESAN", ssn: "666701008" },
  P19: { firstName: "GRACE", lastName: "NAKAMURA", ssn: "666701019" },
};

const BLJ_KEYS = [
  "Bankruptcies",
  "Judgments",
  "Liens",
  "BankruptciesFound",
  "JudgmentsFound",
  "LiensFound",
  "bankruptcies",
  "judgments",
  "liens",
  "bankruptciesFound",
  "judgmentsFound",
  "liensFound",
] as const;

const filingSchema = z.object({
  type: z.string().nullable(),
  amount: z.number().nullable(),
  chapter: z.string().nullable(),
});

/**
 * `/pp/fcrablj/data` is PitchPoint XML turned into JSON: PascalCase keys, and a
 * single record arrives as an object rather than a one-element array. Live
 * reports nest those records under `DetailedBLJReport.Results`.
 */
const bljSchema = z.preprocess(normalizeBlj, z.object({
  requestId: z.string().nullable(),
  bankruptcies: z.array(filingSchema),
  liens: z.array(filingSchema),
  judgments: z.array(filingSchema),
  bankruptciesFound: z.number().nullable(),
  liensFound: z.number().nullable(),
  judgmentsFound: z.number().nullable(),
}));

const loginSchema = z.object({
  token: z.string().min(1),
});

type Filing = z.infer<typeof filingSchema>;
type Kind = "judgment" | "lien" | "bankruptcy";

let cachedJwt: string | null = null;

export const verifyVendor: VerifyVendorFn = async (vendor) => {
  try {
    return await run(vendor);
  } catch (err) {
    const identityRef = vendor.crs_identity_ref ?? (vendor.kind === "UNVERIFIED_CONTRACTOR" ? "P08" : null);
    return unavailable(identityRef, errorText(err));
  }
};

async function run(vendor: Vendor): Promise<CrsResult> {
  if (process.env.LINTEL_CRS_ENABLED !== "true" || !hasCredentials()) {
    return notRun(vendor.crs_identity_ref);
  }
  if (vendor.kind !== "UNVERIFIED_CONTRACTOR") {
    return notRun(vendor.crs_identity_ref, "Vendor is not an unverified contractor.");
  }

  const identityRef = vendor.crs_identity_ref ?? "P08";
  const persona = PERSONAS[identityRef];
  if (!persona) {
    return unavailable(identityRef, `Unknown CRS identity ref ${identityRef}.`);
  }

  const base = baseUrl();
  const token = await bearerToken(base);
  const response = await fetch(`${base}/pp/fcrablj/data`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      terms: { term: [{ person: persona }] },
    }),
    signal: AbortSignal.timeout(CRS_TIMEOUT_MS),
  });

  return readReport(response, identityRef);
}

function hasCredentials(): boolean {
  if (process.env.CRS_API_KEY?.trim()) return true;
  return Boolean(process.env.CRS_USERNAME?.trim() && process.env.CRS_PASSWORD);
}

function baseUrl(): string {
  const configured = process.env.CRS_BASE_URL?.trim();
  return (configured || DEFAULT_BASE_URL).replace(/\/$/, "");
}

async function bearerToken(base: string): Promise<string> {
  const apiKey = process.env.CRS_API_KEY?.trim();
  if (apiKey) return apiKey;
  if (cachedJwt) return cachedJwt;

  const response = await fetch(`${base}/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      username: process.env.CRS_USERNAME,
      password: process.env.CRS_PASSWORD,
    }),
    signal: AbortSignal.timeout(CRS_TIMEOUT_MS),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`CRS login failed (${response.status}): ${text}`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    throw new Error(`CRS login response was not JSON: ${errorText(err)}`);
  }
  const parsed = loginSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("CRS login response did not include a token.");
  }
  cachedJwt = parsed.data.token;
  return cachedJwt;
}

async function readReport(response: Response, identityRef: string): Promise<CrsResult> {
  const headerId = response.headers.get("RequestID");
  if (!response.ok) {
    const text = await response.text();
    return {
      outcome: "UNAVAILABLE",
      request_id: headerId,
      identity_ref: identityRef,
      signals: [],
      detail: `CRS ${response.status}: ${text}`,
    };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    return unavailable(identityRef, `CRS response was not JSON: ${errorText(err)}`, headerId);
  }

  const parsed = bljSchema.safeParse(json);
  if (!parsed.success) {
    return unavailable(identityRef, `CRS response could not be parsed: ${parsed.error.message}`, headerId);
  }

  const report = parsed.data;
  const parts = [
    summarize("judgment", report.judgments, report.judgmentsFound),
    summarize("lien", report.liens, report.liensFound),
    summarize("bankruptcy", report.bankruptcies, report.bankruptciesFound),
  ];
  const signals = parts.flatMap((part) => part.signals);
  if (signals.length === 0) {
    return {
      outcome: "PASS",
      request_id: headerId ?? report.requestId,
      identity_ref: identityRef,
      signals: [],
      detail: "0 bankruptcies, 0 liens, 0 judgments.",
    };
  }

  return {
    outcome: "FLAGGED",
    request_id: headerId ?? report.requestId,
    identity_ref: identityRef,
    signals,
    detail: parts.flatMap((part) => (part.detail ? [part.detail] : [])).join(" + "),
  };
}

function summarize(
  kind: Kind,
  filings: Filing[],
  found: number | null,
): { detail: string | null; signals: string[] } {
  if (filings.length === 0) {
    if (found != null && found > 0) {
      const text = `${found} ${plural(found, kind)}`;
      return { detail: text, signals: [text] };
    }
    return { detail: null, signals: [] };
  }

  const groups = new Map<string, { count: number; amount: number | null }>();
  const signals: string[] = [];
  for (const filing of filings) {
    const phrase = phraseFor(kind, filing);
    signals.push(filing.amount == null ? phrase : `${phrase} (${formatUsd(filing.amount)})`);
    const group = groups.get(phrase) ?? { count: 0, amount: 0 };
    group.count += 1;
    if (filing.amount == null) group.amount = null;
    else if (group.amount != null) group.amount += filing.amount;
    groups.set(phrase, group);
  }

  const detail = [...groups.entries()]
    .map(([phrase, group]) => {
      const money = group.amount == null ? "" : ` (${formatUsd(group.amount)})`;
      return `${group.count} ${plural(group.count, phrase)}${money}`;
    })
    .join(" + ");
  return { detail, signals };
}

function phraseFor(kind: Kind, filing: Filing): string {
  const raw = (filing.type ?? filing.chapter ?? kind).trim().toLowerCase();
  if (raw.includes(kind)) return raw;
  return `${raw} ${kind}`;
}

function plural(count: number, phrase: string): string {
  if (count === 1) return phrase;
  if (phrase.endsWith("s")) return phrase;
  if (/[^aeiou]y$/.test(phrase)) return `${phrase.slice(0, -1)}ies`;
  return `${phrase}s`;
}

function formatUsd(amount: number): string {
  const cents = Math.round(amount * 100) / 100;
  const digits = Number.isInteger(cents) ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(cents);
}

function notRun(identityRef: string | null, detail = "CRS off."): CrsResult {
  return { outcome: "NOT_RUN", request_id: null, identity_ref: identityRef, signals: [], detail };
}

function unavailable(identityRef: string | null, detail: string, requestId: string | null = null): CrsResult {
  return { outcome: "UNAVAILABLE", request_id: requestId, identity_ref: identityRef, signals: [], detail };
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function hasBljKeys(record: Record<string, unknown>): boolean {
  return BLJ_KEYS.some((key) => key in record);
}

function pick(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
}

function findBljRoot(root: Record<string, unknown>): Record<string, unknown> | null {
  if (hasBljKeys(root)) return root;
  for (const value of Object.values(root)) {
    const nested = asRecord(value);
    if (nested && hasBljKeys(nested)) return nested;
  }
  return null;
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isFiling(filing: Filing): boolean {
  return Boolean(filing.type || filing.chapter || filing.amount != null);
}

function normalizeFiling(value: unknown): Filing {
  const record = asRecord(value);
  if (!record) return { type: null, amount: null, chapter: null };
  return {
    type: stringOrNull(pick(
      record,
      "type",
      "Type",
      "description",
      "Description",
      "judgmentType",
      "JudgmentType",
      "filingType",
      "FilingType",
    )),
    amount: numberOrNull(pick(
      record,
      "amount",
      "Amount",
      "judgmentAmount",
      "JudgmentAmount",
      "lienAmount",
      "LienAmount",
      "totalJudgmentAmount",
      "TotalJudgmentAmount",
      "totalLienAmount",
      "TotalLienAmount",
    )),
    chapter: stringOrNull(pick(record, "chapter", "Chapter")),
  };
}

function singularRecordKey(record: Record<string, unknown>, singular: string): string | undefined {
  const keys = Object.keys(record);
  const target = singular.toLowerCase();
  const exact = keys.find((key) => key.toLowerCase() === target);
  if (exact) return exact;
  return keys.find((key) => key.toLowerCase() === `${target}record`);
}

function coerceFilings(value: unknown, singular: string): Filing[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => coerceFilings(item, singular));
  const record = asRecord(value);
  if (!record) return [];
  const singularKey = singularRecordKey(record, singular);
  if (singularKey) return coerceFilings(record[singularKey], singular);
  const filing = normalizeFiling(record);
  return isFiling(filing) ? [filing] : [];
}

function pickFilings(blj: Record<string, unknown>, ...keys: string[]): unknown {
  if (keys.some((key) => key in blj)) return pick(blj, ...keys);
  const results = asRecord(pick(blj, "Results", "results"));
  return results ? pick(results, ...keys) : undefined;
}

function normalizeBlj(input: unknown): unknown {
  const root = asRecord(input);
  if (!root) return input;
  const blj = findBljRoot(root);
  if (!blj) return input;
  return {
    requestId: stringOrNull(pick(root, "requestId", "RequestID") ?? pick(blj, "requestId", "RequestID")),
    bankruptcies: coerceFilings(pickFilings(blj, "bankruptcies", "Bankruptcies"), "Bankruptcy"),
    liens: coerceFilings(pickFilings(blj, "liens", "Liens"), "Lien"),
    judgments: coerceFilings(pickFilings(blj, "judgments", "Judgments"), "Judgment"),
    bankruptciesFound: numberOrNull(pick(blj, "bankruptciesFound", "BankruptciesFound")),
    liensFound: numberOrNull(pick(blj, "liensFound", "LiensFound")),
    judgmentsFound: numberOrNull(pick(blj, "judgmentsFound", "JudgmentsFound")),
  };
}
