import { v } from 'convex/values';
import OpenAI from 'openai';
import { internal } from './_generated/api';
import { Id } from './_generated/dataModel';
import { action, internalAction } from './_generated/server';

const AI_MODEL = process.env.AI_MODEL || 'gpt-5';

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  return new OpenAI({ apiKey });
}

export const saveCommits = action({
  args: {
    commits: v.array(
      v.object({
        sha: v.string(),
        message: v.string(),
        author: v.string(),
        authorEmail: v.string(),
        repository: v.string(),
        url: v.string(),
        timestamp: v.number(),
      })
    ),
  },
  handler: async (
    ctx,
    args
  ): Promise<
    Array<{
      sha: string;
      status: string;
      reason?: string;
      commitId?: Id<'commits'>;
    }>
  > => {
    const results: Array<{
      sha: string;
      status: string;
      reason?: string;
      commitId?: Id<'commits'>;
    }> = [];

    for (const commit of args.commits) {
      // Check if commit already exists
      const existing = await ctx.runQuery(internal.commitsInternal.findBySha, {
        sha: commit.sha,
        repository: commit.repository,
      });

      if (existing) {
        results.push({
          sha: commit.sha,
          status: 'skipped',
          reason: 'already_exists',
        });
        continue;
      }

      // Save commit with pending status
      const commitId: Id<'commits'> = await ctx.runMutation(
        internal.commitsInternal.insert,
        {
          ...commit,
          summaryStatus: 'pending',
          createdAt: Date.now(),
        }
      );

      // Trigger summarization asynchronously
      await ctx.scheduler.runAfter(0, internal.commits.summarizeCommit, {
        commitId,
      });

      results.push({ sha: commit.sha, status: 'saved', commitId });
    }

    return results;
  },
});

export const summarizeCommit = internalAction({
  args: {
    commitId: v.id('commits'),
  },
  handler: async (ctx, args): Promise<{ status: string; summary?: string }> => {
    // Get the commit
    const commit = await ctx.runQuery(internal.commitsInternal.getById, {
      commitId: args.commitId,
    });

    if (!commit) {
      throw new Error(`Commit ${args.commitId} not found`);
    }

    if (commit.summaryStatus === 'completed') {
      return { status: 'already_completed' };
    }

    try {
      // Initialize OpenAI client lazily
      const openai = getOpenAIClient();

      // Call OpenAI to summarize
      const completion = await openai.chat.completions.create({
        model: AI_MODEL,
        reasoning_effort: 'low',
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful assistant that summarizes git commit messages into clear, human-readable descriptions. Make them concise but informative, focusing on what changed and why it matters.',
          },
          {
            role: 'user',
            content: `Summarize this git commit message in a clear, human-readable way:\n\n${commit.message}`,
          },
        ],
        max_tokens: 150,
        temperature: 0.7,
      });

      const summary: string =
        completion.choices[0]?.message?.content?.trim() || '';

      if (!summary) {
        throw new Error('Empty summary returned from OpenAI');
      }

      // Update commit with summary
      await ctx.runMutation(internal.commitsInternal.updateSummary, {
        commitId: args.commitId,
        summary,
        summaryStatus: 'completed',
      });

      return { status: 'completed', summary };
    } catch (error) {
      // Update commit with failed status
      await ctx.runMutation(internal.commitsInternal.updateSummary, {
        commitId: args.commitId,
        summary: undefined,
        summaryStatus: 'failed',
      });

      console.error(`Failed to summarize commit ${args.commitId}:`, error);
      throw error;
    }
  },
});
