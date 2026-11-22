-- Check tracked products on both noon and Amazon.ae.
--
-- Depends on 20261118000000_price_tracking.sql and 20261118000100_price_alerts.sql.
--
-- When a tracked product comes from noon, the scheduled price check looks for
-- the same item on Amazon.ae (and the other way round) and stores it here as a
-- "listing" linked to the product. Each listing then gets its price checked on
-- the same schedule as the product's own link.
--
-- Matching can be wrong (a different colour, size or bundle), so a listing has
-- a match_status:
--   confirmed  same model and variant (exact model number / identical title and
--              variant), or Ammar tapped "Same item" on the tracker tab.
--              Confirmed listings count towards the lowest price and alerts.
--   suggested  probably the same item, but not certain. Its price is checked and
--              shown on the tracker tab with "Same item" / "Not it" buttons; it
--              never triggers an alert until it is confirmed.
--   rejected   Ammar said it is not the same item. Kept so the search does not
--              suggest the same listing again; no longer checked.

create table if not exists product_listings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  store text not null check (store in ('noon', 'amazon')),
  url text not null,
  title text,                       -- the listing's own title, to judge the match
  match_status text not null default 'suggested'
    check (match_status in ('suggested', 'confirmed', 'rejected')),
  match_note text,                  -- why it matched (e.g. "same model WH-1000XM5, Black")
  price numeric(12,2),
  currency text,
  lowest_price numeric(12,2),
  lowest_price_at timestamptz,
  last_checked_at timestamptz,
  last_check_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, url)
);

create index if not exists idx_product_listings_product on product_listings(product_id);

drop trigger if exists trg_product_listings_updated on product_listings;
create trigger trg_product_listings_updated
before update on product_listings
for each row execute function set_updated_at();

-- Set once the other platform has been searched for this product, so the check
-- does not search again on every run. match_search_note explains a miss
-- ("No matching listing on Amazon.ae"). Clearing match_searched_at (the tracker
-- tab's "Search again") queues a new search.
alter table products add column if not exists match_searched_at timestamptz;
alter table products add column if not exists match_search_note text;

-- Which listing a price came from. Null means the product's own link.
alter table price_history add column if not exists listing_id uuid references product_listings(id) on delete cascade;
create index if not exists idx_price_history_listing on price_history(listing_id) where listing_id is not null;

-- Where a price drop was seen, so the alert can say "on Amazon.ae" and link
-- straight to the cheaper listing.
alter table price_alerts add column if not exists store text;
alter table price_alerts add column if not exists link text;

-- Same open posture as the rest of this no-login tool: the site reads listings,
-- confirms or rejects suggestions, and can add a link by hand.
alter table product_listings enable row level security;
drop policy if exists "public read product listings" on product_listings;
create policy "public read product listings" on product_listings for select using (true);
drop policy if exists "public insert product listings" on product_listings;
create policy "public insert product listings" on product_listings for insert with check (true);
drop policy if exists "public update product listings" on product_listings;
create policy "public update product listings" on product_listings for update using (true);
drop policy if exists "public delete product listings" on product_listings;
create policy "public delete product listings" on product_listings for delete using (true);

-- Price-drop alerts now look across both platforms: alert when a check (from
-- the product's own link or a confirmed listing) lands below the lowest price
-- seen anywhere before it. A drop on the pricier platform that is still above
-- the best price is not news, so it does not alert. Suggested and rejected
-- listings are ignored.
create or replace function record_price_drop_alert() returns trigger as $$
declare
  prev_lowest numeric(12,2);
  tracked boolean;
  ends_at timestamptz;
  own_store text;
  own_link text;
  l_status text;
  l_store text;
  l_url text;
begin
  if new.source is distinct from 'check' then
    return new;
  end if;

  select is_tracked, tracking_ends_at, store, coalesce(product_link, product_url)
    into tracked, ends_at, own_store, own_link
  from products where id = new.product_id;
  if not coalesce(tracked, false) then
    return new;
  end if;

  if new.listing_id is not null then
    select match_status, store, url into l_status, l_store, l_url
    from product_listings where id = new.listing_id;
    if l_status is distinct from 'confirmed' then
      return new;
    end if;
  end if;

  select min(h.price) into prev_lowest
  from price_history h
  left join product_listings l on l.id = h.listing_id
  where h.product_id = new.product_id
    and h.id <> new.id
    and (h.listing_id is null or l.match_status = 'confirmed');

  if prev_lowest is not null and new.price < prev_lowest then
    insert into price_alerts (product_id, kind, old_price, new_price, currency, tracking_ends_at,
                              price_history_id, store, link)
    values (new.product_id, 'price_drop', prev_lowest, new.price, new.currency, ends_at, new.id,
            case when new.listing_id is null then own_store
                 when l_store = 'amazon' then 'Amazon.ae' else 'noon' end,
            case when new.listing_id is null then own_link else l_url end);
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;
