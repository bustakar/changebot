import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  commits: defineTable({
    sha: v.string(),
    message: v.string(),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    author: v.string(),
    authorEmail: v.string(),
    repository: v.string(),
    url: v.string(),
    timestamp: v.number(),
    createdAt: v.number(),
    summaryStatus: v.union(
      v.literal('pending'),
      v.literal('completed'),
      v.literal('failed')
    ),
    version: v.optional(v.string()),
  })
    .index('by_timestamp', ['timestamp'])
    .index('by_repository', ['repository'])
    .index('by_summary_status', ['summaryStatus'])
    .index('by_version', ['version']),
  releases: defineTable({
    version: v.string(),
    date: v.number(),
    tagSha: v.string(),
    repository: v.string(),
  })
    .index('by_version', ['version'])
    .index('by_repository', ['repository'])
    .index('by_date', ['date']),
});
