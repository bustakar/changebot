# GitHub Commit Timeline

A Next.js + Convex app that displays AI-summarized GitHub commits in an infinite timeline.

## Features

- Listens to GitHub webhooks for commits on the main branch
- Automatically summarizes commits using AI (Gemini Flash 2.0 via OpenRouter)
- Displays commits in an infinite scroll timeline
- Real-time updates via Convex

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Initialize Convex

```bash
npx convex dev
```

This will:

- Create a Convex project (if needed)
- Generate the API types
- Provide you with `NEXT_PUBLIC_CONVEX_URL`

### 3. Environment Variables

Create a `.env.local` file with:

```bash
# Convex Deployment URL (from step 2)
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud

# OpenRouter API Key for AI summarization (get from https://openrouter.ai)
OPENROUTER_API_KEY=sk-or-v1-...

# AI Model to use (default: google/gemini-flash-2.0)
AI_MODEL=google/gemini-flash-2.0

# OpenRouter HTTP Referer (optional, for API tracking)
OPENROUTER_HTTP_REFERER=https://github.com

# GitHub Repository to watch (format: owner/repo-name)
GITHUB_REPOSITORY=owner/repo-name

# GitHub Webhook Secret (optional, for webhook signature verification)
GITHUB_WEBHOOK_SECRET=your-secret-here
```

**Note:** For the regenerate commits CLI script, you'll also need to set `GITHUB_TOKEN` in your Convex environment (see "Regenerating All Commits" section below).

### 4. Deploy Convex Functions

Make sure Convex is running (`npx convex dev`) to push your schema and functions.

### 5. Configure GitHub Webhook

1. Go to your repository (the one you set in `GITHUB_REPOSITORY`)
2. Settings → Webhooks → Add webhook
3. Payload URL: `https://your-domain.com/api/webhook/github`
4. Content type: `application/json`
5. Events: Select "Just the push event"
6. Secret: (optional) Set `GITHUB_WEBHOOK_SECRET` in your environment

### 6. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the timeline.

## Regenerating All Commits

You can regenerate all commits from the main branch using the Convex CLI. This will:

1. Delete all existing commits from the database
2. Fetch all commits from GitHub main branch
3. Generate summaries for all commits

### Prerequisites

**Convex environment variables** (set via `npx convex env set` or Convex dashboard):

- `GITHUB_TOKEN` - GitHub personal access token (required for fetching commits)
- `OPENROUTER_API_KEY` - For AI summarization
- `GITHUB_REPOSITORY` - Repository in format `owner/repo`

### Usage

Simply run the function using the Convex CLI:

```bash
npx convex run commits:regenerateAllCommits
```

The function will:

- Use `GITHUB_REPOSITORY` from environment variables
- Always fetch from the `main` branch
- Return statistics including number of commits deleted, fetched, saved, and any errors

## Deployment

### Vercel

1. Push your code to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_CONVEX_URL`
   - `OPENROUTER_API_KEY`
   - `AI_MODEL` (optional, default: google/gemini-flash-2.0)
   - `OPENROUTER_HTTP_REFERER` (optional)
   - `GITHUB_REPOSITORY` (required, format: owner/repo-name)
   - `GITHUB_WEBHOOK_SECRET` (optional)
4. Deploy

Update your GitHub webhook URL to point to your Vercel deployment.

## Architecture

- **GitHub Webhook** → `/api/webhook/github` → Saves commits to Convex
- **Convex Actions** → Automatically summarize commits using OpenRouter (Gemini Flash 2.0)
- **Frontend** → Displays commits with infinite scroll using Convex queries

TEST
