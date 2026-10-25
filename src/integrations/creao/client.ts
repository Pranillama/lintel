/**
 * CREAO Path A (agent.creao.ai). Server-side only: CREAO_API_KEY and
 * CREAO_AGENT_ID are read here and sent as a bearer token, never to the browser.
 * context/reference/creao-api.md §2.
 */
import { z } from "zod";
import type { InvestigationContext } from "@/types/bill";

const CREAO_RUNS_URL = "https://agent.creao.ai/api/v1/runs";
const CREAO_BUDGET_MS = 90_000;
// Every status check counts against CREAO's per-key rate limit; 4s halves the requests per run.
const CREAO_POLL_MS = 4_000;
/** How much of a non-brief answer the fallback log keeps. */
const ANSWER_SNIPPET = 300;

export const investigationOutputSchema = z.object({
  summary: z.string().min(1),
  findings: z.array(z.string().min(1)),
  draft: z
    .object({
      kind: z.enum([
        "VENDOR_EMAIL",
        "WORK_ORDER",
        "APPROVAL_REQUEST",
        "MATCH_SUGGESTION",
        "VENDOR_ONBOARDING",
      ]),
      to: z.string().min(1),
      subject: z.string().min(1),
      body: z.string().min(1),
      // The agent often leaves this key out instead of writing null; both mean "no property".
      suggested_property_id: z.string().nullish().transform((id) => id ?? null),
    })
    .nullable(),
});

export type InvestigationOutput = z.infer<typeof investigationOutputSchema>;

const creaoStartSchema = z.object({
  id: z.string().min(1),
});

const creaoArtifactSchema = z.object({
  id: z.string().nullish(),
  type: z.string().nullish(),
  url: z.string().nullish(),
});

const creaoRunSchema = z.object({
  status: z.string(),
  result: z
    .object({
      text: z.string().nullish(),
      artifacts: z.array(creaoArtifactSchema).nullish(),
    })
    .nullish(),
});

type CreaoRunResult = z.infer<typeof creaoRunSchema>["result"];

export async function runCreao(ctx: InvestigationContext): Promise<{
  output: InvestigationOutput;
  creao_run_id: string;
}> {
  assertServer();
  const apiKey = process.env.CREAO_API_KEY?.trim() ?? "";
  const appId = process.env.CREAO_AGENT_ID?.trim() ?? "";
  if (!apiKey || !appId) {
    throw new Error("CREAO_API_KEY and CREAO_AGENT_ID are required");
  }

  const deadline = Date.now() + CREAO_BUDGET_MS;
  const started = creaoStartSchema.parse(
    await creaoFetch(CREAO_RUNS_URL, apiKey, deadline, {
      method: "POST",
      body: JSON.stringify({
        appId,
        inputs: { prompt: JSON.stringify(ctx) },
        idempotencyKey: `lintel-inv-${ctx.bill.id}`,
      }),
    }),
  );

  const runUrl = `${CREAO_RUNS_URL}/${encodeURIComponent(started.id)}`;
  for (let attempt = 0; attempt < 46; attempt += 1) {
    if (Date.now() >= deadline) break;
    const run = creaoRunSchema.parse(await creaoFetch(runUrl, apiKey, deadline, { method: "GET" }));
    if (run.status === "completed") {
      const output = await readCompletedOutput(run.result, started.id, apiKey, deadline);
      return { output, creao_run_id: started.id };
    }
    if (run.status === "failed" || run.status === "cancelled") {
      throw new Error(`CREAO run ${run.status}`);
    }
    const wait = Math.min(CREAO_POLL_MS, deadline - Date.now());
    if (wait <= 0) break;
    await sleep(wait);
  }
  throw new Error("CREAO timed out after 90s");
}

/**
 * Skills write `{ summary, findings, draft }` onto a JSON artifact.
 * `result.text` is often only the skill input summary, so a matching brief
 * in text wins and an artifact is fetched only when text is missing or invalid.
 */
async function readCompletedOutput(
  result: CreaoRunResult,
  runId: string,
  apiKey: string,
  deadline: number,
): Promise<InvestigationOutput> {
  const fromText = investigationFromText(result?.text);
  if (fromText) return fromText;

  const artifactUrl = jsonArtifactUrl(result?.artifacts);
  if (artifactUrl) {
    const payload = await creaoFetch(artifactUrl, apiKey, deadline, { method: "GET" });
    const parsed = investigationOutputSchema.safeParse(payload);
    if (parsed.success) return parsed.data;
    throw new Error(`CREAO run ${runId} returned no brief (artifact ${describeAnswer(payload)})`);
  }

  // Name what came back so the fallback log shows how the agent's answer drifted from the brief.
  throw new Error(`CREAO run ${runId} returned no brief (text ${describeText(result?.text)}; ${result?.artifacts?.length ?? 0} artifacts)`);
}

function investigationFromText(text: string | null | undefined): InvestigationOutput | null {
  if (!text || text.trim() === "") return null;
  try {
    const parsed = investigationOutputSchema.safeParse(parseModelJson(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function describeText(text: string | null | undefined): string {
  if (!text || text.trim() === "") return "empty";
  try {
    return describeAnswer(parseModelJson(text));
  } catch {
    return `not JSON: ${text.trim().slice(0, ANSWER_SNIPPET)}`;
  }
}

function describeAnswer(value: unknown): string {
  const shape = value !== null && typeof value === "object" && !Array.isArray(value) ? `keys: ${Object.keys(value).join(", ") || "none"}` : `a JSON ${Array.isArray(value) ? "array" : typeof value}`;
  return `${shape}: ${JSON.stringify(value).slice(0, ANSWER_SNIPPET)}`;
}

function jsonArtifactUrl(
  artifacts: ReadonlyArray<z.infer<typeof creaoArtifactSchema>> | null | undefined,
): string | null {
  for (const artifact of artifacts ?? []) {
    const url = artifact.url ?? "";
    const id = artifact.id ?? "";
    const isJson = artifact.type === "application/json" || url.endsWith(".json") || id.endsWith(".json");
    if (isJson && url !== "") return url;
  }
  return null;
}

function assertServer(): void {
  if (typeof window !== "undefined") {
    throw new Error("CREAO is server-side only");
  }
}

async function creaoFetch(
  url: string,
  apiKey: string,
  deadline: number,
  init: { method: "GET" | "POST"; body?: string },
): Promise<unknown> {
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("CREAO timed out after 90s");
    let response: Response;
    try {
      response = await fetch(url, {
        method: init.method,
        body: init.body,
        signal: AbortSignal.timeout(remaining),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
      });
    } catch (err) {
      if (Date.now() >= deadline) throw new Error("CREAO timed out after 90s");
      throw err;
    }
    // CREAO rate-limits bursts per key for a few seconds; wait it out inside the budget.
    if (response.status === 429) {
      const seconds = Number.parseFloat(response.headers.get("Retry-After") ?? "");
      const wait = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : CREAO_POLL_MS;
      if (Date.now() + wait >= deadline) throw new Error(`CREAO request failed (429, retry after ${Number.isFinite(seconds) ? seconds : "?"}s)`);
      await sleep(wait);
      continue;
    }
    if (!response.ok) throw new Error(`CREAO request failed (${response.status})`);
    return (await response.json()) as unknown;
  }
}

function parseModelJson(text: string): unknown {
  return JSON.parse(stripMarkdownFences(text)) as unknown;
}

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const inner = fenced?.[1];
  return inner ? inner.trim() : trimmed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
