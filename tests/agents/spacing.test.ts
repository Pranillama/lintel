import { describe, expect, it } from "vitest";
import { INVESTIGATION_SPACING_MS, nextInvestigationStart } from "@/agents/investigator/spacing";

const NOW = Date.parse("2026-10-24T22:00:00Z");
const S = INVESTIGATION_SPACING_MS;

describe("nextInvestigationStart", () => {
  it("starts right away when nothing else is planned", () => {
    expect(nextInvestigationStart(NOW, [])).toBe(NOW);
  });

  it("starts right away when the last start is a spacing or more ago", () => {
    expect(nextInvestigationStart(NOW, [NOW - S, NOW - 3 * S])).toBe(NOW);
  });

  it("spaces a replay's three briefs one spacing apart", () => {
    const first = nextInvestigationStart(NOW, []);
    const second = nextInvestigationStart(NOW, [first]);
    const third = nextInvestigationStart(NOW, [first, second]);
    expect([second - first, third - second]).toEqual([S, S]);
  });

  it("queues behind a start already planned in the future", () => {
    expect(nextInvestigationStart(NOW, [NOW + 2 * S, NOW - S])).toBe(NOW + 3 * S);
  });
});
