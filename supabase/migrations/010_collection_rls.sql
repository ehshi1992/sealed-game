-- supabase/migrations/009_collection_rls.sql
-- Add missing update/delete policies for user_collection

create policy "collection: own rows update" on public.user_collection
  for update using (auth.uid() = user_id);

create policy "collection: own rows delete" on public.user_collection
  for delete using (auth.uid() = user_id);
