/**
 * Policy constants and the copy that describes them. FROZEN.
 *
 * The engine imports the numbers from here and the UI / investigator / README
 * show the text from here, so the policy card can never drift from the code.
 */

export const POLICY = {
  /** Spike: trip when amount or usage is MORE than this % above the baseline average. */
  SPIKE_THRESHOLD_PCT: 25,
  /** Baseline = this many most recent prior paid/cleared bills, same vendor + property. */
  BASELINE_BILLS: 3,
  /** Fewer peers than this = NO_BASELINE hold. */
  MIN_BASELINE_BILLS: 2,
  /** Fuzzy duplicate: amount within this fraction of a prior bill... */
  FUZZY_DUP_AMOUNT_PCT: 2,
  /** ...and due dates within this many days. 20, not 30: monthly flat fees (trash, landscaping) recur ~30 days apart. */
  FUZZY_DUP_WINDOW_DAYS: 20,
  /** Line items must sum to the printed total within this many dollars. */
  LINE_SUM_TOLERANCE_USD: 0.01,
  /** Critical extracted fields below this confidence hold the bill. */
  MIN_FIELD_CONFIDENCE: 0.85,
  /** Property match below this holds the bill. */
  MIN_MATCH_CONFIDENCE: 0.9,
  /** Address matches with a unit that is not on the property are capped here. */
  UNIT_NOT_ON_PROPERTY_CAP: 0.8,
  /** Top two property candidates closer than this = ambiguous, hold. */
  AMBIGUOUS_MATCH_GAP: 0.1,
  /** Above the property auto-pay limit: Property Manager approves up to this, VP Finance above. */
  VP_FINANCE_ABOVE_USD: 5000,
  /** Intake agent hard timeout; a timeout becomes a HELD bill, never a spinner. */
  EXTRACTION_TIMEOUT_MS: 20_000,
} as const;

export const POLICY_TEXT: string[] = [
  `Enrolled utilities are approved for payment through the utility portal when the account number matches exactly, the bill is not a duplicate, and amount and usage are within +${POLICY.SPIKE_THRESHOLD_PCT}% of the last ${POLICY.BASELINE_BILLS} bills. The property auto-pay limit does not apply to enrolled autopay.`,
  `Contractors are approved for payment by ACH only when the vendor is verified and the amount is at or under the property's auto-pay limit. Above it, a Property Manager approves up to $${POLICY.VP_FINANCE_ABOVE_USD.toLocaleString("en-US")}; VP Finance above that.`,
  `Duplicates are blocked: same vendor and invoice number at any time, or same vendor, property, and amount within ${POLICY.FUZZY_DUP_AMOUNT_PCT}% due within ${POLICY.FUZZY_DUP_WINDOW_DAYS} days. Blocked bills have no pay control.`,
  `Line items that do not add up to the printed total are blocked.`,
  `Missing fields, fields read below ${POLICY.MIN_FIELD_CONFIDENCE.toFixed(2)} confidence, property matches below ${POLICY.MIN_MATCH_CONFIDENCE.toFixed(2)}, and unknown vendors are held for a person.`,
  `AI reads bills and drafts follow-ups. It cannot approve, pay, or change a bill's status. Thresholds are read-only at this desk.`,
];

export const SEATS_LINE = "Fills 2 full-time property AP and utility-audit seats on a 250-property portfolio.";
