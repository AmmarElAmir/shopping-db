-- Adds a `name` column to submissions, for the unified "Add product" modal's
-- Single Product tab (Name is a required field there, separate from the free
-- text description). Nullable since Multiple Links submissions never set it.
alter table submissions add column if not exists name text;
