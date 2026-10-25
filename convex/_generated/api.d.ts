/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as audit_verify from "../audit/verify.js";
import type * as bills_create from "../bills/create.js";
import type * as bills_queries from "../bills/queries.js";
import type * as bills_reset from "../bills/reset.js";
import type * as bills_resume from "../bills/resume.js";
import type * as crs_vendor from "../crs/vendor.js";
import type * as engine_policy from "../engine/policy.js";
import type * as http from "../http.js";
import type * as intake_extract from "../intake/extract.js";
import type * as lib_records from "../lib/records.js";
import type * as match_commit from "../match/commit.js";
import type * as payments_settle from "../payments/settle.js";
import type * as pipeline_investigate from "../pipeline/investigate.js";
import type * as pipeline_process from "../pipeline/process.js";
import type * as pipeline_voice from "../pipeline/voice.js";
import type * as portfolio_admin from "../portfolio/admin.js";
import type * as voice_tools from "../voice/tools.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "audit/verify": typeof audit_verify;
  "bills/create": typeof bills_create;
  "bills/queries": typeof bills_queries;
  "bills/reset": typeof bills_reset;
  "bills/resume": typeof bills_resume;
  "crs/vendor": typeof crs_vendor;
  "engine/policy": typeof engine_policy;
  http: typeof http;
  "intake/extract": typeof intake_extract;
  "lib/records": typeof lib_records;
  "match/commit": typeof match_commit;
  "payments/settle": typeof payments_settle;
  "pipeline/investigate": typeof pipeline_investigate;
  "pipeline/process": typeof pipeline_process;
  "pipeline/voice": typeof pipeline_voice;
  "portfolio/admin": typeof portfolio_admin;
  "voice/tools": typeof voice_tools;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
