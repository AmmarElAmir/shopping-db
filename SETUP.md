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
  - `/add` — manual entry form (fallback path, or for you to add things yourself).
  - `/comparisons` — every comparison Claude has written up, logged and browsable.
- Build verified locally — compiles cleanly, ready to deploy as-is.

## 5. Self-hosting alternative (if you change your mind on Vercel/Supabase)

Same code runs fine with `npm run build && npm start` on any machine (a Pi, an old laptop, a $4/mo VPS) as long as it can reach the internet and you point it at a Postgres database — Supabase's Postgres is swappable for any Postgres instance, including one you run yourself with Docker. Say the word if you want that version instead — the main trade-off is you handle uptime, HTTPS certs, and security patching yourself.
