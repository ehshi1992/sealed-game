-- profiles (extends auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text,
  currency integer not null default 100
);

-- cards
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  set text not null,
  number text not null,
  rarity text not null check (rarity in ('common','uncommon','rare','holo_rare','ultra_rare','secret_rare')),
  image_url text not null,
  holo_type text not null check (holo_type in ('none','standard','reverse','full_art','rainbow'))
);

-- packs
create table public.packs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price integer not null,
  image_url text not null,
  card_pool uuid[] not null default '{}'
);

-- user_collection
create table public.user_collection (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  card_id uuid references public.cards(id) not null,
  acquired_at timestamptz not null default now(),
  count integer not null default 1
);

-- transactions
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  type text not null check (type in ('pack_purchase','daily_reward')),
  amount integer not null,
  created_at timestamptz not null default now()
);

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- helper for atomic currency increment
create or replace function public.increment_currency(uid uuid, delta integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  new_val integer;
begin
  update public.profiles set currency = currency + delta where id = uid returning currency into new_val;
  return new_val;
end;
$$;
