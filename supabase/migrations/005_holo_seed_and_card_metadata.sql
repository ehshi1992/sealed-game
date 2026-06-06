-- supabase/migrations/005_holo_seed_and_card_metadata.sql

-- Per-instance holo seed on user_collection
ALTER TABLE user_collection
  ADD COLUMN IF NOT EXISTS holo_seed JSONB;

-- Layout hint + CV-computed bounds on cards
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS card_layout_type TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS artwork_bounds    JSONB,
  ADD COLUMN IF NOT EXISTS supertype         TEXT,
  ADD COLUMN IF NOT EXISTS subtypes          TEXT[],
  ADD COLUMN IF NOT EXISTS hp                INT,
  ADD COLUMN IF NOT EXISTS types             TEXT[],
  ADD COLUMN IF NOT EXISTS artist            TEXT,
  ADD COLUMN IF NOT EXISTS flavor_text       TEXT,
  ADD COLUMN IF NOT EXISTS national_pokedex_numbers INT[],
  ADD COLUMN IF NOT EXISTS set_name          TEXT,
  ADD COLUMN IF NOT EXISTS set_code          TEXT,
  ADD COLUMN IF NOT EXISTS rarity_raw        TEXT;
