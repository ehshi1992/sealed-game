-- supabase/migrations/006_card_layout_type_check_and_index.sql

ALTER TABLE cards
  DROP CONSTRAINT IF EXISTS cards_card_layout_type_check,
  ADD CONSTRAINT cards_card_layout_type_check
    CHECK (card_layout_type IN ('standard','energy','trainer','full_art','v_vmax','ex_gx'));
