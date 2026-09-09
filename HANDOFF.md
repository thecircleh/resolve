# Handoff Notes — For John

This document explains what was built, in plain English, so you can talk about it with a developer and a beta tester without needing to understand any code.

## What you have in this folder

A complete working Resolve web application. When a developer gets this running (which takes an hour or two), you will have a website where:

1. A beta tester goes to a URL you send them.
2. They enter their email and get a sign-in link.
3. They click it and land in the app.
4. On first use, they walk through the Business Context Builder — a guided conversation that produces their Business Context Profile.
5. After that, they can start a session anytime. They pick either "Situation Clarifier" (for any leadership issue) or "Sales Planning" (for sales-specific issues), then describe the issue in their own words.
6. Resolve runs the full seven-prompt methodology in the background. The tester sees a conversation. The system asks one question at a time, applies the materiality filter, classifies the lane and tier, hands off to the right engine, runs the eight-step method, and produces the Required Output Standard.
7. Every session is saved. The tester can come back later to review any session's output.

The seven master prompts — your actual IP — live on the server. The tester never sees them. Even if they open their browser's developer tools, the prompts are never sent to their machine. This matches the IP protection intent you set with your developer.

## The one methodology change I applied

Per your approval, I moved the Structural-vs-Execution diagnostic gate in Business Planner v3 from firing after Step 4 to firing before Step 4. This aligns it with Workflow Architect's Design-vs-Execution gate, which fires before Step 4. The rationale I added to the prompt file:

> Running the diagnostic before Step 4 focuses risk analysis on the right dimension from the start. Structural problems and execution problems have different risk profiles; treating one as the other is the most common cause of failed tactical interventions.

I marked this in the prompt file as "v3.1 correction: gate placement aligned with Workflow Architect v3 for methodological consistency."

If you ever want to revert this or re-tune the wording, the file is at:
`src/resolve/prompts/business-planner.md`

You can edit it directly. No code changes needed to update the methodology.

## What you need to do to get this live

You do not need to do any of this yourself. Give this project to a local web developer along with the following instructions:

1. **Set up hosting.** Sign up for a free Vercel account and a free Neon Postgres account. Deploy the project to Vercel. Connect the Neon database. The README file in this project has step-by-step instructions any web developer will understand.

2. **Get an Anthropic API key.** Sign up at console.anthropic.com. Add a payment method (Anthropic bills per usage — for a small beta group your monthly cost will be under fifty dollars). Paste the API key into the Vercel environment variables as instructed in the README.

3. **Get a Resend email account.** Sign up at resend.com for the free tier. Paste the API key into Vercel. This handles sending sign-in link emails.

4. **Choose a domain.** You can use a free Vercel subdomain (like resolve-beta.vercel.app) or point your own domain at Vercel.

5. **Set your admin email.** In the Vercel environment variables there is an `ADMIN_EMAILS` field. Put your own email address in it. That is the only access setting you need — it lets you sign in and reach the `/admin` page.

6. **Add your testers from the admin page.** Go to `/admin` and use the Beta testers panel: type an email, click "Add & send invite", and that person is added to the beta and emailed a sign-in link straight away. You can resend an invite or revoke someone's access from the same list. No developer and no environment variables involved.

Total developer time to get all this done: half a day to a full day.

## Once it's live

You send each beta tester:

1. A sign-in URL (the deployment URL).
2. A copy of the signed Beta Tester NDA.
3. A copy of the Beta Use Guide.

The tester signs the NDA, goes to the URL, enters their email, gets a link, signs in, builds their Profile, and starts using Resolve.

You can watch the sessions accumulate in the database (any web developer can help you access this) or you can just wait for the beta testers to tell you what worked and what didn't.

## What was hardened for production (per Harvey's request)

This version includes the production-grade pass:

- **Rate limiting.** Each user is capped at 6 messages per minute and 200 per day (both adjustable without code changes). Nobody can accidentally or deliberately run up your API bill.
- **Automatic retries.** If the Claude API has a hiccup, the system silently retries up to three times before showing an error. Most transient failures become invisible.
- **Clear error messages.** When something does fail, the tester sees a plain-English message telling them their work was saved and to try again — not a technical error or blank screen.
- **Streaming responses.** Testers watch the response appear word by word, like ChatGPT or Claude, instead of staring at a spinner for 20 seconds. This matters more than any other single feature for how professional the product feels.
- **Admin dashboard.** Go to /admin (with your email in the ADMIN_EMAILS setting) and you can see: how many users, how many finished profiles, session counts, message volume today, errors today, and estimated API spend today and this week. You do not need a developer to know how your beta is going.
- **Cost optimization.** Prompt caching is turned on, which cuts the LLM cost of every session by roughly 60 to 70 percent. Your beta will run meaningfully cheaper than the original estimates.
- **Leak tracing.** Every deployment embeds an invisible tracking token in its prompts. If your methodology ever shows up somewhere it should not, the token identifies which deployment it leaked from. Your controlled documents were not modified to do this — it happens automatically at runtime.
- **Security hardening.** Standard web security headers, strict input validation, and hardened session cookies.

## What was still NOT built (and why)

- Billing (nobody pays during beta)
- Enterprise sign-on (Tara testers do not need it)
- Multi-region infrastructure and load testing (meaningless at beta scale)
- Formal compliance certifications (a later conversation, if enterprise customers require it)

If Harvey's checklist includes any of these, that is a scoping conversation to have with real requirements in hand, not something to build speculatively.

## The most important thing to know

The seven master prompts and the Business Planner gate correction are stored as separate markdown files in `src/resolve/prompts/`. You can edit any of them, redeploy, and the methodology updates immediately. No coding required.

This means you can iterate on Resolve without waiting on a developer for every change. You still need a developer for hosting and infrastructure work, but the actual IP — the methodology — is yours to shape.

## If something breaks

The most likely failure modes and how to think about them:

- **Emails not arriving:** Resend has a dashboard where you can see whether emails were sent, delivered, or bounced. The developer can help.
- **Sessions time out:** The app is configured for 120-second function timeouts, which requires the Vercel Pro plan (about $20/month). Make sure the developer deploys on Pro, not the free Hobby plan.
- **Model quality drift:** If sessions start producing sloppy output, it is almost never the code. It is either (a) the underlying Claude model changed, or (b) the prompt has drifted. The prompt files are your source of truth.

## What I would do next if I were you

1. Get this deployed. That is 1-2 days of local developer time.
2. Add three testers. Not fifteen. Three.
3. Watch what they hit that surprises you. Fix or note.
4. After 60 days, decide: continue with prototype infrastructure and add testers, or graduate to a hardened build.

Resolve is now real. Everything else is iteration.

— End of Handoff
