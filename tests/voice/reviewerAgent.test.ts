import { describe, expect, it } from "vitest";
import {
  REVIEWER_INITIAL_MESSAGE,
  REVIEWER_INSTRUCTIONS,
  buildReviewerAgentBody,
  buildReviewerTools,
} from "@/voice/reviewerAgent";

describe("Lintel Reviewer agent", () => {
  const tools = buildReviewerTools({
    siteUrl: "https://happy-animal-123.convex.site/",
    secret: "desk-secret",
  });

  it("points three GET tools at the Convex voice routes", () => {
    expect(tools.map((tool) => tool.name)).toEqual(["list_open_bills", "find_bills", "get_bill_explanation"]);
    expect(tools.every((tool) => tool.type === "webhook" && tool.api_schema.method === "GET")).toBe(true);
    expect(tools[0].api_schema.url).toBe("https://happy-animal-123.convex.site/voice/open");
    expect(tools[1].api_schema.url).toBe("https://happy-animal-123.convex.site/voice/find");
    expect(tools[2].api_schema.url).toBe("https://happy-animal-123.convex.site/voice/bill/{bill_id}");
    expect(tools.every((tool) => tool.api_schema.authentication.token.secret_value === "desk-secret")).toBe(true);
    const names = tools.map((tool) => tool.name).join(" ");
    expect(names).not.toMatch(/approve|reject|assign|process|pay/);
  });

  it("tells the agent it cannot move money", () => {
    expect(REVIEWER_INITIAL_MESSAGE).toBe("Hi, I'm Lintel. Ask me about any bill on the desk.");
    expect(REVIEWER_INSTRUCTIONS).toContain("cannot approve, reject, assign, process, or pay");
    expect(REVIEWER_INSTRUCTIONS).toContain("a person handles that");
    const agent = buildReviewerAgentBody({
      toolIds: ["tool_open", "tool_find", "tool_bill"],
      modelId: "claude-sonnet-5",
      voiceId: "voice",
    });
    expect(agent.config.initial_message).toBe(REVIEWER_INITIAL_MESSAGE);
    expect(agent.config.tools.map((tool) => tool.id)).toEqual(["tool_open", "tool_find", "tool_bill"]);
    expect(Object.keys(agent.config.system_tools)).toEqual(["end_call"]);
  });
});
