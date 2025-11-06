import { ConvexHttpClient } from 'convex/browser';
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { api } from '../../../../convex/_generated/api';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function verifySignature(
  payload: string,
  signature: string | null,
  secret: string | undefined
): boolean {
  if (!secret || !signature) {
    return true; // Skip verification if secret not configured
  }

  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

export async function POST(request: NextRequest) {
  try {
    console.log('[Webhook] Received GitHub webhook request');
    const body = await request.text();
    const signature = request.headers.get('x-hub-signature-256');

    // Verify webhook signature if secret is configured
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!verifySignature(body, signature, secret)) {
      console.log('[Webhook] Signature verification failed');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    console.log('[Webhook] Signature verified');

    const payload = JSON.parse(body);
    console.log(
      '[Webhook] Event type:',
      payload.action ? 'action' : payload.zen ? 'ping' : 'push'
    );
    console.log('[Webhook] Repository:', payload.repository?.full_name);
    console.log('[Webhook] Ref:', payload.ref);

    // Only process push events
    if (payload.action !== undefined || payload.zen !== undefined) {
      // This is a ping or other event, ignore
      console.log('[Webhook] Ignoring non-push event');
      return NextResponse.json({ message: 'Event ignored' }, { status: 200 });
    }

    // Check if this is a push event
    if (!payload.ref || !payload.commits) {
      console.log('[Webhook] Not a push event - missing ref or commits');
      return NextResponse.json(
        { message: 'Not a push event' },
        { status: 200 }
      );
    }

    // Filter for main branch and configured repository
    const ref = payload.ref;
    const isMainBranch =
      ref === 'refs/heads/main' || ref === 'refs/heads/master';
    const repository = payload.repository?.full_name || '';
    const targetRepo = process.env.GITHUB_REPOSITORY;

    console.log('[Webhook] Checking repository match:', {
      received: repository,
      expected: targetRepo,
      isMainBranch,
      ref,
    });

    if (!targetRepo) {
      console.error('[Webhook] GITHUB_REPOSITORY not configured');
      return NextResponse.json(
        { error: 'GITHUB_REPOSITORY environment variable not configured' },
        { status: 500 }
      );
    }

    const isTargetRepo = repository === targetRepo;

    if (!isMainBranch || !isTargetRepo) {
      console.log('[Webhook] Ignoring event:', {
        repository,
        ref,
        isMainBranch,
        isTargetRepo,
      });
      return NextResponse.json(
        { message: `Ignored: ${repository} ${ref}` },
        { status: 200 }
      );
    }

    console.log('[Webhook] Processing commits for:', repository, ref);

    // Extract commit data
    const commits = payload.commits
      .filter((commit: any) => commit.distinct) // Only distinct commits
      .map((commit: any) => ({
        sha: commit.id,
        message: commit.message,
        author: commit.author.name,
        authorEmail: commit.author.email,
        repository: repository,
        url: commit.url,
        timestamp: new Date(commit.timestamp).getTime(),
      }));

    console.log(
      '[Webhook] Extracted commits:',
      commits.length,
      'distinct commits'
    );

    if (commits.length === 0) {
      console.log('[Webhook] No distinct commits to process');
      return NextResponse.json({ message: 'No new commits' }, { status: 200 });
    }

    // Save commits to Convex
    console.log('[Webhook] Saving commits to Convex...');
    const result = await convex.action((api as any).commits.saveCommits, {
      commits,
    });

    console.log('[Webhook] Successfully processed', result.length, 'commits');
    return NextResponse.json({
      message: 'Commits processed',
      processed: result.length,
      results: result,
    });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
