'use client';

import { usePaginatedQuery } from 'convex/react';
import { useEffect, useRef } from 'react';

// Import with type assertion until Convex types are generated
function getApi() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const apiModule = require('../../../convex/_generated/api');
    return apiModule.api;
  } catch {
    // Fallback for build time - return a mock API that will be replaced at runtime
    return {
      commitsQuery: {
        list: () => {},
      },
    } as any;
  }
}

const api = getApi();

interface Commit {
  _id: string;
  _creationTime: number;
  sha: string;
  message: string;
  summary?: string;
  author: string;
  authorEmail: string;
  repository: string;
  url: string;
  timestamp: number;
  createdAt: number;
  summaryStatus: 'pending' | 'completed' | 'failed';
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CommitCard({ commit }: { commit: Commit }) {
  return (
    <div className="border-l-2 border-gray-200 pl-6 pb-8 relative">
      <div className="absolute -left-1.5 top-0 w-3 h-3 bg-blue-500 rounded-full"></div>
      <div className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              {commit.summary || commit.message}
            </h3>
            {commit.summary && (
              <p className="text-xs text-gray-500 mb-2 line-clamp-2">
                {commit.message}
              </p>
            )}
            {commit.summaryStatus === 'pending' && (
              <p className="text-xs text-gray-400 italic">Summarizing...</p>
            )}
            {commit.summaryStatus === 'failed' && (
              <p className="text-xs text-orange-500 italic">
                Summary unavailable
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span className="font-medium">{commit.author}</span>
            <span>•</span>
            <a
              href={commit.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              {commit.sha.substring(0, 7)}
            </a>
          </div>
          <time dateTime={new Date(commit.timestamp).toISOString()}>
            {formatDate(commit.timestamp)}
          </time>
        </div>
      </div>
    </div>
  );
}

export function Timeline() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.commitsQuery.list,
    {},
    { initialNumItems: 20 }
  );

  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && status === 'CanLoadMore') {
          loadMore(20);
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [status, loadMore]);

  if (status === 'LoadingFirstPage') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading commits...</div>
      </div>
    );
  }

  if (!results || results.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            No commits yet
          </h2>
          <p className="text-gray-500">
            Commits will appear here once webhooks are configured.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Commit Timeline</h1>
      <div className="relative">
        {results.map((commit: Commit) => (
          <CommitCard key={commit._id} commit={commit} />
        ))}
        <div ref={observerTarget} className="h-4">
          {status === 'LoadingMore' && (
            <div className="text-center text-gray-500 py-4">
              Loading more...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
