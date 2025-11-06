'use client';

import { usePaginatedQuery } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../convex/_generated/api';

interface Commit {
  _id: string;
  _creationTime: number;
  sha: string;
  message: string;
  title?: string;
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
  // Clean up title: remove bullet points, dashes, and take first line only
  let displayTitle = commit.title || commit.message;
  if (displayTitle) {
    // Remove leading dashes and bullet points
    displayTitle = displayTitle.replace(/^[-•]\s*/, '').trim();
    // Take only the first line
    displayTitle = displayTitle.split('\n')[0].trim();
    // Remove any remaining dashes at the start
    displayTitle = displayTitle.replace(/^[-•]\s*/, '').trim();
  }

  // Parse bullet points from summary
  const bulletPoints = commit.summary
    ? commit.summary
        .split('\n')
        .filter((line) => line.trim().startsWith('-'))
        .map((line) => line.trim().substring(1).trim())
    : [];

  return (
    <div className="border-l-2 border-gray-200 pl-6 pb-8 relative">
      <div className="absolute -left-1.5 top-0 w-3 h-3 bg-blue-500 rounded-full"></div>
      <div className="flex flex-col gap-2">
        <time
          dateTime={new Date(commit.timestamp).toISOString()}
          className="text-xs text-gray-500 whitespace-nowrap"
        >
          {formatDate(commit.timestamp)}
        </time>
        <div className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              {displayTitle}
            </h3>
            {bulletPoints.length > 0 && (
              <ul className="text-xs text-gray-600 space-y-1 mb-2">
                {bulletPoints.map((point, idx) => (
                  <li key={idx} className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
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
          <div className="flex items-center gap-2 text-xs text-gray-500">
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
