import type { CheckId, CheckResult } from "@/types/bill";

export const CHECK_IDS: CheckId[] = [
  "EXTRACTION",
  "MATCH",
  "EXACT_DUPLICATE",
  "FUZZY_DUPLICATE",
  "LINE_SUM",
  "SPIKE",
  "VENDOR_TRUST",
  "POLICY",
];

function unimplemented(id: CheckId): CheckResult {
  throw new Error(`Not implemented: ${id}`);
}

export const checkExtraction = () => unimplemented("EXTRACTION");
export const checkMatch = () => unimplemented("MATCH");
export const checkExactDuplicate = () => unimplemented("EXACT_DUPLICATE");
export const checkFuzzyDuplicate = () => unimplemented("FUZZY_DUPLICATE");
export const checkLineSum = () => unimplemented("LINE_SUM");
export const checkSpike = () => unimplemented("SPIKE");
export const checkVendorTrust = () => unimplemented("VENDOR_TRUST");
export const checkPolicy = () => unimplemented("POLICY");
