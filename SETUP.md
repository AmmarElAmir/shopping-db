# Dubai Shopping Database — setup guide

Two free-tier accounts, one SQL script, one deploy click. ~15 minutes.

## 1. Database (Supabase, free tier)

1. Go to supabase.com, sign up, create a new project (pick a region close to you, e.g. `eu-central-1` or `me-central-1` if offered).
2. Once it's provisioned, open **SQL Editor** and paste the contents of `schema.sql` (included alongside this guide). Run it. This creates the `products`, `categories`, and `comparisons` tables.
3. Go to **Project Settings → API**. Copy the **Project URL** and the **anon public key** — you'll need both.

## 2. Website (Vercel, free tier)

1. Put the `shopping-db` folder in a GitHub repo (create a new empty repo, push the folder's contents to it).
2. Go to vercel.com, sign in with GitHub, click **Add New → Project**, and import that repo.
3. In the import screen, add two environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL from step 1
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon key from step 1
4. Click Deploy. You'll get a `your-project.vercel.app` URL — that's the live site, on any device, shareable with anyone.

Running cost at this scale: $0. Supabase's free tier covers 500MB of database and Vercel's free tier covers personal projects with generous request limits — a personal shopping catalog won't come close to either ceiling.

## 3. How the "Claude does the processing" part works

You keep sending me (Claude, in chat) a quick brief — a name, a rough price, maybe a photo — the same way you do now. I write up the polished description, pick or create the right category, and then insert the finished record directly into your Supabase database using Supabase's REST API. It shows up on the live site immediately, no copy-pasting on your end.

Practically, this needs one more small piece from you: a **service role key** from the same Supabase project settings page (Settings → API → service_role key — keep this one secret, it's not the same as the public anon key). Once you share that key with me in this chat (or better, store it somewhere I can read it from, like a note in this project), I can write new products and comparisons straight into the database whenever you send me a brief, exactly like the custom instructions you already set up for the Dubai Shopping Database project describe.

If you'd rather not hand me a key at all, the fallback is: I draft the finished record and you paste it into the **Add product** page on the live site yourself (that form is already built and working, no typing raw SQL).

## 4. What's already built

- `schema.sql` — the database schema, run once in Supabase.
- `shopping-db/` — the Next.js site:
  - `/` — browse all products, filter by category, favorites, purchased, search by name.
  - `/submit` — public form for anyone to add a product; processed automatically (see §5).
  - `/add` — manual entry form (fallback path, or for you to add things yourself).
  - `/comparisons` — every comparison Claude has written up, logged and browsable.
- Build verified locally — compiles cleanly, ready to deploy as-is.

## 5. Async submissions (let other people add products through a form)

`/submit` is a public form (no chat, no login) that anyone with the site URL — your wife, for instance — can use to add a product. They drop in a link, a description, and/or a few photos; it processes automatically in the background and the finished record appears in the catalog on its own, using the same `products` table and category logic as the chat-based flow.

**How it works:** the form uploads photos straight to a `submission-images` storage bucket and writes a row to a `submissions` staging table. A Supabase Edge Function fires on that insert, calls Claude (Haiku model, kept cheap since it's a short extraction task) with the link/text/photos, gets back a structured product (name, price, store, category, description, and a pick of the best cover photo), and inserts it into `products` — reusing an existing category if one fits instead of creating a duplicate. Any extra photos become a gallery in the new `product_images` table. If extraction fails, the submission is marked `failed` with the error saved, instead of silently disappearing.

**One-time setup, in addition to steps 1–2 above:**

1. Run `supabase/migrations/20260713000000_async_submissions.sql` in the Supabase SQL editor (after `schema.sql`). This adds `submissions`, `submission_images`, `product_images`, and the `submission-images` storage bucket.
2. Deploy the edge function: `supabase functions deploy process-submission` (requires the [Supabase CLI](https://supabase.com/docs/guides/cli), `supabase link`ed to your project).
3. Set the function's secret: `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...` (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected).
4. Wire up the trigger: in the Supabase dashboard, go to **Database → Webhooks → Create a new hook**. Table: `submissions`, event: `INSERT`, target: the deployed `process-submission` function URL, with the `Authorization: Bearer <anon or service_role key>` header set. (Using the dashboard for this — rather than a SQL trigger — keeps the key out of migration files/git history.)

Once that's done, anyone who has the site link can submit through `/submit` and it'll show up in the catalog on its own, no chat step required.

### Manual "Process now" button

A scheduled routine periodically checks the `submissions` table for pending
rows and processes them. The **Bulk queue** page (and the Batch paste modal)
has a "Process now" button that fires that same routine on demand instead of
waiting for its schedule.

The button calls a server-side route (`app/api/process-queue/route.js`),
which holds the routine's trigger URL and token in environment variables so
they never reach the browser:

- `ROUTINE_TRIGGER_URL` — the routine's fire endpoint.
- `ROUTINE_TRIGGER_TOKEN` — the API key sent as the `x-api-key` header for that endpoint.

Both are set in `.env.local` for local dev. **For the deployed site, add the
same two variables in Vercel → Project Settings → Environment Variables** —
do not prefix them with `NEXT_PUBLIC_`, or the token would be exposed in the
browser.

## 6. Self-hosting alternative (if you change your mind on Vercel/Supabase)

Same code runs fine with `npm run build && npm start` on any machine (a Pi, an old laptop, a $4/mo VPS) as long as it can reach the internet and you point it at a Postgres database — Supabase's Postgres is swappable for any Postgres instance, including one you run yourself with Docker. Say the word if you want that version instead — the main trade-off is you handle uptime, HTTPS certs, and security patching yourself.
