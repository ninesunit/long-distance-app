-- Sticker revamp (Main changes: Notes popup → drag-and-drop stickers).
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query → Run).
--
-- Adds two columns to the existing `pins` table:
--   kind      — 'food' | 'warmth' | 'decor'. Drives how the cat reacts:
--               food   → cat pathfinds to it, eats it, gains fullness (pin consumed)
--               warmth → cat sits by it to warm up, gains happiness
--               decor  → purely decorative
--   permanent — when true the sticker never fades ("Super Pin").
--
-- Existing rows default to a decorative, non-permanent sticker, so nothing
-- breaks for pins created before this migration.

alter table public.pins add column if not exists kind      text    not null default 'decor';
alter table public.pins add column if not exists permanent boolean not null default false;
