'use client';

import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function categorizeCommits(commits: any[]) {
  const categories: Record<string, any[]> = {
    '🚀 Features': [],
    '🐞 Bug Fixes': [],
    '🏎 Performance': [],
    '📝 Documentation': [],
    'Other': [],
  };

  for (const commit of commits) {
    const message = commit.title || commit.message || '';
    const lowerMessage = message.toLowerCase();

    if (
      lowerMessage.includes('feat') ||
      lowerMessage.includes('feature') ||
      lowerMessage.includes('add')
    ) {
      categories['🚀 Features'].push(commit);
    } else if (
      lowerMessage.includes('fix') ||
      lowerMessage.includes('bug')
    ) {
      categories['🐞 Bug Fixes'].push(commit);
    } else if (
      lowerMessage.includes('perf') ||
      lowerMessage.includes('performance')
    ) {
      categories['🏎 Performance'].push(commit);
    } else if (
      lowerMessage.includes('doc') ||
      lowerMessage.includes('readme')
    ) {
      categories['📝 Documentation'].push(commit);
    } else {
      categories['Other'].push(commit);
    }
  }

  // Remove empty categories
  return Object.entries(categories).filter(
    ([_, commits]) => commits.length > 0
  );
}

export function Changelog() {
  const releases = useQuery(api.releases.getReleases);

  if (releases === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (releases.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <h1 className="text-4xl font-bold mb-8">Changelog</h1>
        <p className="text-gray-600">
          No releases yet. Create a git tag to get started!
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-4xl font-bold mb-12">Changelog</h1>

      <div className="space-y-16">
        {releases.map((release) => {
          const categorized = categorizeCommits(release.commits);

          return (
            <div
              key={release._id}
              className="border-b border-gray-200 pb-12 last:border-0"
            >
              <div className="mb-6">
                <h2 className="text-3xl font-semibold mb-2">
                  {release.version}
                </h2>
                <p className="text-gray-500">{formatDate(release.date)}</p>
              </div>

              {categorized.map(([category, commits]) => (
                <div key={category} className="mb-8">
                  <h3 className="text-xl font-semibold mb-4">{category}</h3>
                  <ul className="space-y-3">
                    {commits.map((commit) => (
                      <li key={commit.sha} className="flex items-start gap-3">
                        <span className="text-gray-400">•</span>
                        <div className="flex-1">
                          <p className="text-gray-900">
                            {commit.title || commit.message.split('\n')[0]}
                          </p>
                          {commit.summary && (
                            <div className="mt-1 text-sm text-gray-600 whitespace-pre-line">
                              {commit.summary}
                            </div>
                          )}
                          <a
                            href={commit.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline mt-1 inline-block"
                          >
                            View on GitHub →
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

