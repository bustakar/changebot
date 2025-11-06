import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const findBySha = internalQuery({
  args: {
    sha: v.string(),
    repository: v.string(),
  },
  handler: async (ctx, args) => {
    console.log('[Convex] findBySha called:', { sha: args.sha, repository: args.repository });
    const result = await ctx.db
      .query("commits")
      .withIndex("by_repository", (q) => q.eq("repository", args.repository))
      .filter((q) => q.eq(q.field("sha"), args.sha))
      .first();
    console.log('[Convex] findBySha result:', result ? 'found' : 'not found');
    return result;
  },
});

export const getById = internalQuery({
  args: {
    commitId: v.id("commits"),
  },
  handler: async (ctx, args) => {
    console.log('[Convex] getById called:', args.commitId);
    const result = await ctx.db.get(args.commitId);
    console.log('[Convex] getById result:', result ? 'found' : 'not found');
    return result;
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
    console.log('[Convex] insert called:', { sha: args.sha, repository: args.repository, summaryStatus: args.summaryStatus });
    const result = await ctx.db.insert("commits", args);
    console.log('[Convex] insert completed, commitId:', result);
    return result;
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
    console.log('[Convex] updateSummary called:', {
      commitId,
      summaryStatus,
      hasSummary: summary !== undefined,
      summaryLength: summary?.length || 0,
    });
    const update: { summaryStatus: typeof summaryStatus; summary?: string } = {
      summaryStatus,
    };
    if (summary !== undefined) {
      update.summary = summary;
    }
    await ctx.db.patch(commitId, update);
    console.log('[Convex] updateSummary completed:', commitId);
  },
});

export const deleteAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    console.log('[Convex] deleteAll called - deleting all commits');
    const commits = await ctx.db.query("commits").collect();
    console.log('[Convex] Found', commits.length, 'commits to delete');
    
    for (const commit of commits) {
      await ctx.db.delete(commit._id);
    }
    
    console.log('[Convex] deleteAll completed - deleted', commits.length, 'commits');
    return { deleted: commits.length };
  },
});

