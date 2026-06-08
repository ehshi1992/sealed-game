-- supabase/migrations/008_binder_position.sql
-- Tracks explicit slot position within a binder page grid

alter table public.user_collection
  add column binder_position int;
