import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const findBySha = internalQuery({
  args: {
    sha: v.string(),
    repository: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("commits")
      .withIndex("by_repository", (q) => q.eq("repository", args.repository))
      .filter((q) => q.eq(q.field("sha"), args.sha))
      .first();
  },
});

export const getById = internalQuery({
  args: {
    commitId: v.id("commits"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.commitId);
  },
});

export const insert = internalMutation({
  args: {
    sha: v.string(),
    message: v.string(),
    author: v.string(),
    authorEmail: v.string(),
    repository: v.string(),
    url: v.string(),
    timestamp: v.number(),
    summaryStatus: v.union(v.literal("pending"), v.literal("completed"), v.literal("failed")),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("commits", args);
  },
});

export const updateSummary = internalMutation({
  args: {
    commitId: v.id("commits"),
    summary: v.optional(v.string()),
    summaryStatus: v.union(v.literal("pending"), v.literal("completed"), v.literal("failed")),
  },
  handler: async (ctx, args) => {
    const { commitId, summary, summaryStatus } = args;
    const update: { summaryStatus: typeof summaryStatus; summary?: string } = {
      summaryStatus,
    };
    if (summary !== undefined) {
      update.summary = summary;
    }
    await ctx.db.patch(commitId, update);
  },
});

