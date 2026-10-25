/**
 * Lintel Reviewer, Cartesia Managed Agent.
 * Read-only tools only. Phone attach is optional and lives in the setup script.
 *
 * Unverified against a live account on Oct 25, 2026 (no API key on this machine):
 * - Preferred model id "claude-sonnet-5". The models guide example that day was "gpt-5.4-mini".
 *   Confirm with GET /v1/agents/models. Override with CARTESIA_AGENT_MODEL.
 * - Voice id below is the Skylar id named in the voice spec. The configuration guide
 *   example used e07c00bc-4134-4eae-9ea4-1a55fb45746b. Override with CARTESIA_VOICE_ID.
 *   Not checked with GET /voices.
 * - Keyterm count limit was not stated on the configuration page.
 * - system_tools.end_call.pre_tool_speech is taken from the configuration guide example.
 */

export const REVIEWER_NAME = "Lintel Reviewer";

export const REVIEWER_INITIAL_MESSAGE = "Hi, I'm Lintel. Ask me about any bill on the desk.";

/** Spec's Skylar id. Not re-checked against the voice catalog. */
export const DEFAULT_VOICE_ID = "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4";

/** Preferred catalog id. The script confirms it with GET /v1/agents/models when it runs live. */
export const PREFERRED_MODEL_ID = "claude-sonnet-5";

export const REVIEWER_KEYTERMS = [
  "EBMUD",
  "PG&E",
  "SFPUC",
  "Recology",
  "Bayline Plumbing",
  "Pacific Green",
  "Apex Rapid HVAC",
  "VP Finance",
  "Bayview Commons",
  "Shattuck Student Living",
  "Telegraph Hill Lofts",
];

export const REVIEWER_INSTRUCTIONS = `# Identity
You are Lintel, the accounts payable reviewer for a property portfolio. Speak in short sentences.

# What you can do
You can look up bills and explain why one is cleared, held, or blocked. Say "one moment" before you look something up.

# What you cannot do
You cannot approve, reject, assign, process, or pay anything. You have no tool that changes a bill. If the caller asks you to approve, reject, pay, assign, or send anything, say a person handles that. You can only explain the bill.

# Facts
Only state facts a tool returned. For any dollar amount, percent, date, invoice number, or bill id, use the tool's words exactly. If a tool did not return it, say you do not know. Do not invent a number.

# Which tool
- list_open_bills when the caller asks what needs a person, or what is held or blocked.
- find_bills when the caller names a vendor, a property, or a bill id. Pass that text as q.
- get_bill_explanation once you have a bill id and the caller wants the reason. Call it before you explain one bill.
- end_call when the caller is done.

# How to answer
Two or three sentences. Lead with the status and the tool's reason. If required_approver is set, name that role as the person who decides. If the tool returns no bill, say you cannot find it.`;

export interface WebhookToolBody {
  type: "webhook";
  name: "list_open_bills" | "find_bills" | "get_bill_explanation";
  description: string;
  pre_tool_speech: "force";
  execution_mode: "immediate";
  response_timeout_secs: 8;
  api_schema: {
    url: string;
    method: "GET";
    path_params_schema?: { bill_id: { type: "string"; description: string } };
    query_params_schema?: {
      properties: Record<string, { type: "string"; description: string }>;
    };
    authentication: {
      mode: "bearer";
      token: { type: "secret"; secret_description: string; secret_value: string };
    };
  };
}

export function buildReviewerTools(input: { siteUrl: string; secret: string }): WebhookToolBody[] {
  const site = input.siteUrl.replace(/\/+$/, "");
  const authentication = {
    mode: "bearer" as const,
    token: {
      type: "secret" as const,
      secret_description: "Lintel voice tool bearer",
      secret_value: input.secret,
    },
  };
  return [
    {
      type: "webhook",
      name: "list_open_bills",
      description:
        "List bills a person still has to handle. Held bills come first, then blocked. At most 5. Use when the caller asks what needs them today. Does not approve, reject, or pay.",
      pre_tool_speech: "force",
      execution_mode: "immediate",
      response_timeout_secs: 8,
      api_schema: {
        url: `${site}/voice/open`,
        method: "GET",
        authentication,
      },
    },
    {
      type: "webhook",
      name: "find_bills",
      description:
        "Find bills by vendor, property, or bill id. Pass the caller's words as q, or set vendor, property, or bill_id. Exact text only, at most 5. Does not approve, reject, or pay.",
      pre_tool_speech: "force",
      execution_mode: "immediate",
      response_timeout_secs: 8,
      api_schema: {
        url: `${site}/voice/find`,
        method: "GET",
        query_params_schema: {
          properties: {
            q: { type: "string", description: "Vendor, property, or bill id as the caller said it." },
            vendor: { type: "string", description: "Vendor name, such as EBMUD or PG&E." },
            property: { type: "string", description: "Property name, such as Shattuck Student Living." },
            bill_id: { type: "string", description: "Stored bill id." },
          },
        },
        authentication,
      },
    },
    {
      type: "webhook",
      name: "get_bill_explanation",
      description:
        "Explain one bill. Returns the status, the formatted amount, and the engine's reason in its own words. Call this before you say why a bill is held, blocked, or cleared. Does not approve, reject, or pay.",
      pre_tool_speech: "force",
      execution_mode: "immediate",
      response_timeout_secs: 8,
      api_schema: {
        url: `${site}/voice/bill/{bill_id}`,
        method: "GET",
        path_params_schema: {
          bill_id: { type: "string", description: "Bill id from list_open_bills or find_bills." },
        },
        authentication,
      },
    },
  ];
}

export interface ReviewerAgentBody {
  name: string;
  description: string;
  config: {
    instructions: string;
    initial_message: string;
    timezone: string;
    model: { id: string; temperature: number; max_output_tokens: number };
    language: { primary: "en" };
    audio: {
      input: { keyterms: string[] };
      output: { voice_id: string; speed: number };
    };
    tools: Array<{ id: string }>;
    system_tools: {
      end_call: { description: string; pre_tool_speech: "force" };
    };
  };
}

export function buildReviewerAgentBody(input: { toolIds: string[]; modelId: string; voiceId: string }): ReviewerAgentBody {
  return {
    name: REVIEWER_NAME,
    description: "Read-only reviewer. Explains bills. Cannot approve, reject, or pay.",
    config: {
      instructions: REVIEWER_INSTRUCTIONS,
      initial_message: REVIEWER_INITIAL_MESSAGE,
      timezone: "America/Los_Angeles",
      model: { id: input.modelId, temperature: 0.2, max_output_tokens: 300 },
      language: { primary: "en" },
      audio: {
        input: { keyterms: REVIEWER_KEYTERMS },
        output: { voice_id: input.voiceId, speed: 1 },
      },
      tools: input.toolIds.map((id) => ({ id })),
      system_tools: {
        end_call: {
          description: "End the call when the caller is done or says goodbye.",
          pre_tool_speech: "force",
        },
      },
    },
  };
}
