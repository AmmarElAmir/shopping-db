-- Dubai Shopping Database schema (Supabase / Postgres)
-- Run this in the Supabase SQL editor once, on a new project.

create extension if not exists "pgcrypto";

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(12,2),
  currency text default 'AED',
  store text,
  product_link text,       -- link to the product/store page
  description text,
  category_id uuid references categories(id) on delete set null,
  image_url text,          -- public URL of an uploaded photo (see storage bucket below), or an external image URL
  source text not null default 'manual' check (source in ('manual', 'online')),
  is_favorite boolean not null default false,
  is_purchased boolean not null default false,
  raw_brief text,          -- the original short brief the user sent
  claude_notes text,       -- Claude's expanded/processed writeup
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_category on products(category_id);
create index if not exists idx_products_favorite on products(is_favorite);
create index if not exists idx_products_purchased on products(is_purchased);

create table if not exists comparisons (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id) on delete set null,
  title text not null,             -- e.g. "Wireless earbuds under 300 AED"
  product_ids uuid[] not null,     -- products included in this comparison
  summary text not null,           -- Claude's comparison writeup
  created_at timestamptz not null default now()
);

-- keep updated_at fresh
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_products_updated on products;
create trigger trg_products_updated
before update on products
for each row execute function set_updated_at();

-- Row Level Security: open read/write since this is a personal/shared tool
-- with no login. Tighten later if you add auth.
alter table categories enable row level security;
alter table products enable row level security;
alter table comparisons enable row level security;

create policy "public read categories" on categories for select using (true);
create policy "public write categories" on categories for insert with check (true);
create policy "public read products" on products for select using (true);
create policy "public write products" on products for insert with check (true);
create policy "public update products" on products for update using (true);
create policy "public read comparisons" on comparisons for select using (true);
create policy "public write comparisons" on comparisons for insert with check (true);

-- Storage bucket for uploaded product photos
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "public read product images" on storage.objects;
create policy "public read product images"
on storage.objects for select
using (bucket_id = 'product-images');

drop policy if exists "public upload product images" on storage.objects;
create policy "public upload product images"
on storage.objects for insert
with check (bucket_id = 'product-images');
