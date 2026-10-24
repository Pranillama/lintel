import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  properties: defineTable({ doc: v.any() }),
  vendors: defineTable({ doc: v.any() }),
  vendorAccounts: defineTable({ doc: v.any() }),
  bills: defineTable({ doc: v.any() }),
  auditEvents: defineTable({ doc: v.any() }),
  payments: defineTable({ doc: v.any() }),
  aliases: defineTable({ doc: v.any() }),
  investigations: defineTable({ doc: v.any() }),
});
