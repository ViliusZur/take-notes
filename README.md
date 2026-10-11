# Weekly Planner

A weekly planning notebook laid out like a paper spread (big picture, day plans, weekly to-do list,
notes, history) with an
optional **Sunday AI planning call**: at the time you choose, an AI assistant phones you, talks
through next week, and the plan appears in your notebook.

The product and technical plan lives in
[privacy-first-weekly-planning-notebook-plan.html](privacy-first-weekly-planning-notebook-plan.html).

## What needs setting up

Only the planner is always on. Everything else switches on when its environment variables are
present, and Settings shows what is off and which variables turn it on.

| Feature                       | Needs                                                              |
| ----------------------------- | ------------------------------------------------------------------ |
| Planner, history, accounts    | Nothing locally. On Vercel: a Neon database and `BETTER_AUTH_SECRET` |
| Google sign-in                | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                         |
| Email reminders               | `RESEND_API_KEY` (+ a scheduler, see step 3.1)                     |
| Planning calls, demo mode     | `VOICE_PROVIDER=simulated`, `ANTHROPIC_API_KEY`                    |
| Planning calls, real phone    | `ANTHROPIC_API_KEY`, `VAPI_*`, `TWILIO_*` (+ a scheduler)          |

Demo mode fakes the phone call (a sample conversation) and the SMS code (`000000`), but the plan is
really extracted by Claude, so it needs an Anthropic API key.

## Launch guide

### Part 1 — Run it on your computer (no accounts needed)

You need Node.js 20.9 or newer and npm. Check your version:

```bash
node -v
```

1. Open a terminal in the project folder and install dependencies:

   ```bash
   npm install
   ```

2. Start the app:

   ```bash
   npm run dev
   ```

3. Open http://localhost:3000 and click **Create an account**. Any email address works; nothing is
   sent. The password needs at least 10 characters.
4. You land on the current week, laid out like a notebook spread. The left page has the month,
   week number, big picture, and each day's plan. The right page has the weekly to-do list and the
   week's notes. Try it out: add to the weekly list, plan items for a day (the ⋯ menu → **Plan
   for**), tick them off, skip one with a reason, write notes (they scroll inside the box and save
   as you type; the ⤢ button opens them full screen), and flip between weeks. **History** lists
   past weeks.
5. Open **Settings**. The **Optional features** card lists what is turned off.

Your data is stored in the `.pglite/` folder. To start over, stop the server (Ctrl+C), delete the
folder, and start again:

```bash
rm -rf .pglite
```

### Part 2 — Try the AI planning call locally (optional)

This uses demo mode: your phone won't ring and no SMS is sent, but Claude really turns a sample
conversation into next week's plan.

1. Create an API key in the [Claude Console](https://console.anthropic.com) (Settings → API keys).
2. Create a file named `.env.local` in the project folder with:

   ```
   VOICE_PROVIDER=simulated
   ANTHROPIC_API_KEY=sk-ant-your-key
   ```

3. Stop the dev server (Ctrl+C) and start it again so it picks up the file:

   ```bash
   npm run dev
   ```

4. In **Settings → Phone number**, enter any number starting with `+1`, `+44`, or `+370`
   (for example `+37060000000`), click **Send code**, and enter `000000`.
5. In **Weekly planning**, turn on **Plan with me every week**, choose **AI phone call**, tick the
   consent box, and click **Save**.
6. In **Planning calls**, click **Call me now**. After 5–20 seconds the call shows **Done**.
   Click **Open 2026-Wxx** to see next week filled in, with a banner to undo the import.

Scheduled runs don't fire on their own locally. To run the scheduler once by hand:

```bash
curl http://localhost:3000/api/cron/planning-runs
```

### Part 3 — Deploy to Vercel (free plan works)

You need a GitHub account and a Vercel account (sign up at https://vercel.com with GitHub).

1. **Put the code on GitHub.** Commit and push. `.env.local` and `.pglite/` are git-ignored and
   stay on your machine.

   ```bash
   git add -A
   ```

   ```bash
   git commit -m "Weekly planner app"
   ```

   ```bash
   git push origin main
   ```

   If the folder has no GitHub remote yet (`git remote -v` prints nothing), create an empty
   repository on GitHub first and connect it before pushing:

   ```bash
   git remote add origin https://github.com/YOUR-NAME/YOUR-REPO.git
   ```

2. **Create a login secret.** Run this and copy the output:

   ```bash
   openssl rand -base64 32
   ```

3. **Import the project.** Go to https://vercel.com/new, pick the repository, and keep the
   detected Next.js settings. Open **Environment Variables**, add `BETTER_AUTH_SECRET` with the
   value from step 2, and click **Deploy**. The build succeeds, but signing up won't work until
   the database exists.
4. **Add a database.** In the project, open the **Storage** tab → **Create Database** → **Neon**
   (Serverless Postgres). Pick a region near you, create it, and connect it to the project for all
   environments. This adds `DATABASE_URL` to the project.
5. **Create the tables.** In **Storage**, open the database and copy its connection string
   (the `DATABASE_URL` value; "Show secret" reveals it). Then run, with your string pasted in:

   ```bash
   DATABASE_URL="postgresql://user:password@host/neondb?sslmode=require" npm run db:migrate
   ```

   It prints the applied migration. Run the same command whenever you pull code that adds files
   under `drizzle/`.
6. **Redeploy.** Environment variables only apply to new deployments: open **Deployments**, click
   ⋯ on the latest one, and choose **Redeploy**.
7. **Open the app** at the production URL Vercel shows (like `https://your-repo.vercel.app`) and
   create an account.
8. *(Optional)* Under **Settings → Functions**, set the function region to the same region as the
   database, for faster pages.
9. *(Optional, custom domain)* Under **Settings → Domains**, add your domain. Then add the variable
   `BETTER_AUTH_URL=https://your-domain.com` and redeploy.

### Part 4 — Turn on optional features

After changing environment variables in Vercel (**Settings → Environment Variables**), redeploy.
Locally, put them in `.env.local` and restart `npm run dev`. `.env.example` lists every variable.

#### 4.1 Scheduler (needed for email reminders and scheduled calls)

The scheduler checks every 5 minutes who should get a reminder or a call.

1. Create a secret and add it to Vercel as `CRON_SECRET`:

   ```bash
   openssl rand -hex 32
   ```

2. Pick one way to call `https://YOUR-APP/api/cron/planning-runs` every 5 minutes:
   - **Vercel Pro**: add a file named `vercel.json` to the project root, then commit and push.
     Vercel sends `CRON_SECRET` automatically.

     ```json
     {
       "crons": [{ "path": "/api/cron/planning-runs", "schedule": "*/5 * * * *" }]
     }
     ```

   - **Vercel Hobby** (free): Vercel cron runs at most once a day there, and a `vercel.json` with
     the 5-minute schedule makes Hobby deployments fail. Use a free external scheduler such as
     https://cron-job.org instead: create a job for the URL above, every 5 minutes, method GET,
     with the header `Authorization: Bearer YOUR-CRON-SECRET`.

3. Check it (you should get a JSON summary, not 401):

   ```bash
   curl -H "Authorization: Bearer YOUR-CRON-SECRET" https://YOUR-APP/api/cron/planning-runs
   ```

#### 4.2 Email reminders (Resend)

1. Sign up at https://resend.com and create an API key (**API Keys → Create**, sending access).
2. Add `RESEND_API_KEY` to Vercel and redeploy.
3. For quick tests you can keep the default sender `onboarding@resend.dev`, but Resend then only
   delivers to the address you signed up to Resend with, so use that address in the app. For real
   use, add your domain in Resend (**Domains → Add domain**, then add the DNS records it shows) and
   set `EMAIL_FROM=Weekly Planner <planner@your-domain.com>`.
4. In the app: **Settings → Weekly planning**, turn it on, choose **Email reminder**, pick a day
   and time, and save. With the scheduler running, the reminder arrives at that time.

#### 4.3 Planning calls in demo mode (on Vercel)

Set `VOICE_PROVIDER=simulated` and `ANTHROPIC_API_KEY`, redeploy, and follow steps 4–6 of Part 2.
Use this only for trying things out: anyone who signs up can trigger simulated calls on your
Anthropic key.

#### 4.4 Real planning calls (Vapi + Twilio)

1. **Claude**: create an API key in the [Claude Console](https://console.anthropic.com) and set
   `ANTHROPIC_API_KEY`.
2. **Twilio (SMS codes)**: sign up at https://twilio.com. From the console home page copy the
   **Account SID** and **Auth Token** into `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`. Go to
   **Verify → Services → Create new**, name it, enable SMS, and copy the **Service SID**
   (starts with `VA`) into `TWILIO_VERIFY_SERVICE_SID`. Trial accounts only send to numbers you
   verified in Twilio, so verify your own phone there or upgrade.
3. **Twilio (calling number)**: **Phone Numbers → Buy a number** with Voice capability. This is
   the number the AI calls from. Trial accounts can only call verified numbers too.
4. **Vapi (the AI voice)**: sign up at https://vapi.ai.
   - **Phone Numbers → Import → Twilio**: enter the number from step 3 plus your Twilio Account
     SID and Auth Token. Copy the imported number's **ID** into `VAPI_PHONE_NUMBER_ID`.
     (Free Vapi numbers can't place outbound calls.)
   - **API Keys**: copy the **private** key into `VAPI_API_KEY`.
   - Generate a webhook secret and set it as `VAPI_WEBHOOK_SECRET`:

     ```bash
     openssl rand -hex 32
     ```

5. Make sure `CALL_ALLOWED_COUNTRY_CODES` includes your country (default `+1,+44,+370`), and that
   the scheduler from 4.1 is running.
6. Redeploy. In the app: **Settings → Phone number** (you get a real SMS code), then **Weekly
   planning → AI phone call** with consent, then **Planning calls → Call me now**. Your phone
   rings; plan your week; the plan appears under next week.

Real calls need a public URL because Vapi sends call results to `/api/webhooks/voice`, so test
them on the deployed app, not on localhost.

#### 4.5 Google sign-in

1. In https://console.cloud.google.com create a project, set up the **OAuth consent screen**
   (External), then **Credentials → Create credentials → OAuth client ID → Web application**.
2. Add the authorized redirect URIs `https://YOUR-APP/api/auth/callback/google` and, for local
   use, `http://localhost:3000/api/auth/callback/google`.
3. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` and redeploy.
   A **Continue with Google** button appears on the sign-in page.

### Troubleshooting

| Symptom                                                     | Fix                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| Error "DATABASE_URL is required on Vercel"                  | Part 3, step 4, then redeploy                                      |
| Sign-up fails; logs say `relation "user" does not exist`    | Run the migration (Part 3, step 5)                                 |
| Error "BETTER_AUTH_SECRET is required in production"        | Part 3, steps 2–3, then redeploy                                   |
| Settings still shows a feature as off                       | Redeploy (Vercel) or restart `npm run dev` after changing variables |
| Scheduler URL returns 401                                   | `CRON_SECRET` missing in Vercel or the header doesn't match        |
| Deploy fails: "Hobby accounts are limited to daily cron jobs" | Remove `vercel.json`, use an external scheduler (4.1)            |
| Sign-in fails on a custom domain                            | Set `BETTER_AUTH_URL` to the domain (Part 3, step 9)               |
| A call stays on "Writing your plan"                         | Check `ANTHROPIC_API_KEY`; the scheduler retries up to three times  |

### Automatic migrations (optional)

`.github/workflows/ci.yml` runs lint, typecheck, tests, and a build on every push. It can also
apply migrations to production on pushes to `main`: in GitHub, create an environment named
`production` with the secret `DATABASE_URL`, and add the repository variable `AUTO_MIGRATE=true`.

## Development

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

Tests run against an in-memory PGlite database and cover ISO weeks, scheduling across daylight
saving time, optional features, Vapi webhook mapping and authentication, planner versioning, and
the full call flow (schedule → call → webhook → extraction → plan → undo, retries, fallbacks).

To change the database, edit `src/server/db/schema.ts`, then generate a migration and commit it:

```bash
npm run db:generate
```

## How it fits together

```
src/
  app/                 Pages (App Router) and REST route handlers under app/api
  components/          UI: planner, settings, shadcn/ui primitives
  lib/                 Code shared by client and server (ISO weeks, schedule rules, API types)
  server/
    features.ts        Which optional features are configured
    db/                Drizzle schema, connection, migrations runner
    modules/           Business logic, one folder per module (service + repository)
      planner/         Weeks, tasks, notes with optimistic concurrency (version + If-Match)
      schedules/       Weekly planning schedule, next run in the user's timezone
      phone/           SMS verification (Twilio Verify, or simulated in demo mode)
      calls/           Starting calls, provider events, applying and undoing plans
      extraction/      Claude structured-output extraction of the plan from a transcript
      voice/           Voice provider adapter (Vapi, simulated)
      notifications/   Emails (never contain planner content)
      cron/            The 5-minute scheduler run
```

**A Sunday call, end to end**

1. The scheduler calls `GET /api/cron/planning-runs` every 5 minutes. Due schedules are claimed
   with a single `UPDATE … RETURNING`, so overlapping runs cannot double-dial.
2. The call is placed through Vapi with an inline assistant. Its prompt carries only the user's
   first name, this week's direction, and unfinished task titles. Recording is off.
3. Vapi posts `status-update` and `end-of-call-report` to `POST /api/webhooks/voice`, authenticated
   with the `x-vapi-secret` header. Events are idempotent.
4. After the response, Claude (`claude-opus-5-5`) extracts direction, weekly tasks (with a day when
   the caller named one), carried-over tasks, day items such as appointments, and notes. The plan
   is appended to next week in one transaction (never overwriting
   what the user wrote), tagged with the call, and can be undone in one click.
5. Unanswered calls are retried once after 15 minutes, then the user gets an email if email is set
   up. Failed extractions are retried up to three times. Transcripts are deleted after 30 days and
   removed from Vapi once processed.

The live conversation runs on `VOICE_MODEL` (default `claude-sonnet-5`), which must be one of the
Anthropic models Vapi accepts.
