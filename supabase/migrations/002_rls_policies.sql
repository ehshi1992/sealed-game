-- Enable RLS
alter table public.profiles enable row level security;
alter table public.user_collection enable row level security;
alter table public.transactions enable row level security;
alter table public.cards enable row level security;
alter table public.packs enable row level security;

-- profiles: users can read/update their own row
create policy "profiles: own row" on public.profiles
  for all using (auth.uid() = id);

-- user_collection: users can read their own
create policy "collection: own rows" on public.user_collection
  for select using (auth.uid() = user_id);

-- transactions: users can read and insert their own
create policy "transactions: own rows read" on public.transactions
  for select using (auth.uid() = user_id);

create policy "transactions: own rows insert" on public.transactions
  for insert with check (auth.uid() = user_id);

-- cards: public read
create policy "cards: public read" on public.cards
  for select using (true);

-- packs: public read
create policy "packs: public read" on public.packs
  for select using (true);
