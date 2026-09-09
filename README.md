# Resolve — Web Application

A Next.js implementation of the Resolve Leadership Decision Intelligence System. This application provides the backend orchestration and a minimal frontend for a small beta group of leaders to run Resolve sessions on their own decisions.

## What this app does

1. Signs in leaders via a passwordless magic-link email.
2. Walks each leader through the Resolve Business Context Builder to produce their Business Context Profile (one-time per user).
3. Lets a leader start a new session for any leadership issue, choosing between the general Situation Clarifier entry or the sales-specific Sales Planning entry.
4. Runs the full seven-prompt Resolve architecture server-side: Entry (Situation Clarifier or Sales Planning) applies the Materiality, Tier, and Lane discipline gates, then hands off to the appropriate Engine (Decision Maker, Business Planner, or Workflow Architect). The Engine runs Steps 4-8 of the Eight-Step Method and produces the Required Output Standard.
5. Stores every session and its output for the leader to revisit.

The seven master prompts live in `src/resolve/prompts/*.md` and are read at server startup. **They never leave the server.** The client never sees them, and no API response includes them.

## Tech stack

- **Next.js 14** (App Router, TypeScript, React 18)
- **Tailwind CSS** for styling
- **Prisma** ORM
- **PostgreSQL** (Neon recommended for hosting; any Postgres works)
- **Anthropic Claude API** (Sonnet model recommended)
- **Resend** for transactional email
- **jose** for JWT session cookies

## Local development

### 1. Prerequisites

- Node.js 20 or newer
- A PostgreSQL database (use a free Neon database at https://neon.tech, or run one locally with Docker)
- An Anthropic API key (get one at https://console.anthropic.com)
- A Resend API key for email (get one free at https://resend.com)

### 2. Install and configure

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local` and fill in every required value. See `.env.example` for guidance on each.

### 3. Set up the database

```bash
npm run db:push
```

This will apply the schema in `prisma/schema.prisma` to your Postgres database.

### 4. Run the app

```bash
npm run dev
```

The app runs at http://localhost:3000.

### 5. Sign in

Go to http://localhost:3000/login and enter your email. If your `RESEND_API_KEY` is valid, you will receive an email. If not, look at the dev server logs — the magic-link URL will be printed to the console.

## Deploying to production (Vercel)

### 1. Push the code to GitHub

Create a new repository and push this project to it.

### 2. Create a Neon Postgres database

- Go to https://neon.tech and create a free project.
- Copy the connection string.

### 3. Create a Vercel project

- Go to https://vercel.com and import the GitHub repository.
- **Use the Vercel Pro plan** ($20/month). The LLM endpoints set `maxDuration = 120` seconds, which exceeds the Hobby plan's limit.
- Set the environment variables from `.env.example`. The Vercel dashboard has a form for this.
- Ensure `DATABASE_URL` uses the Neon pooled connection string with `?sslmode=require` and add `?pgbouncer=true&connection_limit=1` for serverless best practice.
- Set `NEXT_PUBLIC_APP_URL` to the Vercel deployment URL.
- Set `ADMIN_EMAILS` to the program owner's email so they can view `/admin`.

### 4. Deploy

Vercel will build and deploy automatically. After first deploy:

```bash
# Run once from your local machine, pointing at the Neon DB:
DATABASE_URL="your-neon-url" npx prisma db push
```

This will create the tables in production.

### 5. Configure Resend for a real "from" domain

For beta you can send from Resend's default domain. For production you should verify your own domain in Resend and set `EMAIL_FROM` accordingly.

## How the orchestration works

The heart of the system is `src/resolve/orchestrator.ts`. Its job is to:

1. Take a session's current state (which of the seven prompts is currently active, the loaded Business Context Profile, and the full conversation history so far).
2. Assemble a system prompt: Operating Spine + the loaded Business Context Profile + the active prompt + a small control-signal discipline block.
3. Call Claude with the assembled system prompt and the conversation history.
4. Parse the model's response for a control signal on the last line, which tells us whether the session should transition to a different prompt (Entry -> Engine), end in Monitor lane, or complete with output delivered.
5. Return the cleaned assistant text (with the signal stripped) and the state transition to the API route.

State transitions are persisted to the database so the next turn resumes correctly.

## Editing the master prompts

Because the prompts live as plain markdown files in `src/resolve/prompts/`, you can update the methodology without touching any code. Just edit the `.md` file and redeploy. Version numbers in the file headers should be kept accurate for traceability.

## Production hardening included

This build includes the hardening pass requested before beta:

- **Rate limiting** — per-user caps (default 6 messages/minute, 200/day), DB-backed so it works across serverless instances. Configurable via `RATE_LIMIT_PER_MINUTE` and `RATE_LIMIT_PER_DAY`.
- **Retry logic** — Claude API calls retry up to 3 times with exponential backoff on 429/5xx/529 responses.
- **Streaming** — session responses stream token-by-token via SSE. The control signal is held back server-side and never reaches the client.
- **Prompt caching** — the system prompt block is marked with `cache_control`, cutting input-token cost roughly 60-70% on every turn after a session's first.
- **Admin dashboard** — `/admin` shows users, sessions, message volume, error counts, and estimated API spend (today and trailing 7 days). Grant access via the `ADMIN_EMAILS` env var.
- **Error logging** — all turn failures write to an `ErrorLog` table surfaced on the admin dashboard, plus structured JSON logs for Vercel's log viewer.
- **Canary token** — a deployment-specific token derived from `AUTH_SECRET` is injected into every assembled prompt at load time. If prompt text leaks, the token identifies the source deployment. The controlled prompt documents themselves are never modified.
- **Security headers** — HSTS, X-Frame-Options DENY, nosniff, referrer policy, and a restrictive permissions policy on all routes.
- **Function timeouts** — `maxDuration = 120` on LLM endpoints. Requires the Vercel Pro plan.

## What is still not included

- Billing and subscription management (nobody pays in beta)
- SSO / enterprise auth
- Multi-region failover, load testing, horizontal scaling
- SOC 2 / ISO compliance tooling
- Full observability stack (Sentry, Datadog)

Add these when moving from closed beta to public SaaS.
