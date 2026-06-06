alter table public.cards add constraint cards_set_number_unique unique (set, number);
