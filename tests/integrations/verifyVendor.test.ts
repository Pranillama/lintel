import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtractedBill, FieldWithConfidence, UsageUnit, Vendor } from "@/types/bill";

const ENV_KEYS = [
  "LINTEL_CRS_ENABLED",
  "CRS_BASE_URL",
  "CRS_API_KEY",
  "CRS_USERNAME",
  "CRS_PASSWORD",
] as const;

const P08_PERSON = { firstName: "PRIYA", lastName: "VENKATESAN", ssn: "666701008" };
const P19_PERSON = { firstName: "GRACE", lastName: "NAKAMURA", ssn: "666701019" };

/** XML-derived PitchPoint JSON: PascalCase, one record as an object. */
const p08Body = {
  requestId: "req-body-p08",
  risk: { score: 88 },
  BankruptciesFound: 0,
  JudgmentsFound: 1,
  LiensFound: 1,
  Bankruptcies: { Bankruptcy: [] },
  Judgments: { Judgment: { Type: "Civil Judgment", Amount: 12300 } },
  Liens: { Lien: { Type: "State Tax Lien", Amount: "7450.00" } },
};

/** Live `/pp/fcrablj/data` shape: records nested under DetailedBLJReport.Results. */
const liveP08Blj = {
  DetailedBLJReport: {
    JudgmentsFound: 1,
    BankruptciesFound: 0,
    LiensFound: 1,
    Results: {
      Judgments: {
        JudgmentRecord: {
          JudgmentType: "Civil Judgment",
          TotalJudgmentAmount: 12300,
          FilingType: "Judgment",
        },
      },
      Liens: {
        LienRecord: {
          TotalLienAmount: 7450,
          FilingType: "Lien",
        },
      },
    },
  },
};

const p19Body = {
  requestId: "req-body-p19",
  risk: { score: 9 },
  BankruptciesFound: 0,
  JudgmentsFound: 0,
  LiensFound: 0,
  Bankruptcies: { Bankruptcy: [] },
  Judgments: { Judgment: [] },
  Liens: { Lien: [] },
};

function field<T>(value: T | null): FieldWithConfidence<T> {
  return { value, confidence: value == null ? 0 : 1, source_snippet: null };
}

function sampleBill(): ExtractedBill {
  return {
    source: "FORM",
    vendor_name: field("Apex Rapid HVAC LLC"),
    invoice_number: field("APX-100"),
    account_number: field<string>(null),
    service_address: field("410 Townsend St"),
    due_date: field("2026-11-01"),
    billing_period_start: field<string>(null),
    billing_period_end: field<string>(null),
    total_amount: field(3450),
    usage_qty: field<number>(null),
    usage_unit: field<UsageUnit>(null),
    line_items: [],
    extraction_error: null,
    extraction_model: null,
  };
}

function contractor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: "V-APEX",
    name: "Apex Rapid HVAC LLC",
    aliases: [],
    kind: "UNVERIFIED_CONTRACTOR",
    utility_type: null,
    default_rail: "ACH",
    crs_identity_ref: "P08",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

async function loadVerifyVendor() {
  const mod = await import("@/integrations/crs/verifyVendor");
  return mod.verifyVendor;
}

function sentRequest(fetchMock: { mock: { calls: unknown[][] } }, index = 0): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls[index];
  const url = call?.[0];
  const init = call?.[1];
  if (typeof url !== "string" || init == null || typeof init !== "object") {
    throw new Error("expected fetch(url, init)");
  }
  return { url, init };
}

beforeEach(() => {
  vi.resetModules();
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("verifyVendor", () => {
  it("returns NOT_RUN and does not call fetch when CRS is off", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const verifyVendor = await loadVerifyVendor();

    const result = await verifyVendor(contractor({ crs_identity_ref: "P08" }), sampleBill());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      outcome: "NOT_RUN",
      request_id: null,
      identity_ref: "P08",
      signals: [],
      detail: "CRS off.",
    });
  });

  it("returns NOT_RUN when CRS is enabled but credentials are missing", async () => {
    process.env.LINTEL_CRS_ENABLED = "true";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const verifyVendor = await loadVerifyVendor();

    const result = await verifyVendor(contractor({ crs_identity_ref: null }), sampleBill());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      outcome: "NOT_RUN",
      request_id: null,
      identity_ref: null,
      signals: [],
      detail: "CRS off.",
    });
  });

  it("flags a P08-shaped report and does not copy a score that was not a filing", async () => {
    process.env.LINTEL_CRS_ENABLED = "true";
    process.env.CRS_API_KEY = "test-key";
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn(async () => jsonResponse(p08Body, 200, { RequestID: "req-header-p08" }));
    vi.stubGlobal("fetch", fetchMock);
    const verifyVendor = await loadVerifyVendor();

    const result = await verifyVendor(contractor({ crs_identity_ref: null }), sampleBill());

    expect(timeout).toHaveBeenCalledWith(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init } = sentRequest(fetchMock);
    expect(url).toBe("https://api-sandbox.stitchcredit.com/api/pp/fcrablj/data");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
      Accept: "application/json",
    });
    expect(JSON.parse(String(init.body))).toEqual({ terms: { term: [{ person: P08_PERSON }] } });
    expect(result).toEqual({
      outcome: "FLAGGED",
      request_id: "req-header-p08",
      identity_ref: "P08",
      signals: ["civil judgment ($12,300)", "state tax lien ($7,450)"],
      detail: "1 civil judgment ($12,300) + 1 state tax lien ($7,450)",
    });
    expect(JSON.stringify(result)).not.toContain("88");
  });

  it("unwraps a live DetailedBLJReport Results payload into a civil judgment and a lien", async () => {
    process.env.LINTEL_CRS_ENABLED = "true";
    process.env.CRS_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => jsonResponse(liveP08Blj, 200, { RequestID: "req-live-p08" }));
    vi.stubGlobal("fetch", fetchMock);
    const verifyVendor = await loadVerifyVendor();

    const result = await verifyVendor(contractor({ crs_identity_ref: "P08" }), sampleBill());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentRequest(fetchMock).url).toBe("https://api-sandbox.stitchcredit.com/api/pp/fcrablj/data");
    expect(result).toEqual({
      outcome: "FLAGGED",
      request_id: "req-live-p08",
      identity_ref: "P08",
      signals: ["civil judgment ($12,300)", "lien ($7,450)"],
      detail: "1 civil judgment ($12,300) + 1 lien ($7,450)",
    });
  });

  it("passes a clean P19-shaped report and reads requestId from the body", async () => {
    process.env.LINTEL_CRS_ENABLED = "true";
    process.env.CRS_API_KEY = "test-key";
    process.env.CRS_BASE_URL = "https://crs.example.test/api/";
    const fetchMock = vi.fn(async () => jsonResponse(p19Body));
    vi.stubGlobal("fetch", fetchMock);
    const verifyVendor = await loadVerifyVendor();

    const result = await verifyVendor(contractor({ crs_identity_ref: "P19" }), sampleBill());

    const { url, init } = sentRequest(fetchMock);
    expect(url).toBe("https://crs.example.test/api/pp/fcrablj/data");
    expect(JSON.parse(String(init.body))).toEqual({ terms: { term: [{ person: P19_PERSON }] } });
    expect(result).toEqual({
      outcome: "PASS",
      request_id: "req-body-p19",
      identity_ref: "P19",
      signals: [],
      detail: "0 bankruptcies, 0 liens, 0 judgments.",
    });
    expect(JSON.stringify(result)).not.toContain("score");
  });

  it("returns UNAVAILABLE when login fails and does not call the report", async () => {
    process.env.LINTEL_CRS_ENABLED = "true";
    process.env.CRS_USERNAME = "sandbox-user";
    process.env.CRS_PASSWORD = "sandbox-pass";
    const fetchMock = vi.fn(async (url: string) => {
      expect(String(url)).toBe("https://api-sandbox.stitchcredit.com/api/users/login");
      return jsonResponse({ codes: ["CRS113"], messages: ["bad credentials"] }, 401);
    });
    vi.stubGlobal("fetch", fetchMock);
    const verifyVendor = await loadVerifyVendor();

    const result = await verifyVendor(contractor({ crs_identity_ref: "P08" }), sampleBill());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { init } = sentRequest(fetchMock);
    expect(JSON.parse(String(init.body))).toEqual({
      username: "sandbox-user",
      password: "sandbox-pass",
    });
    expect(result.outcome).toBe("UNAVAILABLE");
    expect(result.request_id).toBeNull();
    expect(result.identity_ref).toBe("P08");
    expect(result.signals).toEqual([]);
    expect(result.detail).toContain("CRS login failed (401)");
    expect(result.detail).toContain("bad credentials");
  });

  it("returns UNAVAILABLE when the network fails", async () => {
    process.env.LINTEL_CRS_ENABLED = "true";
    process.env.CRS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    const verifyVendor = await loadVerifyVendor();

    const result = await verifyVendor(contractor({ crs_identity_ref: "P19" }), sampleBill());

    expect(result).toEqual({
      outcome: "UNAVAILABLE",
      request_id: null,
      identity_ref: "P19",
      signals: [],
      detail: "network down",
    });
  });

  it("logs in once and reuses the JWT", async () => {
    process.env.LINTEL_CRS_ENABLED = "true";
    process.env.CRS_USERNAME = "sandbox-user";
    process.env.CRS_PASSWORD = "sandbox-pass";
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/users/login")) return jsonResponse({ token: "jwt-1" });
      return jsonResponse(p19Body, 200, { RequestID: "req-live" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const verifyVendor = await loadVerifyVendor();
    const vendor = contractor({ crs_identity_ref: "P19" });

    const first = await verifyVendor(vendor, sampleBill());
    const second = await verifyVendor(vendor, sampleBill());

    const logins = fetchMock.mock.calls.filter((call) => String(call[0]).endsWith("/users/login"));
    const reports = fetchMock.mock.calls.filter((call) => String(call[0]).endsWith("/pp/fcrablj/data"));
    expect(logins).toHaveLength(1);
    expect(reports).toHaveLength(2);
    expect(sentRequest(fetchMock, 2).init.headers).toMatchObject({ Authorization: "Bearer jwt-1" });
    expect(first.request_id).toBe("req-live");
    expect(second.outcome).toBe("PASS");
  });

  it("does not guess a person for an unknown identity ref", async () => {
    process.env.LINTEL_CRS_ENABLED = "true";
    process.env.CRS_API_KEY = "test-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const verifyVendor = await loadVerifyVendor();

    const result = await verifyVendor(contractor({ crs_identity_ref: "P13" }), sampleBill());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      outcome: "UNAVAILABLE",
      request_id: null,
      identity_ref: "P13",
      signals: [],
      detail: "Unknown CRS identity ref P13.",
    });
  });

  it("no-ops when the vendor is not an unverified contractor", async () => {
    process.env.LINTEL_CRS_ENABLED = "true";
    process.env.CRS_API_KEY = "test-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const verifyVendor = await loadVerifyVendor();

    const result = await verifyVendor(contractor({ kind: "KNOWN_CONTRACTOR" }), sampleBill());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.outcome).toBe("NOT_RUN");
    expect(result.signals).toEqual([]);
    expect(result.request_id).toBeNull();
  });
});
