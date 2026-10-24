/**
 * CREAO Path A (agent.creao.ai). Server-side only: CREAO_API_KEY and
 * CREAO_AGENT_ID are read here and sent as a bearer token, never to the browser.
 * context/reference/creao-api.md §2.
 */
import { z } from "zod";
import type { InvestigationContext } from "@/types/bill";

const CREAO_RUNS_URL = "https://agent.creao.ai/api/v1/runs";
const CREAO_BUDGET_MS = 90_000;
const CREAO_POLL_MS = 2_000;

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
      suggested_property_id: z.string().nullable(),
    })
    .nullable(),
});

export type InvestigationOutput = z.infer<typeof investigationOutputSchema>;

const creaoStartSchema = z.object({
  id: z.string().min(1),
});

const creaoRunSchema = z.object({
  status: z.string(),
  result: z
    .object({
      text: z.string(),
    })
    .nullish(),
});

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
      const text = run.result?.text;
      if (!text || text.trim() === "") throw new Error("CREAO completed without result text");
      const output = investigationOutputSchema.parse(parseModelJson(text));
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
  if (!response.ok) throw new Error(`CREAO request failed (${response.status})`);
  return (await response.json()) as unknown;
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
