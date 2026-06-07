-- supabase/migrations/007_binders.sql

create table public.binders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  color text not null default '#6366f1',
  created_at timestamptz not null default now()
);

alter table public.user_collection
  add column binder_id uuid references public.binders(id) on delete set null;

-- RLS: owner-only all ops
alter table public.binders enable row level security;

create policy "binders: owner all"
  on public.binders
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
