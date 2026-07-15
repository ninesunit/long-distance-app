-- Sticker sandbox: two new pet stats (Energy + Thirst).
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query → Run).
--
--   energy — drained by roaming/play, refilled by resting (pillow) & sweets (cupcake)
--   thirst — drained over time, refilled by drinking (milk)
--
-- Existing rows default to full, so nothing breaks for couples created before
-- this migration.

alter table public.pet_needs add column if not exists energy real not null default 100;
alter table public.pet_needs add column if not exists thirst real not null default 100;
