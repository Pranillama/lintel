import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApproverRole,
  CrsResult,
  DraftKind,
  ExtractedBill,
  FieldWithConfidence,
  InvestigationContext,
  MatchResult,
  Property,
  ReasonCode,
  Vendor,
} from "@/types/bill";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => {
  class Anthropic {
    messages = { create: createMock };
  }
  return { default: Anthropic };
});

import { investigate } from "@/agents/investigator/investigate";

const fetchMock = vi.fn();

const property: Property = {
  id: "PROP-003",
  name: "Shattuck Student Living",
  street: "2110 Shattuck Ave",
  city: "Berkeley",
  state: "CA",
  zip: "94704",
  units: [],
  contractor_auto_pay_limit: 2000,
};

const vendor: Vendor = {
  id: "V-EBMUD",
  name: "EBMUD",
  aliases: ["East Bay Municipal Utility District"],
  kind: "ENROLLED_UTILITY",
  utility_type: "WATER",
  default_rail: "UTILITY_PORTAL",
  crs_identity_ref: null,
};

const modelBrief = {
  summary: "The bill needs a person. The printed total is 5680.",
  findings: ["Printed total is 5680."],
  draft: {
    kind: "WORK_ORDER",
    to: "someone",
    subject: "Follow up",
    body: "Please review the bill.",
    suggested_property_id: "PROP-999",
  },
};

const BLOCKING = new Set<ReasonCode>(["EXACT_DUPLICATE", "FUZZY_DUPLICATE", "LINE_SUM_MISMATCH", "CRS_FLAGGED"]);

function field<T>(value: T): FieldWithConfidence<T> {
  return { value, confidence: 1, source_snippet: null };
}

function contextFor(reasons: ReasonCode[], approver: ApproverRole = "PROPERTY_MANAGER"): InvestigationContext {
  const extracted: ExtractedBill = {
    source: "FORM",
    vendor_name: field("EBMUD"),
    invoice_number: field("INV-200"),
    account_number: field("88-2110-4471"),
    service_address: field("2110 Shattuck Ave"),
    due_date: field("2026-11-01"),
    billing_period_start: field("2026-09-01"),
    billing_period_end: field("2026-09-30"),
    total_amount: field(5680),
    usage_qty: field(160),
    usage_unit: field("CCF"),
    line_items: [{ description: "Water", amount: 5000 }],
    extraction_error: null,
    extraction_model: null,
  };
  const match: MatchResult = {
    vendor_id: "V-EBMUD",
    vendor_match: "EXACT_NAME",
    property_id: reasons.includes("NEEDS_PROPERTY_MATCH") ? null : "PROP-003",
    method: reasons.includes("NEEDS_PROPERTY_MATCH") ? "UNRESOLVED" : "EXACT_ACCOUNT",
    confidence: reasons.includes("NEEDS_PROPERTY_MATCH") ? 0.8 : 1,
    candidates: [
      {
        property_id: "PROP-002",
        property_name: "Telegraph Hill Lofts",
        score: 0.8,
        reason: "unit #B is not on the property",
      },
      {
        property_id: "PROP-001",
        property_name: "Bayview Commons",
        score: 0.6,
        reason: "street only",
      },
    ],
    vendor_account_conflict: false,
    address_key: "2110 shattuck",
  };
  const crs: CrsResult = {
    outcome: "NOT_RUN",
    request_id: null,
    identity_ref: null,
    signals: [],
    detail: "",
  };
  const blocked = reasons.some((reason) => BLOCKING.has(reason));
  return {
    bill: {
      id: "BILL-103",
      created_at: "2026-10-24T12:00:00.000Z",
      source: "FORM",
      source_label: null,
      extracted,
      match,
      crs,
      decision: {
        status: blocked ? "BLOCKED" : "HELD",
        reasons,
        required_approver: approver,
        checks: [
          {
            id: "SPIKE",
            outcome: blocked ? "BLOCK" : "HALT",
            reasons,
            rationale: "$5,680.00 vs 3-bill avg $1,490.00 (+281.2%), threshold +25%",
            data: { amount_variance_pct: 281.2 },
          },
        ],
        duplicate_of: null,
        why: "$5,680.00 vs 3-bill avg $1,490.00 (+281.2%), threshold +25%",
        rail: null,
      },
      status: blocked ? "BLOCKED" : "HELD",
      resolved_by: "AUTO",
      payment: null,
      vendor_name: "EBMUD",
      property_name: "Shattuck Student Living",
      amount: 5680,
    },
    property,
    vendor,
    history: [
      {
        id: "HIST-1",
        vendor_id: "V-EBMUD",
        property_id: "PROP-003",
        invoice_number: "INV-1",
        amount: 1490,
        due_date: "2026-07-01",
        usage_qty: 42,
        usage_unit: "CCF",
        paid_on: "2026-07-05",
      },
    ],
    related_bills: [],
    policy_text: ["Blocked bills have no pay control."],
  };
}

function claudeReturns(body: unknown = modelBrief): void {
  createMock.mockResolvedValue({
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify(body) }],
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function enableCreao(): void {
  vi.stubEnv("CREAO_API_KEY", "capi_test");
  vi.stubEnv("CREAO_AGENT_ID", "00000000-0000-4000-8000-000000000000");
}

const DRAFT_CASES: Array<{ reasons: ReasonCode[]; kind: DraftKind | null; to: string | null }> = [
  { reasons: ["EXACT_DUPLICATE"], kind: "VENDOR_EMAIL", to: "Vendor AP contact, EBMUD" },
  { reasons: ["FUZZY_DUPLICATE"], kind: "VENDOR_EMAIL", to: "Vendor AP contact, EBMUD" },
  { reasons: ["LINE_SUM_MISMATCH"], kind: "VENDOR_EMAIL", to: "Vendor AP contact, EBMUD" },
  { reasons: ["USAGE_SPIKE"], kind: "WORK_ORDER", to: "Maintenance, Shattuck Student Living" },
  { reasons: ["AMOUNT_SPIKE"], kind: "WORK_ORDER", to: "Maintenance, Shattuck Student Living" },
  { reasons: ["NEEDS_PROPERTY_MATCH"], kind: "MATCH_SUGGESTION", to: "AP operator" },
  { reasons: ["UNKNOWN_VENDOR"], kind: "VENDOR_ONBOARDING", to: "Property Manager, Shattuck Student Living" },
  { reasons: ["VENDOR_UNVERIFIED"], kind: "VENDOR_ONBOARDING", to: "Property Manager, Shattuck Student Living" },
  { reasons: ["NO_BASELINE"], kind: "APPROVAL_REQUEST", to: "Property Manager, Shattuck Student Living" },
  { reasons: ["OVER_AUTO_PAY_LIMIT"], kind: "APPROVAL_REQUEST", to: "VP Finance, Shattuck Student Living" },
  { reasons: ["EXACT_DUPLICATE", "USAGE_SPIKE"], kind: "VENDOR_EMAIL", to: "Vendor AP contact, EBMUD" },
  { reasons: ["AMOUNT_SPIKE", "NO_BASELINE"], kind: "WORK_ORDER", to: "Maintenance, Shattuck Student Living" },
  { reasons: ["NEEDS_PROPERTY_MATCH", "UNKNOWN_VENDOR"], kind: "MATCH_SUGGESTION", to: "AP operator" },
  {
    reasons: ["VENDOR_UNVERIFIED", "OVER_AUTO_PAY_LIMIT"],
    kind: "VENDOR_ONBOARDING",
    to: "Property Manager, Shattuck Student Living",
  },
  { reasons: ["MISSING_FIELD", "USAGE_SPIKE"], kind: null, to: null },
  { reasons: ["CRS_FLAGGED"], kind: null, to: null },
  { reasons: ["LOW_CONFIDENCE"], kind: null, to: null },
  { reasons: ["EXTRACTION_FAILED"], kind: null, to: null },
  { reasons: ["VENDOR_ACCOUNT_CONFLICT"], kind: null, to: null },
  { reasons: ["CRS_UNAVAILABLE"], kind: null, to: null },
  { reasons: ["UTILITY_NOT_ACCOUNT_MATCHED"], kind: null, to: null },
];

describe("investigate", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);
    delete process.env.CREAO_API_KEY;
    delete process.env.CREAO_AGENT_ID;
    delete process.env.LINTEL_INVESTIGATOR_MODEL;
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error("network disabled"));
    createMock.mockReset();
    createMock.mockRejectedValue(new Error("claude down"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses completed result.text when it is a brief, otherwise the JSON artifact", async () => {
    enableCreao();
    const artifactUrl = "https://agent.creao.ai/api/v1/runs/run-art/artifacts/brief.json";
    const metadata =
      '{"prompt":"...","top_reason":"USAGE_SPIKE","draft_kind":"WORK_ORDER","suggested_property_id":"null"}';
    const artifactBrief = {
      summary: "Usage is 160 CCF against a 42 CCF baseline.",
      findings: ["Current usage is 160 CCF.", "The prior bill was 42 CCF."],
      draft: {
        kind: "WORK_ORDER" as const,
        to: "Maintenance",
        subject: "Check the meter",
        body: "Usage is far above the last bill.",
        suggested_property_id: null,
      },
    };

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "run-text", status: "pending" }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "completed",
          result: {
            text: JSON.stringify(modelBrief),
            artifacts: [{ id: "workspaces/run/brief.json", type: "application/json", url: artifactUrl }],
          },
        }),
      );

    const fromText = await investigate(contextFor(["USAGE_SPIKE"]));

    expect(fromText).toMatchObject({
      status: "DONE",
      provider: "CREAO",
      summary: modelBrief.summary,
      findings: modelBrief.findings,
      creao_run_id: "run-text",
      draft: { kind: "WORK_ORDER", subject: modelBrief.draft.subject, body: modelBrief.draft.body },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).not.toContain(artifactUrl);

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "run-art", status: "pending" }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "completed",
          result: {
            text: metadata,
            artifacts: [
              {
                id: "workspaces/run/report.pdf",
                type: "application/pdf",
                url: "https://agent.creao.ai/api/v1/runs/run-art/artifacts/report.pdf",
              },
              { id: "workspaces/run/brief.json", type: "application/json", url: artifactUrl },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(artifactBrief));

    const fromArtifact = await investigate(contextFor(["USAGE_SPIKE"]));

    expect(fromArtifact).toMatchObject({
      status: "DONE",
      provider: "CREAO",
      summary: artifactBrief.summary,
      findings: artifactBrief.findings,
      creao_run_id: "run-art",
      error: null,
      draft: {
        kind: "WORK_ORDER",
        to: "Maintenance, Shattuck Student Living",
        subject: artifactBrief.draft.subject,
        body: artifactBrief.draft.body,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(artifactUrl);
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: "GET",
      headers: { Authorization: "Bearer capi_test" },
    });
  });

  it("returns a CREAO brief and corrects the draft kind", async () => {
    enableCreao();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "run-103", status: "pending" }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "completed",
          result: { text: "```json\n" + JSON.stringify(modelBrief) + "\n```" },
        }),
      );

    const brief = await investigate(contextFor(["EXACT_DUPLICATE"]));

    expect(brief).toMatchObject({
      bill_id: "BILL-103",
      status: "DONE",
      provider: "CREAO",
      summary: modelBrief.summary,
      findings: modelBrief.findings,
      creao_run_id: "run-103",
      creao_share_url: null,
      error: null,
      draft_sent: false,
      draft: {
        kind: "VENDOR_EMAIL",
        to: "Vendor AP contact, EBMUD",
        suggested_property_id: null,
      },
    });
    expect(brief.started_at).toEqual(expect.any(String));
    expect(brief.completed_at).toEqual(expect.any(String));
  });

  it.each([
    ["failed"],
    ["cancelled"],
  ] as const)("falls back to Claude when CREAO is %s", async (status) => {
    enableCreao();
    claudeReturns();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "run-fail", status: "pending" }))
      .mockResolvedValueOnce(jsonResponse({ status }));

    const brief = await investigate(contextFor(["USAGE_SPIKE"]));

    expect(brief).toMatchObject({
      status: "DONE",
      provider: "CLAUDE",
      creao_run_id: null,
      error: null,
      draft: { kind: "WORK_ORDER", to: "Maintenance, Shattuck Student Living" },
    });
  });

  it("falls back to Claude when CREAO returns a non-brief", async () => {
    enableCreao();
    claudeReturns();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "run-bad", status: "pending" }))
      .mockResolvedValueOnce(jsonResponse({ status: "completed", result: { text: "not json" } }));

    const brief = await investigate(contextFor(["LINE_SUM_MISMATCH"]));

    expect(brief).toMatchObject({
      status: "DONE",
      provider: "CLAUDE",
      draft: { kind: "VENDOR_EMAIL" },
    });
  });

  it("falls back to Claude when the CREAO request fails", async () => {
    enableCreao();
    claudeReturns();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "nope" }, 500));

    const brief = await investigate(contextFor(["FUZZY_DUPLICATE"]));

    expect(brief).toMatchObject({
      status: "DONE",
      provider: "CLAUDE",
      draft: { kind: "VENDOR_EMAIL", to: "Vendor AP contact, EBMUD" },
    });
  });

  it("uses Claude when either CREAO env var is missing", async () => {
    vi.stubEnv("CREAO_API_KEY", "capi_test");
    claudeReturns();

    const brief = await investigate(contextFor(["NO_BASELINE"]));

    expect(brief).toMatchObject({
      status: "DONE",
      provider: "CLAUDE",
      creao_run_id: null,
      draft: { kind: "APPROVAL_REQUEST", to: "Property Manager, Shattuck Student Living" },
    });
  });

  it("returns FAILED without throwing when both providers fail", async () => {
    enableCreao();

    const brief = await investigate(contextFor(["AMOUNT_SPIKE"]));

    expect(brief).toMatchObject({
      status: "FAILED",
      provider: null,
      summary: "",
      findings: [],
      draft: null,
      creao_run_id: null,
      draft_sent: false,
    });
    expect(brief.error).toContain("claude down");
    expect(brief.error).not.toContain("capi_test");
  });

  it("returns FAILED when Claude refuses", async () => {
    createMock.mockResolvedValue({ stop_reason: "refusal", content: [] });

    const brief = await investigate(contextFor(["OVER_AUTO_PAY_LIMIT"], "VP_FINANCE"));

    expect(brief).toMatchObject({ status: "FAILED", provider: null, draft: null });
    expect(brief.error).toContain("refused");
  });

  it.each(DRAFT_CASES)("draft for $reasons is $kind", async ({ reasons, kind, to }) => {
    claudeReturns();
    const approver: ApproverRole =
      kind === "APPROVAL_REQUEST" && reasons.includes("OVER_AUTO_PAY_LIMIT") ? "VP_FINANCE" : "PROPERTY_MANAGER";
    const brief = await investigate(contextFor(reasons, approver));

    expect(brief.status).toBe("DONE");
    expect(brief.provider).toBe("CLAUDE");
    if (kind === null) {
      expect(brief.draft).toBeNull();
      return;
    }
    expect(brief.draft?.kind).toBe(kind);
    expect(brief.draft?.to).toBe(to);
    expect(brief.draft?.suggested_property_id).toBe(kind === "MATCH_SUGGESTION" ? "PROP-002" : null);
  });

  it("uses the model's property id when it is one of the candidates", async () => {
    claudeReturns({
      ...modelBrief,
      draft: { ...modelBrief.draft, suggested_property_id: "PROP-001" },
    });

    const brief = await investigate(contextFor(["NEEDS_PROPERTY_MATCH"]));

    expect(brief.draft?.kind).toBe("MATCH_SUGGESTION");
    expect(brief.draft?.suggested_property_id).toBe("PROP-001");
  });
});
