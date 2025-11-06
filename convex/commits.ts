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
  messages: Array<{ role: string; content: string }>,
  maxTokens: number = 150,
  retries: number = 3
): Promise<OpenRouterResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set');
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
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
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
    });

    if (response.ok) {
      return await response.json();
    }

    const errorText = await response.text();
    const isRateLimit = response.status === 429;

    if (isRateLimit && attempt < retries) {
      // Exponential backoff: wait 2^attempt seconds (2s, 4s, 8s)
      const waitTime = Math.pow(2, attempt) * 1000;
      console.log(
        `[OpenRouter] Rate limited, retrying in ${waitTime / 1000}s (attempt ${attempt + 1}/${retries + 1})`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      continue;
    }

    throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
  }

  throw new Error('OpenRouter API call failed after retries');
}

async function batchSummarizeCommits(
  commits: Array<{ sha: string; message: string }>
): Promise<Record<string, { title: string; description: string }>> {
  console.log(
    `[OpenRouter] Batch summarizing ${commits.length} commits in one request`
  );

  const commitsList = commits
    .map(
      (c, idx) =>
        `${idx + 1}. SHA: ${c.sha.substring(0, 7)}\n   Message: ${c.message}`
    )
    .join('\n\n');

  const prompt = `You are a helpful assistant that summarizes git commit messages into clear, human-readable formats.

For each commit, create:
1. A title: A SINGLE LINE, maximum 64 characters, concise and descriptive. NO bullet points, NO dashes, just a plain sentence or phrase.
2. A description: 2-4 bullet points explaining what changed and why it matters. Each bullet point should be on a new line starting with "- "

IMPORTANT:
- Title must be a single line without bullet points or dashes
- Description contains the bullet points
- Title should be like: "Add user authentication feature"
- Description should be like: "- Implements login with email/password\\n- Adds JWT token generation\\n- Includes password hashing"

Please summarize each of the following commits and return a JSON object where:
- The key is the commit SHA (first 7 characters)
- The value is an object with "title" (single line, max 64 chars, no bullets) and "description" (bullet points, each on a new line starting with "- ")

Commits to summarize:
${commitsList}

Return ONLY a valid JSON object in this format:
{
  "sha1": {
    "title": "Add feature X",
    "description": "- First bullet point\\n- Second bullet point\\n- Third bullet point"
  },
  "sha2": {
    "title": "Fix bug in Y",
    "description": "- Point one\\n- Point two"
  },
  ...
}`;

  const startTime = Date.now();
  const completion = await callOpenRouter(
    [
      {
        role: 'system',
        content:
          'You are a helpful assistant that returns only valid JSON. Do not include any explanations or markdown formatting, only the JSON object. Titles must be single lines without bullet points or dashes, maximum 64 characters. Descriptions contain bullet points.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    3000 // Increased max tokens for batch processing with bullet points
  );
  const duration = Date.now() - startTime;

  console.log('[OpenRouter] Batch API call completed in', duration, 'ms');
  console.log('[OpenRouter] Response:', {
    model: completion.model,
    usage: completion.usage,
  });

  const summaryText = completion.choices[0]?.message?.content?.trim() || '';

  if (!summaryText) {
    throw new Error('Empty response returned from OpenRouter');
  }

  // Parse JSON response (remove markdown code blocks if present)
  let jsonText = summaryText;
  if (summaryText.startsWith('```')) {
    const jsonMatch = summaryText.match(/```(?:json)?\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    }
  }

  try {
    const summaries: Record<string, { title: string; description: string }> =
      JSON.parse(jsonText);

    // Clean up titles: remove bullet points and dashes, take first line only
    for (const sha in summaries) {
      let title = summaries[sha].title;
      // Remove leading dashes and bullet points
      title = title.replace(/^[-•]\s*/, '').trim();
      // Take only the first line
      title = title.split('\n')[0].trim();
      // Remove any remaining dashes at the start
      title = title.replace(/^[-•]\s*/, '').trim();
      summaries[sha].title = title;
    }

    console.log(
      `[OpenRouter] Successfully parsed ${Object.keys(summaries).length} summaries`
    );
    return summaries;
  } catch (parseError) {
    console.error('[OpenRouter] Failed to parse JSON response:', jsonText);
    throw new Error(
      `Failed to parse JSON response from OpenRouter: ${parseError instanceof Error ? parseError.message : String(parseError)}`
    );
  }
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

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
  };
  author: {
    login: string;
  } | null;
  html_url: string;
}

async function fetchAllCommitsFromGitHub(
  repository: string,
  branch: string = 'main'
): Promise<
  Array<{
    sha: string;
    message: string;
    author: string;
    authorEmail: string;
    repository: string;
    url: string;
    timestamp: number;
  }>
> {
  const githubToken = process.env.GITHUB_TOKEN;
  const isAuthenticated = !!githubToken;

  if (!isAuthenticated) {
    console.warn(
      '[GitHub] GITHUB_TOKEN not set. Using unauthenticated requests (60 requests/hour limit).'
    );
  }

  const [owner, repo] = repository.split('/');
  if (!owner || !repo) {
    throw new Error(
      `Invalid repository format: ${repository}. Expected format: owner/repo`
    );
  }

  const allCommits: GitHubCommit[] = [];
  let page = 1;
  const perPage = 100;

  console.log(
    `[GitHub] Fetching commits from ${repository} branch ${branch} (${isAuthenticated ? 'authenticated' : 'unauthenticated'})`
  );

  while (true) {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch}&per_page=${perPage}&page=${page}`;
    console.log(`[GitHub] Fetching page ${page}: ${url}`);

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'ChangeBot',
    };

    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      if (response.status === 403 && !isAuthenticated) {
        const errorText = await response.text();
        throw new Error(
          `GitHub API rate limit exceeded. Set GITHUB_TOKEN environment variable for higher rate limits (5,000/hour). Error: ${errorText}`
        );
      }
      const errorText = await response.text();
      throw new Error(`GitHub API error: ${response.status} ${errorText}`);
    }

    const commits: GitHubCommit[] = await response.json();

    if (commits.length === 0) {
      console.log(`[GitHub] No more commits on page ${page}`);
      break;
    }

    allCommits.push(...commits);
    console.log(
      `[GitHub] Fetched ${commits.length} commits from page ${page} (total: ${allCommits.length})`
    );

    // If we got fewer than perPage commits, we've reached the end
    if (commits.length < perPage) {
      break;
    }

    page++;
  }

  console.log(`[GitHub] Total commits fetched: ${allCommits.length}`);

  // Transform GitHub commits to our format
  return allCommits.map((commit) => ({
    sha: commit.sha,
    message: commit.commit.message,
    author: commit.commit.author.name,
    authorEmail: commit.commit.author.email,
    repository: repository,
    url: commit.html_url,
    timestamp: new Date(commit.commit.author.date).getTime(),
  }));
}

export const regenerateAllCommits = action({
  args: {},
  handler: async (
    ctx
  ): Promise<{
    deleted: number;
    fetched: number;
    saved: number;
    errors: Array<{ sha: string; error: string }>;
  }> => {
    const repository = process.env.GITHUB_REPOSITORY;
    const branch = 'main';

    if (!repository) {
      throw new Error('GITHUB_REPOSITORY environment variable is not set');
    }

    console.log('[Convex] regenerateAllCommits called:', {
      repository,
      branch,
    });

    // Step 1: Delete all existing commits
    console.log('[Convex] Step 1: Deleting all existing commits');
    const deleteResult = await ctx.runMutation(
      internal.commitsInternal.deleteAll
    );
    console.log('[Convex] Deleted', deleteResult.deleted, 'commits');

    // Step 2: Fetch all commits from GitHub
    console.log('[Convex] Step 2: Fetching all commits from GitHub');
    const commits = await fetchAllCommitsFromGitHub(repository, branch);
    console.log('[Convex] Fetched', commits.length, 'commits from GitHub');

    // Step 3: Generate summaries for all commits in one batch
    console.log(
      '[Convex] Step 3: Generating summaries for all commits in batch'
    );
    let summaries: Record<string, { title: string; description: string }> = {};
    const errors: Array<{ sha: string; error: string }> = [];

    if (commits.length > 0) {
      try {
        summaries = await batchSummarizeCommits(
          commits.map((c) => ({ sha: c.sha, message: c.message }))
        );
        console.log(
          `[Convex] Successfully generated ${Object.keys(summaries).length} summaries`
        );
      } catch (summaryError) {
        console.error(
          '[Convex] Failed to generate batch summaries:',
          summaryError
        );
        errors.push({
          sha: 'batch',
          error:
            summaryError instanceof Error
              ? summaryError.message
              : String(summaryError),
        });
      }
    }

    // Step 4: Save commits with summaries
    console.log('[Convex] Step 4: Saving commits with summaries');
    let saved = 0;

    for (const commit of commits) {
      try {
        const commitShaShort = commit.sha.substring(0, 7);
        const summaryData = summaries[commitShaShort];

        // Save commit with title and summary if available
        const commitId = await ctx.runMutation(
          internal.commitsInternal.insert,
          {
            sha: commit.sha,
            message: commit.message,
            author: commit.author,
            authorEmail: commit.authorEmail,
            repository: commit.repository,
            url: commit.url,
            timestamp: commit.timestamp,
            title: summaryData?.title,
            summary: summaryData?.description,
            summaryStatus: summaryData ? 'completed' : 'failed',
            createdAt: Date.now(),
          }
        );

        if (summaryData) {
          saved++;
          console.log(
            `[Convex] Saved commit ${commit.sha} with title and summary (${saved}/${commits.length})`
          );
        } else {
          console.warn(
            `[Convex] No summary found for commit ${commit.sha}, saved with failed status`
          );
          errors.push({
            sha: commit.sha,
            error: 'Summary not found in batch response',
          });
        }
      } catch (saveError) {
        console.error(
          `[Convex] Failed to save commit ${commit.sha}:`,
          saveError
        );
        errors.push({
          sha: commit.sha,
          error:
            saveError instanceof Error ? saveError.message : String(saveError),
        });
      }
    }

    console.log('[Convex] regenerateAllCommits completed:', {
      deleted: deleteResult.deleted,
      fetched: commits.length,
      saved,
      errors: errors.length,
    });

    return {
      deleted: deleteResult.deleted,
      fetched: commits.length,
      saved,
      errors,
    };
  },
});
