import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import crypto from "crypto";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function verifySignature(
  payload: string,
  signature: string | null,
  secret: string | undefined
): boolean {
  if (!secret || !signature) {
    return true; // Skip verification if secret not configured
  }

  const hmac = crypto.createHmac("sha256", secret);
  const digest = "sha256=" + hmac.update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("x-hub-signature-256");

    // Verify webhook signature if secret is configured
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!verifySignature(body, signature, secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(body);

    // Only process push events
    if (payload.action !== undefined || payload.zen !== undefined) {
      // This is a ping or other event, ignore
      return NextResponse.json({ message: "Event ignored" }, { status: 200 });
    }

    // Check if this is a push event
    if (!payload.ref || !payload.commits) {
      return NextResponse.json({ message: "Not a push event" }, { status: 200 });
    }

    // Filter for main branch and bustakar/inochi repository
    const ref = payload.ref;
    const isMainBranch = ref === "refs/heads/main" || ref === "refs/heads/master";
    const repository = payload.repository?.full_name || "";
    const isTargetRepo = repository === "bustakar/inochi";

    if (!isMainBranch || !isTargetRepo) {
      return NextResponse.json(
        { message: `Ignored: ${repository} ${ref}` },
        { status: 200 }
      );
    }

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

    if (commits.length === 0) {
      return NextResponse.json({ message: "No new commits" }, { status: 200 });
    }

    // Save commits to Convex
    const result = await convex.action(
      (api as any).commits.saveCommits,
      {
        commits,
      }
    );

    return NextResponse.json({
      message: "Commits processed",
      processed: result.length,
      results: result,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

