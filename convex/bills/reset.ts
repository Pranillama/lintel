import { internalMutation, mutation } from "../_generated/server";

async function wipe(ctx: { db: import("../_generated/server").MutationCtx["db"] }) {
  for (const table of ["bills", "auditEvents", "payments", "aliases", "investigations"] as const) {
    const rows = await ctx.db.query(table).take(500);
    for (const row of rows) await ctx.db.delete(row._id);
  }
}

export const wipeLive = internalMutation({
  args: {},
  handler: async (ctx) => {
    await wipe(ctx);
    return { ok: true as const };
  },
});

export const resetDemo = mutation({
  args: {},
  handler: async (ctx) => {
    await wipe(ctx);
    return { ok: true as const };
  },
});
