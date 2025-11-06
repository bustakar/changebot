import { v } from 'convex/values';
import { action, query, ActionCtx } from './_generated/server';
import { internal } from './_generated/api';
import { Doc, Id } from './_generated/dataModel';

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      date: string;
    };
  };
}

async function fetchTagCommit(sha: string, repository: string): Promise<GitHubCommit> {
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

async function getCommitsBetweenTags(
  ctx: ActionCtx,
  currentTagSha: string,
  repository: string
): Promise<Doc<'commits'>[]> {
  // Get all commits from the database
  const allCommits = await ctx.runQuery(
    internal.releasesInternal.getCommitsByRepository,
    {
      repository,
    }
  );

  // Get all releases to find the previous one
  const releases = await ctx.runQuery(
    internal.releasesInternal.getReleasesByRepository,
    {
      repository,
    }
  );

  // Fetch the tag commit to get its timestamp
  const tagCommit = await fetchTagCommit(currentTagSha, repository);
  const tagDate = new Date(tagCommit.commit.author.date).getTime();

  // Find previous release to get date range
  const sortedReleases = releases.sort((a, b) => b.date - a.date);
  const previousRelease = sortedReleases.find(
    (r) => r.tagSha !== currentTagSha
  );
  const previousDate = previousRelease?.date || 0;

  // Filter commits between previous release and current tag
  // Exclude commits that already have a version assigned
  return allCommits.filter(
    (c) =>
      c.timestamp > previousDate &&
      c.timestamp <= tagDate &&
      !c.version // Only include commits that haven't been assigned to a version yet
  );
}

export const syncRelease = action({
  args: {
    version: v.string(),
    sha: v.string(),
    date: v.number(),
  },
  handler: async (ctx, args): Promise<{ releaseId: Id<'releases'>; commitCount: number }> => {
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
    await ctx.runMutation(
      internal.releasesInternal.linkCommitsToVersion,
      {
        version: args.version,
        commitShas: commits.map((c) => c.sha),
        repository,
      }
    );

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

