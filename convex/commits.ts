import { v } from 'convex/values';
import { internal } from './_generated/api';
import { Id } from './_generated/dataModel';
import { action, internalAction } from './_generated/server';

const AI_MODEL = process.env.AI_MODEL || 'google/gemini-flash-2.0';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

interface OpenRouterResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

async function callOpenRouter(
  messages: Array<{ role: string; content: string }>
): Promise<OpenRouterResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set');
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer':
        process.env.OPENROUTER_HTTP_REFERER || 'https://github.com',
      'X-Title': 'ChangeBot',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages,
      max_tokens: 150,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
  }

  return await response.json();
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
    console.log(
      '[Convex] saveCommits called with',
      args.commits.length,
      'commits'
    );
    const results: Array<{
      sha: string;
      status: string;
      reason?: string;
      commitId?: Id<'commits'>;
    }> = [];

    for (const commit of args.commits) {
      console.log(
        '[Convex] Processing commit:',
        commit.sha,
        'from',
        commit.repository
      );

      // Check if commit already exists
      const existing = await ctx.runQuery(internal.commitsInternal.findBySha, {
        sha: commit.sha,
        repository: commit.repository,
      });

      if (existing) {
        console.log('[Convex] Commit already exists, skipping:', commit.sha);
        results.push({
          sha: commit.sha,
          status: 'skipped',
          reason: 'already_exists',
        });
        continue;
      }

      // Save commit with pending status
      console.log('[Convex] Saving new commit:', commit.sha);
      const commitId: Id<'commits'> = await ctx.runMutation(
        internal.commitsInternal.insert,
        {
          ...commit,
          summaryStatus: 'pending',
          createdAt: Date.now(),
        }
      );
      console.log('[Convex] Commit saved with ID:', commitId);

      // Trigger summarization asynchronously
      console.log('[Convex] Scheduling summarization for commit:', commitId);
      await ctx.scheduler.runAfter(0, internal.commits.summarizeCommit, {
        commitId,
      });

      results.push({ sha: commit.sha, status: 'saved', commitId });
    }

    console.log('[Convex] saveCommits completed:', {
      total: args.commits.length,
      saved: results.filter((r) => r.status === 'saved').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
    });
    return results;
  },
});

export const summarizeCommit = internalAction({
  args: {
    commitId: v.id('commits'),
  },
  handler: async (ctx, args): Promise<{ status: string; summary?: string }> => {
    console.log('[Convex] summarizeCommit called for commitId:', args.commitId);

    // Get the commit
    const commit = await ctx.runQuery(internal.commitsInternal.getById, {
      commitId: args.commitId,
    });

    if (!commit) {
      console.error('[Convex] Commit not found:', args.commitId);
      throw new Error(`Commit ${args.commitId} not found`);
    }

    console.log('[Convex] Commit found:', {
      sha: commit.sha,
      repository: commit.repository,
      summaryStatus: commit.summaryStatus,
      messagePreview: commit.message.substring(0, 50) + '...',
    });

    if (commit.summaryStatus === 'completed') {
      console.log(
        '[Convex] Commit already summarized, skipping:',
        args.commitId
      );
      return { status: 'already_completed' };
    }

    try {
      // Call OpenRouter to summarize
      console.log(
        '[OpenRouter] Calling OpenRouter API to summarize commit:',
        commit.sha,
        'with model:',
        AI_MODEL
      );
      const startTime = Date.now();
      const completion = await callOpenRouter([
        {
          role: 'system',
          content:
            'You are a helpful assistant that summarizes git commit messages into clear, human-readable descriptions. Make them concise but informative, focusing on what changed and why it matters.',
        },
        {
          role: 'user',
          content: `Summarize this git commit message in a clear, human-readable way:\n\n${commit.message}`,
        },
      ]);
      const duration = Date.now() - startTime;

      console.log('[OpenRouter] API call completed in', duration, 'ms');
      console.log('[OpenRouter] Response:', {
        model: completion.model,
        usage: completion.usage,
        choicesCount: completion.choices.length,
      });

      const summary: string =
        completion.choices[0]?.message?.content?.trim() || '';

      if (!summary) {
        console.error('[OpenRouter] Empty summary returned from OpenRouter');
        throw new Error('Empty summary returned from OpenRouter');
      }

      console.log(
        '[OpenRouter] Summary generated:',
        summary.substring(0, 100) + '...'
      );

      // Update commit with summary
      console.log('[Convex] Updating commit with summary:', args.commitId);
      await ctx.runMutation(internal.commitsInternal.updateSummary, {
        commitId: args.commitId,
        summary,
        summaryStatus: 'completed',
      });

      console.log(
        '[Convex] Commit summarization completed successfully:',
        args.commitId
      );
      return { status: 'completed', summary };
    } catch (error) {
      console.error(
        '[Convex] Failed to summarize commit:',
        args.commitId,
        error
      );

      // Update commit with failed status
      await ctx.runMutation(internal.commitsInternal.updateSummary, {
        commitId: args.commitId,
        summary: undefined,
        summaryStatus: 'failed',
      });

      console.error(`[Convex] Commit marked as failed: ${args.commitId}`);
      throw error;
    }
  },
});
