import { paginationOptsValidator } from 'convex/server';
import { query } from './_generated/server';

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    console.log('[Convex] list query called with pagination:', args.paginationOpts);
    const result = await ctx.db
      .query('commits')
      .withIndex('by_timestamp')
      .order('desc')
      .paginate(args.paginationOpts);
    console.log('[Convex] list query returned', result.page.length, 'commits');
    return result;
  },
});
