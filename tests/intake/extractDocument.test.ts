import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtractedBill, UploadedDocument } from "@/types/bill";

const { parseMock } = vi.hoisted(() => ({
  parseMock: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => {
  class Anthropic {
    messages = { parse: parseMock };
  }
  return { default: Anthropic };
});

import { extractDocument } from "@/agents/intake/extractDocument";

const pdf: UploadedDocument = {
  filename: "ebmud.pdf",
  media_type: "application/pdf",
  data_base64: "JVBERg==",
};

const photo: UploadedDocument = {
  filename: "plumbing.jpg",
  media_type: "image/jpeg",
  data_base64: "/9j/4AAQ",
};

function quoted(value: string | null, confidence = 0.95, source_snippet: string | null = "printed") {
  return { value, confidence, source_snippet };
}

function measured(value: number | null, confidence = 0.95, source_snippet: string | null = "printed") {
  return { value, confidence, source_snippet };
}

function parsedBill() {
  return {
    vendor_name: quoted(" EBMUD ", 0.99, " East Bay "),
    invoice_number: quoted("88-2110", 0.9, "88-2110"),
    account_number: quoted("88-2110-4471", 0.97, "Account 88-2110-4471"),
    service_address: quoted("   ", 0.4, "blank"),
    due_date: quoted("2026-11-04", 0.92, "Due 11/04/2026"),
    billing_period_start: quoted("November 1, 2026", 0.8, "November 1, 2026"),
    billing_period_end: quoted(null, 0.5, "n/a"),
    total_amount: measured(5680.126, 1.4, "$5,680.13"),
    usage_qty: measured(160, 0.93, "160 CCF"),
    usage_unit: { value: null, confidence: 0.8, source_snippet: "gallons" },
    line_items: [
      { description: "Water service", amount: 100.005 },
      { description: "Fees", amount: 200.004 },
    ],
  };
}

function emptyFields(bill: ExtractedBill) {
  for (const field of [
    bill.vendor_name,
    bill.invoice_number,
    bill.account_number,
    bill.service_address,
    bill.due_date,
    bill.billing_period_start,
    bill.billing_period_end,
    bill.total_amount,
    bill.usage_qty,
    bill.usage_unit,
  ]) {
    expect(field).toEqual({ value: null, confidence: 0, source_snippet: null });
  }
  expect(bill.line_items).toEqual([]);
  expect(bill.source).toBe("DOCUMENT");
  expect(bill.extraction_model).toBe("claude-haiku-5-5");
}

describe("extractDocument", () => {
  beforeEach(() => {
    parseMock.mockReset();
    delete process.env.LINTEL_EXTRACT_MODEL;
  });

  it("returns the parsed bill without recomputing the printed total", async () => {
    parseMock.mockResolvedValue({ stop_reason: "end_turn", parsed_output: parsedBill() });

    const bill = await extractDocument(pdf);

    expect(bill.source).toBe("DOCUMENT");
    expect(bill.extraction_error).toBeNull();
    expect(bill.extraction_model).toBe("claude-haiku-5-5");
    expect(bill.vendor_name).toEqual({
      value: "EBMUD",
      confidence: 0.99,
      source_snippet: " East Bay ",
    });
    expect(bill.invoice_number.value).toBe("88-2110");
    expect(bill.account_number.value).toBe("88-2110-4471");
    expect(bill.service_address).toEqual({ value: null, confidence: 0, source_snippet: null });
    expect(bill.due_date).toEqual({
      value: "2026-11-04",
      confidence: 0.92,
      source_snippet: "Due 11/04/2026",
    });
    expect(bill.billing_period_start).toEqual({ value: null, confidence: 0, source_snippet: null });
    expect(bill.billing_period_end).toEqual({ value: null, confidence: 0, source_snippet: null });
    expect(bill.total_amount).toEqual({ value: 5680.13, confidence: 1, source_snippet: "$5,680.13" });
    expect(bill.usage_qty).toEqual({ value: 160, confidence: 0.93, source_snippet: "160 CCF" });
    expect(bill.usage_unit).toEqual({ value: null, confidence: 0, source_snippet: null });
    expect(bill.line_items).toEqual([
      { description: "Water service", amount: 100.01 },
      { description: "Fees", amount: 200 },
    ]);
  });

  it("records the configured extraction model", async () => {
    process.env.LINTEL_EXTRACT_MODEL = "claude-opus-5-5";
    parseMock.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: {
        ...parsedBill(),
        usage_unit: { value: "CCF", confidence: 0.93, source_snippet: "CCF" },
      },
    });

    const bill = await extractDocument(pdf);

    expect(bill.extraction_model).toBe("claude-opus-5-5");
    expect(bill.usage_unit).toEqual({ value: "CCF", confidence: 0.93, source_snippet: "CCF" });
    expect(bill.extraction_error).toBeNull();
  });

  it("drops a refusal and returns an empty document bill", async () => {
    parseMock.mockResolvedValue({ stop_reason: "refusal", parsed_output: parsedBill() });

    const bill = await extractDocument(pdf);

    emptyFields(bill);
    expect(bill.extraction_error).toBe("Model refused the document.");
  });

  it("returns an empty document bill when the model output is null", async () => {
    parseMock.mockResolvedValue({ stop_reason: "end_turn", parsed_output: null });

    const bill = await extractDocument(pdf);

    emptyFields(bill);
    expect(bill.extraction_error).toBe("Model returned no parsed bill.");
  });

  it("resolves an empty bill when the request times out or the API errors", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    parseMock.mockRejectedValueOnce(new Error("Request timed out.")).mockResolvedValueOnce({
      stop_reason: "end_turn",
      parsed_output: parsedBill(),
    });

    const bill = await extractDocument(pdf);

    emptyFields(bill);
    expect(bill.extraction_error).toBe("Request timed out.");
    errorLog.mockRestore();
  });

  it("continues without effort when the model rejects that option", async () => {
    parseMock.mockRejectedValueOnce(
      Object.assign(new Error("400 output_config.effort: Extra inputs are not permitted"), {
        status: 400,
      }),
    ).mockResolvedValueOnce({
      stop_reason: "end_turn",
      parsed_output: {
        ...parsedBill(),
        vendor_name: quoted("Apex Plumbing", 0.91, "Apex Plumbing"),
        service_address: quoted("1880 Lombard #B", 0.88, "1880 Lombard #B"),
      },
    });

    const bill = await extractDocument(photo);

    expect(bill.extraction_error).toBeNull();
    expect(bill.source).toBe("DOCUMENT");
    expect(bill.vendor_name.value).toBe("Apex Plumbing");
    expect(bill.service_address.value).toBe("1880 Lombard #B");
    expect(bill.extraction_model).toBe("claude-haiku-5-5");
  });
});
