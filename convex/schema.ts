import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const json = v.string();

export default defineSchema({
  properties: defineTable({
    propertyId: v.string(),
    name: v.string(),
    street: v.string(),
    city: v.string(),
    state: v.string(),
    zip: v.string(),
    units: v.array(v.string()),
    contractorAutoPayLimit: v.number(),
  }).index("by_propertyId", ["propertyId"]),
  vendors: defineTable({
    vendorId: v.string(),
    name: v.string(),
    aliases: v.array(v.string()),
    kind: v.string(),
    utilityType: v.union(v.string(), v.null()),
    defaultRail: v.string(),
    crsIdentityRef: v.union(v.string(), v.null()),
  }).index("by_vendorId", ["vendorId"]),
  vendorAccounts: defineTable({
    vendorId: v.string(),
    propertyId: v.string(),
    accountNumber: v.string(),
    utilityType: v.string(),
    usageUnit: v.union(v.string(), v.null()),
  }),
  history: defineTable({
    historyId: v.string(),
    vendorId: v.string(),
    propertyId: v.string(),
    invoiceNumber: v.string(),
    amount: v.number(),
    dueDate: v.string(),
    usageQty: v.union(v.number(), v.null()),
    usageUnit: v.union(v.string(), v.null()),
    paidOn: v.string(),
  }).index("by_historyId", ["historyId"]),
  aliases: defineTable({
    addressKey: v.string(),
    rawAddress: v.string(),
    propertyId: v.string(),
    createdAt: v.string(),
    createdBy: v.literal("HUMAN_OPERATOR"),
    sourceBillId: v.string(),
  }).index("by_addressKey", ["addressKey"]),
  bills: defineTable({
    billId: v.string(),
    createdAt: v.string(),
    status: v.string(),
    amount: v.union(v.number(), v.null()),
    record: json,
  })
    .index("by_billId", ["billId"])
    .index("by_createdAt", ["createdAt"]),
  auditEvents: defineTable({
    billId: v.string(),
    seq: v.number(),
    record: json,
  }).index("by_billId", ["billId"]),
  payments: defineTable({
    billId: v.string(),
    record: json,
  }).index("by_billId", ["billId"]),
  investigations: defineTable({
    billId: v.string(),
    status: v.string(),
    record: json,
  }).index("by_billId", ["billId"]),
});
