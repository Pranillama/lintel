/**
 * The AP desk contract the screen is built on.
 *
 * `DeskData` and `DeskActions` mirror the Convex functions one to one
 * (listBills, getPortfolio, processBill, humanResume, addProperty, addVendor,
 * addVendorAccount). The page gets them from Convex through `useConvexDesk`.
 * Components never call Convex directly and never compute
 * a status, a total, a percentage, or a why-sentence: they render what the desk gives them.
 */
import type {
  Actor,
  ApproverRole,
  BillFormInput,
  BillStatus,
  BillView,
  CheckId,
  PortfolioResponse,
  Property,
  ReasonCode,
  Totals,
  UploadedDocument,
  Vendor,
  VendorAccount,
} from "@/types/bill";
import type { NewAccountInput, NewPropertyInput, NewVendorInput } from "@/portfolio/admin";

export interface DeskData {
  /** Newest first, as listBills returns them. */
  bills: BillView[];
  totals: Totals | undefined;
  auditChainIntact: boolean;
  portfolio: PortfolioResponse | undefined;
  /** True until the first listBills result arrives. */
  loading: boolean;
}

/** Every action rejects with an Error whose message is safe to show inline (ConvexError text). */
export interface DeskActions {
  /** processBill({ kind: "FORM", form }). */
  processForm(form: BillFormInput): Promise<BillView>;
  /** processBill({ kind: "DOCUMENT", document }). */
  processDocument(document: UploadedDocument): Promise<BillView>;
  /** humanResume({ kind: "assign" }). Stores the address alias and re-runs the engine. */
  assign(billId: string, propertyId: string, note?: string): Promise<BillView>;
  /** humanResume({ kind: "approve" }). */
  approve(billId: string, note?: string): Promise<BillView>;
  /** humanResume({ kind: "reject" }). */
  reject(billId: string, note?: string): Promise<BillView>;
  /** humanResume({ kind: "send-draft" }). Logs an audit row; nothing leaves the app. */
  sendDraft(billId: string): Promise<BillView>;
  /** addProperty. Resolves with the saved property. */
  addProperty(input: NewPropertyInput): Promise<Property>;
  /** addVendor. Resolves with the saved vendor. */
  addVendor(input: NewVendorInput): Promise<Vendor>;
  /** addVendorAccount. Utilities only. */
  addAccount(input: NewAccountInput): Promise<VendorAccount>;
}

export type BlotterTab = "all" | "held" | "blocked" | "cleared" | "live";

/* ---------- Shared labels (display only, never logic) ---------- */

export const STATUS_LABEL: Record<BillStatus, string> = {
  CLEARED: "Cleared",
  HELD: "Needs you",
  BLOCKED: "Blocked",
  REJECTED: "Rejected",
};

export const APPROVER_LABEL: Record<ApproverRole, string> = {
  NONE: "No approver",
  OPERATOR: "Operator",
  PROPERTY_MANAGER: "Property Manager",
  VP_FINANCE: "VP Finance",
};

export const CHECK_LABEL: Record<CheckId, string> = {
  EXTRACTION: "Extraction",
  MATCH: "Match",
  EXACT_DUPLICATE: "Exact duplicate",
  FUZZY_DUPLICATE: "Fuzzy duplicate",
  LINE_SUM: "Line sum",
  SPIKE: "Spike",
  VENDOR_TRUST: "Vendor trust",
  POLICY: "Policy",
};

/** Short, plain names for engine reason codes (sublines and chips). */
export const REASON_LABEL: Record<ReasonCode, string> = {
  EXACT_DUPLICATE: "Exact duplicate",
  FUZZY_DUPLICATE: "Likely duplicate",
  LINE_SUM_MISMATCH: "Lines don’t add up",
  CRS_FLAGGED: "Vendor flagged by CRS",
  MISSING_FIELD: "Missing field",
  LOW_CONFIDENCE: "Low-confidence read",
  EXTRACTION_FAILED: "Couldn’t read the bill",
  NEEDS_PROPERTY_MATCH: "Needs a property",
  UNKNOWN_VENDOR: "Unknown vendor",
  VENDOR_ACCOUNT_CONFLICT: "Account belongs to another vendor",
  USAGE_SPIKE: "Usage spike",
  AMOUNT_SPIKE: "Amount spike",
  NO_BASELINE: "No baseline yet",
  VENDOR_UNVERIFIED: "Vendor not verified",
  CRS_UNAVAILABLE: "Vendor check unavailable",
  OVER_AUTO_PAY_LIMIT: "Over auto-pay limit",
  UTILITY_NOT_ACCOUNT_MATCHED: "Utility not matched by account",
};

export type ActorFamily = "AI" | "CODE" | "HUMAN" | "CRS";

/** Groups audit actors the way the tagline reads: AI reads · CODE decides · HUMAN owns. */
export function actorFamily(actor: Actor): ActorFamily {
  if (actor === "AI_EXTRACTION" || actor === "AI_INVESTIGATOR") return "AI";
  if (actor === "HUMAN_INPUT" || actor === "HUMAN_OPERATOR" || actor === "HUMAN_ALIAS") return "HUMAN";
  if (actor === "CRS_SANDBOX") return "CRS";
  return "CODE"; // DETERMINISTIC_RULE, PAYMENT_ROUTER, SYSTEM_FEED
}

/** Message to show inline for a failed desk action. ConvexError carries its text in `data`. */
export function errorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const data = (err as { data?: unknown }).data;
    if (typeof data === "string" && data) return data;
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message) return message.replace(/^\[CONVEX[^\]]*\]\s*/, "").replace(/^Uncaught (ConvexError|Error):\s*/, "");
  }
  return "Something went wrong. Try again.";
}

/** Tab filter. Display grouping only; statuses come from the engine. */
export function inTab(bill: BillView, tab: BlotterTab): boolean {
  switch (tab) {
    case "all": return true;
    case "held": return bill.status === "HELD";
    case "blocked": return bill.status === "BLOCKED";
    case "cleared": return bill.status === "CLEARED";
    case "live": return bill.source !== "FEED";
  }
}
