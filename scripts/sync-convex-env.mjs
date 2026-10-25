// Copies the server variables in .env.local into the Convex deployment, where actions read them.
// Skips the public URL, Convex's own settings, and empty values. Never prints a value.
//
//   node scripts/sync-convex-env.mjs          # the dev deployment in .env.local
//   node scripts/sync-convex-env.mjs --prod   # extra flags go to `npx convex env set`

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const extra = process.argv.slice(2);

const vars = readFileSync(path.join(root, ".env.local"), "utf8")
  .split("\n")
  .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
  .filter(Boolean)
  .map(([, name, raw]) => [name, raw.replace(/^(['"])(.*)\1$/, "$2")])
  .filter(([name, value]) => value !== "" && !name.startsWith("NEXT_PUBLIC_") && !name.startsWith("CONVEX_"));

let failed = 0;
for (const [name, value] of vars) {
  try {
    execFileSync("npx", ["convex", "env", "set", ...extra, name, value], { cwd: root, stdio: "ignore" });
    console.log(`set ${name}`);
  } catch {
    failed += 1;
    console.error(`FAILED ${name}`);
  }
}
if (failed > 0) process.exitCode = 1;
