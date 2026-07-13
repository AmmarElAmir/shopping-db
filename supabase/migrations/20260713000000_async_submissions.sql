-- Async web submission pipeline
-- Adds staging tables for public submissions, a gallery table for products
-- (so a submission's extra photos survive alongside the single existing
-- products.image_url cover field), and the submission-images storage bucket.
--
-- Run this after schema.sql (which must already exist) via the Supabase SQL
-- editor, or `supabase db push` if you're using the CLI.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- submissions: one row per public form submission, staged before processing
-- ---------------------------------------------------------------------------
create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  link text,
  text text,
  submitted_by text,
  status text not null default 'pending' check (status in ('pending', 'processed', 'failed')),
  error text,                      -- failure reason, set when status = 'failed'
  product_id uuid references products(id) on delete set null, -- filled in on success
  created_at timestamptz not null default now()
);

create index if not exists idx_submissions_status on submissions(status);

-- ---------------------------------------------------------------------------
-- submission_images: zero or more photos attached to a submission
-- ---------------------------------------------------------------------------
create table if not exists submission_images (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  image_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_submission_images_submission on submission_images(submission_id);

-- ---------------------------------------------------------------------------
-- product_images: gallery for products, since today `products.image_url` only
-- holds a single cover image. A submission with multiple photos keeps
-- Claude's chosen best photo as products.image_url and the rest go here.
-- ---------------------------------------------------------------------------
create table if not exists product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  image_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_images_product on product_images(product_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — open read/write, same posture as the rest of this
-- personal/shared tool (no login). Tighten later if you add auth.
-- ---------------------------------------------------------------------------
alter table submissions enable row level security;
alter table submission_images enable row level security;
alter table product_images enable row level security;

drop policy if exists "public read submissions" on submissions;
create policy "public read submissions" on submissions for select using (true);
drop policy if exists "public insert submissions" on submissions;
create policy "public insert submissions" on submissions for insert with check (true);
drop policy if exists "service update submissions" on submissions;
create policy "service update submissions" on submissions for update using (true);

drop policy if exists "public read submission images" on submission_images;
create policy "public read submission images" on submission_images for select using (true);
drop policy if exists "public insert submission images" on submission_images;
create policy "public insert submission images" on submission_images for insert with check (true);

drop policy if exists "public read product images" on product_images;
create policy "public read product images" on product_images for select using (true);
drop policy if exists "service insert product images" on product_images;
create policy "service insert product images" on product_images for insert with check (true);

-- ---------------------------------------------------------------------------
-- Storage bucket for raw submission photos, uploaded directly by the public
-- form before the row in `submissions` even exists.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('submission-images', 'submission-images', true)
on conflict (id) do nothing;

drop policy if exists "public read submission images bucket" on storage.objects;
create policy "public read submission images bucket"
on storage.objects for select
using (bucket_id = 'submission-images');

drop policy if exists "public upload submission images bucket" on storage.objects;
create policy "public upload submission images bucket"
on storage.objects for insert
with check (bucket_id = 'submission-images');

-- ---------------------------------------------------------------------------
-- Trigger note: this migration intentionally does NOT wire up the
-- "call the edge function on insert" step in SQL. Supabase's supported way
-- to do that is a Database Webhook (Dashboard → Database → Webhooks →
-- Create a new hook → table: submissions, event: INSERT → HTTP request to
-- the deployed process-submission function), which keeps the function URL
-- and auth header out of the SQL migration history. See SETUP.md for the
-- exact steps.
-- ---------------------------------------------------------------------------
