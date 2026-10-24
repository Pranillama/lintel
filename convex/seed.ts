import { mutation } from "./_generated/server";
import { ACCOUNTS, HISTORY, PROPERTIES, VENDORS } from "../src/seed/portfolio";

/** Inserts the frozen portfolio once. A second call changes nothing. */
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("properties").take(1);
    if (existing.length > 0) return { seeded: false as const };
    for (const property of PROPERTIES) {
      await ctx.db.insert("properties", {
        propertyId: property.id,
        name: property.name,
        street: property.street,
        city: property.city,
        state: property.state,
        zip: property.zip,
        units: property.units,
        contractorAutoPayLimit: property.contractor_auto_pay_limit,
      });
    }
    for (const vendor of VENDORS) {
      await ctx.db.insert("vendors", {
        vendorId: vendor.id,
        name: vendor.name,
        aliases: vendor.aliases,
        kind: vendor.kind,
        utilityType: vendor.utility_type,
        defaultRail: vendor.default_rail,
        crsIdentityRef: vendor.crs_identity_ref,
      });
    }
    for (const account of ACCOUNTS) {
      await ctx.db.insert("vendorAccounts", {
        vendorId: account.vendor_id,
        propertyId: account.property_id,
        accountNumber: account.account_number,
        utilityType: account.utility_type,
        usageUnit: account.usage_unit,
      });
    }
    for (const row of HISTORY) {
      await ctx.db.insert("history", {
        historyId: row.id,
        vendorId: row.vendor_id,
        propertyId: row.property_id,
        invoiceNumber: row.invoice_number,
        amount: row.amount,
        dueDate: row.due_date,
        usageQty: row.usage_qty,
        usageUnit: row.usage_unit,
        paidOn: row.paid_on,
      });
    }
    return { seeded: true as const };
  },
});
