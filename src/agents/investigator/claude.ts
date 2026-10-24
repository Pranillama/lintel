/**
 * Claude fallback. One messages call with the whole InvestigationContext.
 * The installed SDK has no messages.parse, so the text is zod-parsed with the
 * same brief schema CREAO uses. pranil-spec §4.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { InvestigationContext } from "@/types/bill";
import { investigationOutputSchema, type InvestigationOutput } from "@/integrations/creao/client";

const CLAUDE_TIMEOUT_MS = 45_000;
const DEFAULT_MODEL = "claude-opus-5-5";

type InvestigatorRequest = Anthropic.MessageCreateParamsNonStreaming & {
  output_config: { effort: "medium" };
};

export async function draftWithClaude(ctx: InvestigationContext, system: string): Promise<InvestigationOutput> {
  assertServer();
  const model = (process.env.LINTEL_INVESTIGATOR_MODEL ?? DEFAULT_MODEL) as Anthropic.Model;
  const params: InvestigatorRequest = {
    model,
    max_tokens: 16_000,
    system,
    messages: [{ role: "user", content: `InvestigationContext:\n${JSON.stringify(ctx)}` }],
    output_config: { effort: "medium" },
  };
  const client = new Anthropic();
  const message = await client.messages.create(params, {
    timeout: CLAUDE_TIMEOUT_MS,
    maxRetries: 0,
  });
  if (message.stop_reason === "refusal") throw new Error("Claude refused the investigation");
  const text = textFrom(message);
  if (!text) throw new Error("Claude returned no text");
  return investigationOutputSchema.parse(parseModelJson(text));
}

function assertServer(): void {
  if (typeof window !== "undefined") {
    throw new Error("Claude investigator is server-side only");
  }
}

function textFrom(message: Anthropic.Message): string {
  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === "text") parts.push(block.text);
  }
  return parts.join("\n").trim();
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
