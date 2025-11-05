import { paginationOptsValidator } from 'convex/server';
import { query } from './_generated/server';

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('commits')
      .withIndex('by_timestamp')
      .order('desc')
      .paginate(args.paginationOpts);
  },
});
