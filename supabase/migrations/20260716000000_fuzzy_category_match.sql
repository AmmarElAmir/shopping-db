-- Fuzzy category matching for the submission-processing pipeline.
--
-- process-submission previously matched categories with a plain
-- case-insensitive equality check, so any near-duplicate name coming back
-- from extraction (e.g. "Baby Strollers" vs. an existing "Strollers") missed
-- the match and forked a new category instead of reusing the close one.
-- This adds trigram similarity search so "close but not exact" names reuse
-- the existing category; a genuinely new category is only created when
-- nothing in the table is a close match.

create extension if not exists pg_trgm;

create or replace function public.find_close_category(candidate text, min_similarity real default 0.3)
returns table(id uuid, name text, similarity real)
language sql
stable
as $$
  select c.id, c.name, similarity(lower(c.name), lower(candidate)) as similarity
  from categories c
  where similarity(lower(c.name), lower(candidate)) >= min_similarity
  order by similarity desc
  limit 1;
$$;
