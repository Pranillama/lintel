/**
 * Read-only voice tools. Queries only. No mutations and no outbound calls.
 * Cartesia must send Authorization: Bearer ${LINTEL_VOICE_TOOL_SECRET}.
 */
import { api } from "../_generated/api";
import { httpAction } from "../_generated/server";
import {
  billIdFromPath,
  explainResult,
  findResult,
  listOpenResult,
  parseFindQuery,
  unauthorizedResult,
  voiceAuthorized,
  type VoiceResult,
} from "../../src/voice/handlers";

function respond(result: VoiceResult): Response {
  return new Response(result.body, {
    status: result.status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function allowed(request: Request): boolean {
  return voiceAuthorized(request.headers.get("Authorization"), process.env.LINTEL_VOICE_TOOL_SECRET);
}

export const listOpenBills = httpAction(async (ctx, request) => {
  if (!allowed(request)) return respond(unauthorizedResult());
  const listed = await ctx.runQuery(api.bills.queries.listBills, {});
  return respond(listOpenResult(listed.bills));
});

export const findBills = httpAction(async (ctx, request) => {
  if (!allowed(request)) return respond(unauthorizedResult());
  const parsed = parseFindQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return respond({ status: 400, body: JSON.stringify({ error: parsed.error }) });
  const listed = await ctx.runQuery(api.bills.queries.listBills, {});
  return respond(findResult(listed.bills, parsed.query));
});

export const getBillExplanation = httpAction(async (ctx, request) => {
  if (!allowed(request)) return respond(unauthorizedResult());
  const billId = billIdFromPath(new URL(request.url).pathname);
  if (!billId) return respond({ status: 400, body: JSON.stringify({ error: "bad_bill_id" }) });
  const bill = await ctx.runQuery(api.bills.queries.getBill, { billId });
  return respond(explainResult(bill));
});
