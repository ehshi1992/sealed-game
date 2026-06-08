-- supabase/migrations/009_card_layer_urls.sql
-- Add layer URL columns for subject and background images

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS subject_layer_url text,
  ADD COLUMN IF NOT EXISTS bg_layer_url text;
