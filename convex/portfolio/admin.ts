import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { newAccount, newProperty, newVendor } from "../../src/portfolio/admin";
import type { UsageUnit, UtilityType, VendorKind } from "../../src/types/bill";
import { loadLedger } from "../lib/records";

function checked<T>(build: () => T): T {
  try {
    return build();
  } catch (err) {
    throw new ConvexError(err instanceof Error ? err.message : "Could not save.");
  }
}

export const addProperty = mutation({
  args: {
    name: v.string(),
    street: v.string(),
    city: v.string(),
    state: v.string(),
    zip: v.string(),
    units: v.array(v.string()),
    contractorAutoPayLimit: v.number(),
  },
  handler: async (ctx, args) => {
    const ledger = await loadLedger(ctx);
    const property = checked(() => newProperty({ ...args, contractor_auto_pay_limit: args.contractorAutoPayLimit }, ledger.properties));
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
    return property;
  },
});

export const addVendor = mutation({
  args: {
    name: v.string(),
    aliases: v.array(v.string()),
    kind: v.string(),
    utilityType: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const ledger = await loadLedger(ctx);
    const vendor = checked(() =>
      newVendor({ name: args.name, aliases: args.aliases, kind: args.kind as VendorKind, utility_type: args.utilityType as UtilityType | null }, ledger.vendors),
    );
    await ctx.db.insert("vendors", {
      vendorId: vendor.id,
      name: vendor.name,
      aliases: vendor.aliases,
      kind: vendor.kind,
      utilityType: vendor.utility_type,
      defaultRail: vendor.default_rail,
      crsIdentityRef: vendor.crs_identity_ref,
    });
    return vendor;
  },
});

export const addVendorAccount = mutation({
  args: {
    vendorId: v.string(),
    propertyId: v.string(),
    accountNumber: v.string(),
    usageUnit: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const ledger = await loadLedger(ctx);
    const account = checked(() =>
      newAccount({ vendor_id: args.vendorId, property_id: args.propertyId, account_number: args.accountNumber, usage_unit: args.usageUnit as UsageUnit | null }, ledger),
    );
    await ctx.db.insert("vendorAccounts", {
      vendorId: account.vendor_id,
      propertyId: account.property_id,
      accountNumber: account.account_number,
      utilityType: account.utility_type,
      usageUnit: account.usage_unit,
    });
    return account;
  },
});
