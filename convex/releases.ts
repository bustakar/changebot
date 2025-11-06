import { v } from 'convex/values';
import { internal } from './_generated/api';
import { Doc, Id } from './_generated/dataModel';
import { action, ActionCtx, query } from './_generated/server';

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      date: string;
    };
  };
}

async function fetchTagCommit(
  sha: string,
  repository: string
): Promise<GitHubCommit> {
  const [owner, repo] = repository.split('/');
  const token = process.env.GITHUB_TOKEN;

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`,
    {
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'ChangeBot',
          },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error: ${response.status} ${errorText}`);
  }

  return await response.json();
}

async function fetchCommitsBetweenTags(
  previousTagSha: string | null,
  currentTagSha: string,
  repository: string
): Promise<string[]> {
  const [owner, repo] = repository.split('/');
  const token = process.env.GITHUB_TOKEN;

  // Use GitHub compare API to get commits between tags
  // If no previous tag, compare from the beginning
  const base = previousTagSha || '';
  const head = currentTagSha;

  const compareUrl = base
    ? `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`
    : `https://api.github.com/repos/${owner}/${repo}/commits?sha=${head}`;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'ChangeBot',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(compareUrl, { headers });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  // Extract commit SHAs from the response
  if (base) {
    // Compare API returns commits array
    return (data.commits || []).map((commit: any) => commit.sha);
  } else {
    // Commits API returns array of commits
    return (data || []).map((commit: any) => commit.sha);
  }
}

async function getCommitsBetweenTags(
  ctx: ActionCtx,
  currentTagSha: string,
  repository: string
): Promise<Doc<'commits'>[]> {
  // Get all releases to find the previous one
  const releases = await ctx.runQuery(
    internal.releasesInternal.getReleasesByRepository,
    {
      repository,
    }
  );

  // Find previous release
  const sortedReleases = releases.sort((a, b) => b.date - a.date);
  const previousRelease = sortedReleases.find(
    (r) => r.tagSha !== currentTagSha
  );
  const previousTagSha = previousRelease?.tagSha || null;

  // Fetch commit SHAs between tags from GitHub
  const commitShas = await fetchCommitsBetweenTags(
    previousTagSha,
    currentTagSha,
    repository
  );

  // Get all commits from the database
  const allCommits = await ctx.runQuery(
    internal.releasesInternal.getCommitsByRepository,
    {
      repository,
    }
  );

  // Match GitHub commit SHAs with database commits
  // Only include commits that haven't been assigned to a version yet
  const commitShaSet = new Set(commitShas);
  return allCommits.filter(
    (c) => commitShaSet.has(c.sha) && !c.version
  );
}

export const syncRelease = action({
  args: {
    version: v.string(),
    sha: v.string(),
    date: v.number(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ releaseId: Id<'releases'>; commitCount: number }> => {
    const repository = process.env.GITHUB_REPOSITORY;
    if (!repository) {
      throw new Error('GITHUB_REPOSITORY not set');
    }

    // Get all commits between this tag and the previous tag
    const commits = await getCommitsBetweenTags(ctx, args.sha, repository);

    // Create release record
    const releaseId: Id<'releases'> = await ctx.runMutation(
      internal.releasesInternal.createRelease,
      {
        version: args.version,
        tagSha: args.sha,
        date: args.date,
        repository,
      }
    );

    // Link commits to this version
    await ctx.runMutation(internal.releasesInternal.linkCommitsToVersion, {
      version: args.version,
      commitShas: commits.map((c) => c.sha),
      repository,
    });

    return { releaseId, commitCount: commits.length };
  },
});

export const getReleases = query({
  args: {},
  handler: async (ctx) => {
    const repository = process.env.GITHUB_REPOSITORY;
    if (!repository) {
      return [];
    }

    const releases = await ctx.db
      .query('releases')
      .withIndex('by_repository', (q) => q.eq('repository', repository))
      .order('desc')
      .collect();

    // For each release, get its commits
    const releasesWithCommits = await Promise.all(
      releases.map(async (release) => {
        const commits = await ctx.db
          .query('commits')
          .withIndex('by_version', (q) => q.eq('version', release.version))
          .order('desc')
          .collect();

        return {
          ...release,
          commits: commits.map((c) => ({
            sha: c.sha,
            title: c.title || c.message.split('\n')[0],
            summary: c.summary,
            author: c.author,
            url: c.url,
            timestamp: c.timestamp,
          })),
        };
      })
    );

    return releasesWithCommits;
  },
});
