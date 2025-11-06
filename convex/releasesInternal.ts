import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';

export const createRelease = internalMutation({
  args: {
    version: v.string(),
    tagSha: v.string(),
    date: v.number(),
    repository: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if release already exists
    const existing = await ctx.db
      .query('releases')
      .withIndex('by_version', (q) => q.eq('version', args.version))
      .first();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert('releases', {
      version: args.version,
      tagSha: args.tagSha,
      date: args.date,
      repository: args.repository,
    });
  },
});

export const linkCommitsToVersion = internalMutation({
  args: {
    version: v.string(),
    commitShas: v.array(v.string()),
    repository: v.string(),
  },
  handler: async (ctx, args) => {
    for (const sha of args.commitShas) {
      const commit = await ctx.db
        .query('commits')
        .withIndex('by_repository', (q) => q.eq('repository', args.repository))
        .filter((q) => q.eq(q.field('sha'), sha))
        .first();

      if (commit) {
        await ctx.db.patch(commit._id, { version: args.version });
      }
    }
  },
});

export const getReleasesByRepository = internalQuery({
  args: {
    repository: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('releases')
      .withIndex('by_repository', (q) => q.eq('repository', args.repository))
      .order('desc')
      .collect();
  },
});

export const getCommitsByRepository = internalQuery({
  args: {
    repository: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('commits')
      .withIndex('by_repository', (q) => q.eq('repository', args.repository))
      .order('desc')
      .collect();
  },
});

