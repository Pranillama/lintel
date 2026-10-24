/**
 * The AP desk contract the screen is built on.
 *
 * `DeskData` and `DeskActions` mirror the Convex functions one to one
 * (listBills, getPortfolio, processBill, humanResume, replayOpening). CommandCenter
 * gets them from Convex through `useConvexDesk`; tests and the preview use a mock
 * desk with the same shape. Components never call Convex directly and never compute
 * a status, a total, a percentage, or a why-sentence: they render what the desk gives them.
 */
import type {
  ActorFamily,
} from "./ActorChip";
import type {
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
} from "@/types/bill";

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
  /** replayOpening: wipes live bills and replays the 4 opening bills. */
  replay(): Promise<void>;
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
}

export type DrawerKind = "judge" | "policy" | "rvs";
export type BlotterTab = "all" | "held" | "blocked" | "cleared" | "live";

/* ---------- Component props (one owner per component) ---------- */

export interface HeaderBarProps {
  tab: BlotterTab;
  onTab(tab: BlotterTab): void;
  /** Bill counts per tab, from the bills list (not money). */
  counts: Record<BlotterTab, number>;
  seatsLine: string | undefined;
  propertiesLoaded: number;
  openDrawer: DrawerKind | null;
  onOpenDrawer(kind: DrawerKind): void;
}

export interface TotalsBarProps {
  totals: Totals | undefined;
  auditChainIntact: boolean;
  /** "Saturday intake" (the FEED label) or "Live desk". */
  intakeLabel: string;
  /** Count the numbers up when they land (opening replay). Off for reduced motion. */
  countUp: boolean;
}

export interface BlotterProps {
  /** Bills already filtered by the active tab, newest first. */
  bills: BillView[];
  tab: BlotterTab;
  selectedId: string | null;
  onSelect(billId: string): void;
  intakeLabel: string;
  onReplay(): void;
  /** Replay in flight: show 4 reading skeletons. */
  replaying: boolean;
  /** Bill that just arrived from the judge drawer; flash it once. */
  flashId: string | null;
}

export interface BillRowProps {
  bill: BillView;
  selected: boolean;
  onSelect(billId: string): void;
  flash: boolean;
  /** Position in the opening reveal, for the 250 ms stagger. */
  revealIndex: number;
}

export interface DetailPaneProps {
  /** Selected bill, or undefined when nothing is selected yet. */
  bill: BillView | undefined;
  properties: Property[];
  actions: DeskActions;
  /** From listBills.audit_chain_intact, for the audit footer. */
  auditChainIntact: boolean;
}

export interface JudgeDrawerProps {
  onClose(): void;
  actions: DeskActions;
  /** Called with the new bill so CommandCenter can select and flash it. */
  onCreated(bill: BillView): void;
}

export interface PortfolioDrawerProps {
  onClose(): void;
  portfolio: PortfolioResponse | undefined;
}

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

export type { ActorFamily };

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
