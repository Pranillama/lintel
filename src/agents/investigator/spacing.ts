/**
 * CREAO rate-limits bursts per API key for a few seconds, and replay drafts briefs
 * for three bills at once. Spacing the starts keeps every run under the limit.
 */
export const INVESTIGATION_SPACING_MS = 4_000;

/** When the next investigation should start: now, or one spacing after the latest planned start. */
export function nextInvestigationStart(now: number, plannedStarts: readonly number[], spacingMs = INVESTIGATION_SPACING_MS): number {
  const latest = plannedStarts.reduce((max, t) => Math.max(max, t), Number.NEGATIVE_INFINITY);
  return Math.max(now, latest + spacingMs);
}
