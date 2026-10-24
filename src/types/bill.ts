/**
 * Lintel shared contract. FROZEN.
 *
 * Every lane builds against these types. Changing anything here needs a
 * message in #collaborative-context and a thumbs-up from all three owners
 * (see context/ai-workflow-rules.md). Additive optional fields are the only
 * cheap change; renames and removals break two other lanes.
 *
 * Core rule: AI proposes, deterministic code disposes. Nothing produced by a
 * model (ExtractedBill confidences, InvestigationBrief) can set BillStatus.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** ISO date "YYYY-MM-DD". */
export type IsoDate = string;
/** ISO-8601 timestamp with timezone, server clock only. */
export type IsoTimestamp = string;
/** Dollars as a JS number, rounded to cents at every boundary (see code-standards.md). */
export type Usd = number;
/** 0.00 to 1.00 */
export type Confidence = number;

export type PropertyId = `PROP-${string}`;
export type VendorId = `V-${string}`;
export type BillId = string;

// ---------------------------------------------------------------------------
// Portfolio (seeded, read-only at runtime)
// ---------------------------------------------------------------------------

export interface Property {
  id: PropertyId;
  name: string;
  /** e.g. "2450 Market St" */
  street: string;
  city: string;
  state: string;
  zip: string;
  /** Unit labels that exist at this property, e.g. ["101", "102"]. Empty = no unit-level check. */
  units: string[];
  /**
   * Per-property auto-pay limit for CONTRACTOR bills. Enrolled utilities do
   * not use it (two-track policy, master-spec.md section 5).
   */
  contractor_auto_pay_limit: Usd;
}

export type VendorKind =
  /** PG&E, EBMUD, Recology, SFPUC: autopay enrolled, cleared on history + duplicates. */
  | "ENROLLED_UTILITY"
  /** Onboarded service vendor: cleared under the property auto-pay limit. */
  | "KNOWN_CONTRACTOR"
  /** In the vendor file but identity not verified: needs a CRS pass, else HELD. */
  | "UNVERIFIED_CONTRACTOR";

export type UtilityType = "ELECTRIC" | "WATER" | "TRASH" | "GAS";

export type PaymentRail = "UTILITY_PORTAL" | "ACH" | "CHECK" | "X402_USDC";

export interface Vendor {
  id: VendorId;
  /** Display name, e.g. "PG&E" */
  name: string;
  /** Other spellings seen on bills. Matching is on normalized name OR any alias. */
  aliases: string[];
  kind: VendorKind;
  /** Set for utilities only. */
  utility_type: UtilityType | null;
  default_rail: PaymentRail;
  /** Opaque reference to a CRS sandbox test identity. Null = not mapped. Never invented. */
  crs_identity_ref: string | null;
}

/** A utility account: the exact key that ties a bill to a property. */
export interface VendorAccount {
  vendor_id: VendorId;
  property_id: PropertyId;
  /** As printed on the bill, e.g. "4491-882-01". Matching uses normalizeAccount(). */
  account_number: string;
  utility_type: UtilityType;
  /** Typical monthly usage unit, if metered. */
  usage_unit: UsageUnit | null;
}

export type UsageUnit = "KWH" | "CCF" | "THERM" | "YD3";

/**
 * A prior bill already in the AP ledger (seeded history). Status is always
 * PAID. These rows are the input to duplicate checks and spike averages.
 * They are NOT demo verdicts.
 */
export interface HistoricalBill {
  id: string;
  vendor_id: VendorId;
  property_id: PropertyId;
  invoice_number: string;
  amount: Usd;
  due_date: IsoDate;
  usage_qty: number | null;
  usage_unit: UsageUnit | null;
  paid_on: IsoDate;
}

/** Learned mapping written when a human assigns a property. Matcher reads it before fuzzy. */
export interface AddressAlias {
  /** normalizeAddressKey(raw service address), includes the unit token. */
  address_key: string;
  /** The raw string the human saw, for display. */
  raw_address: string;
  property_id: PropertyId;
  created_at: IsoTimestamp;
  created_by: "HUMAN_OPERATOR";
  source_bill_id: BillId;
}

// ---------------------------------------------------------------------------
// Intake
// ---------------------------------------------------------------------------

export type IntakeSource =
  /** Operator or judge typed it in the injector form. */
  | "FORM"
  /** PDF or image read by the intake agent. */
  | "DOCUMENT"
  /** Structured bill records replayed through the live engine (the opening batch). */
  | "FEED";

export interface FieldWithConfidence<T> {
  value: T | null;
  confidence: Confidence;
  /** Verbatim text from the document the value came from. Form/feed: null. */
  source_snippet: string | null;
}

export interface LineItem {
  description: string;
  amount: Usd;
}

/** Output of intake, the same shape for FORM, DOCUMENT, and FEED. */
export interface ExtractedBill {
  source: IntakeSource;
  vendor_name: FieldWithConfidence<string>;
  invoice_number: FieldWithConfidence<string>;
  account_number: FieldWithConfidence<string>;
  service_address: FieldWithConfidence<string>;
  due_date: FieldWithConfidence<IsoDate>;
  billing_period_start: FieldWithConfidence<IsoDate>;
  billing_period_end: FieldWithConfidence<IsoDate>;
  total_amount: FieldWithConfidence<Usd>;
  usage_qty: FieldWithConfidence<number>;
  usage_unit: FieldWithConfidence<UsageUnit>;
  line_items: LineItem[];
  /** Set when the intake agent failed or timed out. Fields may be partly null. */
  extraction_error: string | null;
  /** Model id used, for the audit row. Null for FORM/FEED. */
  extraction_model: string | null;
}

/** What the injector form and the FEED replay send. Strings as typed; normalization happens in intake. */
export interface BillFormInput {
  vendor_name: string;
  invoice_number: string;
  account_number?: string;
  service_address?: string;
  due_date: IsoDate;
  billing_period_start?: IsoDate;
  billing_period_end?: IsoDate;
  total_amount: Usd;
  usage_qty?: number;
  usage_unit?: UsageUnit;
  line_items?: LineItem[];
}

export interface UploadedDocument {
  filename: string;
  media_type: "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
  /** Base64, no data: prefix, no newlines. */
  data_base64: string;
}

export type ProcessBillInput =
  | { kind: "FORM"; form: BillFormInput }
  | { kind: "FEED"; form: BillFormInput; feed_label: string }
  | { kind: "DOCUMENT"; document: UploadedDocument };

// ---------------------------------------------------------------------------
// Matching (deterministic, src/match/, no model imports)
// ---------------------------------------------------------------------------

export type MatchMethod =
  | "EXACT_ACCOUNT"
  | "HUMAN_ALIAS"
  | "ADDRESS"
  | "HUMAN_ASSIGNED"
  | "UNRESOLVED";

export interface PropertyCandidate {
  property_id: PropertyId;
  property_name: string;
  score: Confidence;
  /** Plain English, e.g. "street 1880 Lombard matches; unit #B not on property (cap 0.80)". */
  reason: string;
}

export interface MatchResult {
  vendor_id: VendorId | null;
  /** How the vendor was found, for the audit row. */
  vendor_match: "EXACT_NAME" | "ALIAS" | "ACCOUNT" | "NONE";
  property_id: PropertyId | null;
  method: MatchMethod;
  confidence: Confidence;
  candidates: PropertyCandidate[];
  /** Set when the account belongs to a different vendor than the name on the bill. */
  vendor_account_conflict: boolean;
  /** The alias key the human would teach if they assign this bill. */
  address_key: string | null;
}

// ---------------------------------------------------------------------------
// Vendor verification (CRS sandbox, optional, behind LINTEL_CRS_ENABLED)
// ---------------------------------------------------------------------------

export interface CrsResult {
  outcome: "PASS" | "FLAGGED" | "UNAVAILABLE" | "NOT_RUN";
  /** Exactly what the sandbox returned. Never synthesized. */
  request_id: string | null;
  identity_ref: string | null;
  signals: string[];
  /** Raw response body excerpt for the audit, or the error text. */
  detail: string;
}

// ---------------------------------------------------------------------------
// Guardrails + decision (deterministic, src/engine/, no model imports)
// ---------------------------------------------------------------------------

export type BillStatus =
  /** Will pay, no human needed (or a human approved). */
  | "CLEARED"
  /** Paused for a person. */
  | "HELD"
  /** Refused. No pay control exists for this status. */
  | "BLOCKED"
  /** A human rejected a HELD bill. */
  | "REJECTED";

/** Why a bill is HELD or BLOCKED. A bill can carry several; the status comes from the highest priority one. */
export type ReasonCode =
  // BLOCKED (priority 1)
  | "EXACT_DUPLICATE"
  | "FUZZY_DUPLICATE"
  | "LINE_SUM_MISMATCH"
  | "CRS_FLAGGED"
  // HELD (priority 2): cannot trust the bill or where it goes
  | "MISSING_FIELD"
  | "LOW_CONFIDENCE"
  | "EXTRACTION_FAILED"
  | "NEEDS_PROPERTY_MATCH"
  | "UNKNOWN_VENDOR"
  | "VENDOR_ACCOUNT_CONFLICT"
  // HELD (priority 3): the money looks wrong
  | "USAGE_SPIKE"
  | "AMOUNT_SPIKE"
  | "NO_BASELINE"
  // HELD (priority 4): vendor trust
  | "VENDOR_UNVERIFIED"
  | "CRS_UNAVAILABLE"
  // HELD (priority 5): policy
  | "OVER_AUTO_PAY_LIMIT"
  | "UTILITY_NOT_ACCOUNT_MATCHED";

export type ApproverRole = "NONE" | "OPERATOR" | "PROPERTY_MANAGER" | "VP_FINANCE";

export type CheckId =
  | "EXTRACTION"
  | "MATCH"
  | "EXACT_DUPLICATE"
  | "FUZZY_DUPLICATE"
  | "LINE_SUM"
  | "SPIKE"
  | "VENDOR_TRUST"
  | "POLICY";

export type CheckOutcome = "PASS" | "HALT" | "BLOCK" | "SKIP";

/** One row of the guardrail table on the why-card. Rationale always carries the numbers. */
export interface CheckResult {
  id: CheckId;
  outcome: CheckOutcome;
  reasons: ReasonCode[];
  /** e.g. "$5,680.00 vs 3-bill avg $1,490.00 (+281.2%), threshold +25%" */
  rationale: string;
  /** Machine-readable numbers for the UI (sparkline, chips). Shape per check in master-spec.md. */
  data: Record<string, string | number | boolean | null | Array<number | string>>;
}

export interface SpikeData {
  baseline_amounts: Usd[];
  baseline_avg_amount: Usd | null;
  amount_variance_pct: number | null;
  baseline_usage: number[];
  baseline_avg_usage: number | null;
  usage_variance_pct: number | null;
  threshold_pct: number;
}

export interface Decision {
  status: Exclude<BillStatus, "REJECTED">;
  reasons: ReasonCode[];
  required_approver: ApproverRole;
  /** Every check, including PASS and SKIP. Order = CheckId order above. */
  checks: CheckResult[];
  /** Bill this one duplicates, if any. Points at the original (PAID/CLEARED preferred). */
  duplicate_of: string | null;
  /** One deterministic sentence for the why-card. Built from checks, never by a model. */
  why: string;
  /** Only when CLEARED. */
  rail: PaymentRail | null;
}

// ---------------------------------------------------------------------------
// Bill record (what the DB stores and the UI renders)
// ---------------------------------------------------------------------------

export type ResolvedBy = "AUTO" | "HUMAN";

export interface PaymentInstruction {
  rail: PaymentRail;
  mode: "SIMULATED" | "LIVE_TESTNET";
  status: "SCHEDULED" | "SENT" | "FAILED";
  /** Simulated reference or a real testnet tx hash. Never a fake hash. */
  reference: string | null;
  idempotency_key: string;
}

export interface BillRecord {
  id: BillId;
  created_at: IsoTimestamp;
  source: IntakeSource;
  /** FEED label ("Saturday intake") or the uploaded filename. */
  source_label: string | null;
  extracted: ExtractedBill;
  match: MatchResult;
  crs: CrsResult;
  decision: Decision;
  /** Current status. Starts as decision.status; human actions move HELD to CLEARED or REJECTED. */
  status: BillStatus;
  resolved_by: ResolvedBy;
  payment: PaymentInstruction | null;
  /** Convenience copies for list views and totals. */
  vendor_name: string | null;
  property_name: string | null;
  amount: Usd | null;
}

// ---------------------------------------------------------------------------
// Audit log (append-only, hash-chained per bill)
// ---------------------------------------------------------------------------

export type Actor =
  | "AI_EXTRACTION"
  | "AI_INVESTIGATOR"
  | "DETERMINISTIC_RULE"
  | "HUMAN_INPUT"
  | "HUMAN_OPERATOR"
  | "HUMAN_ALIAS"
  | "SYSTEM_FEED"
  | "CRS_SANDBOX"
  | "PAYMENT_ROUTER";

export type AuditAction =
  | "INTAKE"
  | "EXTRACT_FIELDS"
  | "RESOLVE_VENDOR"
  | "RESOLVE_PROPERTY"
  | "CHECK"
  | "VERIFY_VENDOR"
  | "DECISION"
  | "ROUTE_PAYMENT"
  | "INVESTIGATION_STARTED"
  | "INVESTIGATION_COMPLETED"
  | "INVESTIGATION_FAILED"
  | "HUMAN_ASSIGN_PROPERTY"
  | "ALIAS_STORED"
  | "HUMAN_APPROVE"
  | "HUMAN_REJECT"
  | "DRAFT_SENT";

export type AuditDecision = "PASS" | "HALT" | "BLOCK" | "INFO" | "EXECUTE";

export interface AuditEvent {
  id: string;
  bill_id: BillId;
  /** 1-based position in this bill's chain. */
  seq: number;
  ts: IsoTimestamp;
  actor: Actor;
  action: AuditAction;
  decision: AuditDecision;
  /** Plain English with the exact numbers. Deterministic template except AI_* rows. */
  rationale: string;
  data: Record<string, unknown>;
  /** Hash of the previous event in this bill's chain; 64 zeros for seq 1. */
  prev_hash: string;
  /** sha256(prev_hash|bill_id|seq|ts|actor|action|decision|rationale) hex. */
  hash: string;
}

// ---------------------------------------------------------------------------
// Investigator agent (runs after the decision, cannot change status)
// ---------------------------------------------------------------------------

export type DraftKind =
  | "VENDOR_EMAIL"
  | "WORK_ORDER"
  | "APPROVAL_REQUEST"
  | "MATCH_SUGGESTION"
  | "VENDOR_ONBOARDING";

export interface DraftAction {
  kind: DraftKind;
  /** Role or address, e.g. "Property Manager, Shattuck Student Living". */
  to: string;
  subject: string;
  body: string;
  /** For MATCH_SUGGESTION only. The human still clicks Assign. */
  suggested_property_id: PropertyId | null;
}

export interface InvestigationBrief {
  bill_id: BillId;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  provider: "CREAO" | "CLAUDE" | null;
  /** 2-3 sentences. */
  summary: string;
  /** Evidence bullets, each citing a fact the agent looked up. */
  findings: string[];
  draft: DraftAction | null;
  creao_run_id: string | null;
  creao_share_url: string | null;
  error: string | null;
  started_at: IsoTimestamp;
  completed_at: IsoTimestamp | null;
  /** True once a human clicked Send on the draft. */
  draft_sent: boolean;
}

/** Read-only context the investigator gets. Built by code, not by the agent. */
export interface InvestigationContext {
  bill: BillRecord;
  property: Property | null;
  vendor: Vendor | null;
  /** Same property + vendor, newest first, max 6. */
  history: HistoricalBill[];
  /** Live bills for the same vendor or property, newest first, max 6. */
  related_bills: Pick<BillRecord, "id" | "status" | "amount" | "vendor_name" | "property_name" | "created_at">[];
  /** The policy card text, so the agent cites the same rules the code ran. */
  policy_text: string[];
}

// ---------------------------------------------------------------------------
// Lane function signatures (implementations live in the owner's folder)
// ---------------------------------------------------------------------------

/** Read-only snapshot of portfolio + ledger the pure functions need. Built by src/db. */
export interface LedgerSnapshot {
  properties: Property[];
  vendors: Vendor[];
  accounts: VendorAccount[];
  history: HistoricalBill[];
  /** Live bills already processed (all statuses). */
  bills: BillRecord[];
  aliases: AddressAlias[];
}

/** Pranil: src/intake/normalizeForm.ts */
export type NormalizeFormFn = (form: BillFormInput, source: "FORM" | "FEED") => ExtractedBill;

/** Pranil: src/agents/intake/extractDocument.ts. Must resolve within EXTRACTION_TIMEOUT_MS, never reject. */
export type ExtractDocumentFn = (doc: UploadedDocument) => Promise<ExtractedBill>;

/** Pranil: src/match/matchBill.ts. Pure, synchronous, no model import. */
export type MatchBillFn = (extracted: ExtractedBill, ledger: LedgerSnapshot) => MatchResult;

/** Pranil: src/integrations/crs/verifyVendor.ts. Never rejects; failures become UNAVAILABLE. */
export type VerifyVendorFn = (vendor: Vendor, bill: ExtractedBill) => Promise<CrsResult>;

/** Anmol: src/engine/decide.ts. Pure, synchronous, no model import, no IO. */
export type DecideFn = (input: {
  bill_id: BillId;
  extracted: ExtractedBill;
  match: MatchResult;
  crs: CrsResult;
  ledger: LedgerSnapshot;
}) => Decision;

/** Pranil: src/agents/investigator/investigate.ts. Never rejects; failures return status FAILED. */
export type InvestigateFn = (ctx: InvestigationContext) => Promise<InvestigationBrief>;

/** Anmol: src/pipeline/processBill.ts. The only write path for new bills. */
export interface ProcessBillResult {
  bill: BillRecord;
  events: AuditEvent[];
}
export type ProcessBillFn = (input: ProcessBillInput) => Promise<ProcessBillResult>;

// ---------------------------------------------------------------------------
// API shapes (Anmol serves, Piyush consumes). All JSON.
// ---------------------------------------------------------------------------

export interface BillView extends BillRecord {
  audit: AuditEvent[];
  investigation: InvestigationBrief | null;
}

export interface Totals {
  blocked: Usd;
  held: Usd;
  cleared: Usd;
  count: { blocked: number; held: number; cleared: number; rejected: number };
}

/** GET /api/bills */
export interface BillsResponse {
  bills: BillView[];
  totals: Totals;
  /** False if any bill's audit chain fails verification. */
  audit_chain_intact: boolean;
}

/** GET /api/portfolio */
export interface PortfolioResponse {
  properties: Property[];
  vendors: Vendor[];
  policy_text: string[];
  seats_line: string;
  real_vs_simulated: Array<{ component: string; status: "REAL" | "SIMULATED" | "SEEDED"; how_to_verify: string }>;
  flags: { crs_enabled: boolean; creao_enabled: boolean; x402_enabled: boolean; extraction_enabled: boolean };
}

/** POST /api/bills/process body: ProcessBillInput as JSON, or multipart with field "file". Returns BillView. */
/** POST /api/bills/:id/assign body. Returns BillView (re-evaluated). */
export interface AssignPropertyBody {
  property_id: PropertyId;
}
/** POST /api/bills/:id/approve and /reject body. Returns BillView. */
export interface HumanDecisionBody {
  note?: string;
}
/** POST /api/demo/replay returns the opening batch, in order. */
export interface ReplayResponse {
  bills: BillView[];
  totals: Totals;
}
