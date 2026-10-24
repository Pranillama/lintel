import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { POLICY } from "@/seed/policy";
import { roundUsd } from "@/shared/normalize";
import type {
  ExtractDocumentFn,
  ExtractedBill,
  FieldWithConfidence,
  LineItem,
  UploadedDocument,
  UsageUnit,
} from "@/types/bill";

const MODEL_DEFAULT = "claude-haiku-5-5";
const MAX_TOKENS = 4000;

/**
 * Families that accept `output_config.effort`. Haiku 4.5 and earlier Sonnet 4.5
 * snapshots reject it; a 400 that names effort is retried once without the field.
 */
const EFFORT_MODEL_PREFIXES = [
  "claude-haiku-5",
  "claude-sonnet-5",
  "claude-opus-5",
  "claude-fable-5",
  "claude-mythos-5",
  "claude-mythos-preview",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-opus-4-5",
  "claude-sonnet-4-6",
] as const;

const INSTRUCTION = `Extract the printed fields from this invoice or utility bill.

Rules:
- Extract only what is printed. If a field is absent, set value to null, confidence to 0, and source_snippet to null.
- Never compute or infer totals. total_amount is the printed total only. Do not add line items, rates, or usage into a total.
- source_snippet is a verbatim quote from the document, copied exactly, or null when the value is null.
- confidence is a number from 0 to 1.
- Dates must be YYYY-MM-DD or null.
- usage_unit must be KWH, CCF, THERM, YD3, or null.
- line_items are printed rows only.
- Do not include a status, a payment decision, or a recommendation.`;

const quotedField = z.object({
  value: z.string().nullable(),
  confidence: z.number(),
  source_snippet: z.string().nullable(),
});

const measuredField = z.object({
  value: z.number().nullable(),
  confidence: z.number(),
  source_snippet: z.string().nullable(),
});

const ExtractedDocumentSchema = z.object({
  vendor_name: quotedField,
  invoice_number: quotedField,
  account_number: quotedField,
  service_address: quotedField,
  due_date: quotedField,
  billing_period_start: quotedField,
  billing_period_end: quotedField,
  total_amount: measuredField,
  usage_qty: measuredField,
  usage_unit: z.object({
    value: z.enum(["KWH", "CCF", "THERM", "YD3"]).nullable(),
    confidence: z.number(),
    source_snippet: z.string().nullable(),
  }),
  line_items: z.array(
    z.object({
      description: z.string(),
      amount: z.number(),
    }),
  ),
});

type ParsedDocument = z.infer<typeof ExtractedDocumentSchema>;
type Quoted = ParsedDocument["vendor_name"];
type Measured = ParsedDocument["total_amount"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const REQUEST_OPTIONS = {
  timeout: POLICY.EXTRACTION_TIMEOUT_MS,
  maxRetries: 0,
} as const;

function resolveModel(): string {
  const configured = process.env.LINTEL_EXTRACT_MODEL?.trim();
  return configured ? configured : MODEL_DEFAULT;
}

function modelAcceptsEffort(model: string): boolean {
  const id = model.toLowerCase();
  return EFFORT_MODEL_PREFIXES.some((prefix) => id === prefix || id.startsWith(`${prefix}-`));
}

function isEffortRejection(err: unknown): boolean {
  if (!(err instanceof Error) || !/effort/i.test(err.message)) return false;
  if ("status" in err && typeof err.status === "number" && err.status !== 400) return false;
  return true;
}

function errorText(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  return "Extraction failed.";
}

function emptyField<T>(): FieldWithConfidence<T> {
  return { value: null, confidence: 0, source_snippet: null };
}

function failedExtraction(model: string, extraction_error: string): ExtractedBill {
  return {
    source: "DOCUMENT",
    vendor_name: emptyField(),
    invoice_number: emptyField(),
    account_number: emptyField(),
    service_address: emptyField(),
    due_date: emptyField(),
    billing_period_start: emptyField(),
    billing_period_end: emptyField(),
    total_amount: emptyField(),
    usage_qty: emptyField(),
    usage_unit: emptyField(),
    line_items: [],
    extraction_error,
    extraction_model: model,
  };
}

function clampConfidence(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function quote(snippet: string | null): string | null {
  if (snippet === null || snippet.length === 0) return null;
  return snippet;
}

function textField(field: Quoted): FieldWithConfidence<string> {
  const value = field.value?.trim() ?? "";
  if (!value) return emptyField();
  return {
    value,
    confidence: clampConfidence(field.confidence),
    source_snippet: quote(field.source_snippet),
  };
}

function dateField(field: Quoted): FieldWithConfidence<string> {
  const text = textField(field);
  if (text.value === null || ISO_DATE.test(text.value)) return text;
  return emptyField();
}

function numberField(field: Measured, money: boolean): FieldWithConfidence<number> {
  if (field.value === null || !Number.isFinite(field.value)) return emptyField();
  return {
    value: money ? roundUsd(field.value) : field.value,
    confidence: clampConfidence(field.confidence),
    source_snippet: quote(field.source_snippet),
  };
}

function usageField(field: ParsedDocument["usage_unit"]): FieldWithConfidence<UsageUnit> {
  if (field.value === null) return emptyField();
  return {
    value: field.value,
    confidence: clampConfidence(field.confidence),
    source_snippet: quote(field.source_snippet),
  };
}

function lineItems(items: ParsedDocument["line_items"]): LineItem[] {
  const lines: LineItem[] = [];
  for (const item of items) {
    if (!Number.isFinite(item.amount)) continue;
    lines.push({ description: item.description, amount: roundUsd(item.amount) });
  }
  return lines;
}

function toBill(parsed: ParsedDocument, model: string): ExtractedBill {
  return {
    source: "DOCUMENT",
    vendor_name: textField(parsed.vendor_name),
    invoice_number: textField(parsed.invoice_number),
    account_number: textField(parsed.account_number),
    service_address: textField(parsed.service_address),
    due_date: dateField(parsed.due_date),
    billing_period_start: dateField(parsed.billing_period_start),
    billing_period_end: dateField(parsed.billing_period_end),
    total_amount: numberField(parsed.total_amount, true),
    usage_qty: numberField(parsed.usage_qty, false),
    usage_unit: usageField(parsed.usage_unit),
    line_items: lineItems(parsed.line_items),
    extraction_error: null,
    extraction_model: model,
  };
}

function fileBlock(doc: UploadedDocument) {
  if (doc.media_type === "application/pdf") {
    return {
      type: "document" as const,
      source: {
        type: "base64" as const,
        media_type: "application/pdf" as const,
        data: doc.data_base64,
      },
    };
  }
  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: doc.media_type,
      data: doc.data_base64,
    },
  };
}

function requestBody(doc: UploadedDocument, model: string, useEffort: boolean) {
  return {
    model,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: "user" as const,
        content: [fileBlock(doc), { type: "text" as const, text: INSTRUCTION }],
      },
    ],
    output_config: {
      format: zodOutputFormat(ExtractedDocumentSchema),
      ...(useEffort ? { effort: "low" as const } : {}),
    },
  };
}

async function parseDocument(doc: UploadedDocument, model: string) {
  const client = new Anthropic();
  const useEffort = modelAcceptsEffort(model);
  try {
    return await client.messages.parse(requestBody(doc, model, useEffort), REQUEST_OPTIONS);
  } catch (err) {
    if (!useEffort || !isEffortRejection(err)) throw err;
    return client.messages.parse(requestBody(doc, model, false), REQUEST_OPTIONS);
  }
}

/** pranil-spec §3. Never rejects: timeout, API error, and refusal become extraction_error. */
export const extractDocument: ExtractDocumentFn = async (doc) => {
  const model = resolveModel();
  try {
    const message = await parseDocument(doc, model);
    if (message.stop_reason === "refusal") {
      return failedExtraction(model, "Model refused the document.");
    }
    if (message.parsed_output == null) {
      return failedExtraction(model, "Model returned no parsed bill.");
    }
    return toBill(message.parsed_output, model);
  } catch (err) {
    console.error("[intake] extractDocument", err);
    return failedExtraction(model, errorText(err));
  }
};
