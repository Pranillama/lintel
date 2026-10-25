import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function filesUnder(dir: string): string[] {
  const abs = path.join(process.cwd(), dir);
  return readdirSync(abs).flatMap((name) => {
    const rel = path.join(dir, name);
    return statSync(path.join(process.cwd(), rel)).isDirectory() ? filesUnder(rel) : [rel];
  });
}

function source(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("AI boundary", () => {
  it("keeps the engine, matcher, and voice facts free of models, Convex, and IO", () => {
    const offenders: string[] = [];
    for (const rel of [...filesUnder("src/engine"), ...filesUnder("src/match"), ...filesUnder("src/voice")]) {
      if (!rel.endsWith(".ts")) continue;
      const text = source(rel);
      if (
        text.includes("@anthropic-ai/sdk") ||
        text.includes("src/agents") ||
        text.includes("src/integrations") ||
        text.includes("convex/") ||
        text.includes("node:fs") ||
        text.includes("fetch(") ||
        text.includes("Date.now(")
      ) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("allows fetch only in Convex actions", () => {
    const allowed = [/^convex\/intake\//, /^convex\/crs\//, /^convex\/payments\//, /^convex\/pipeline\//];
    const offenders = filesUnder("convex")
      .filter((rel) => rel.endsWith(".ts") && !rel.includes("_generated"))
      .filter((rel) => source(rel).includes("fetch("))
      .filter((rel) => !allowed.some((pattern) => pattern.test(rel)));
    expect(offenders).toEqual([]);
  });
});
