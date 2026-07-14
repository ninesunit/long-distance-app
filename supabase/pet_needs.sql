-- Shared Tamagotchi "needs" state, one row per couple.
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query → Run).
--
-- fullness / happiness are 0..100 and DECAY OVER TIME. We never store the
-- decayed value on a timer; instead the client computes the current value from
-- `updated_at` (see needsStore.ts). Feeding/petting "checkpoints" the decay by
-- writing fresh values + updated_at = now(). experience accumulates and drives
-- `stage` (evolution level).

create table if not exists public.pet_needs (
  couple_key  text primary key,
  fullness    real        not null default 100,
  happiness   real        not null default 100,
  experience  real        not null default 0,
  stage       integer     not null default 1,
  updated_at  timestamptz not null default now()
);

alter table public.pet_needs enable row level security;

-- A couple_key is "uuidA-uuidB" (two full UUIDs). A member's own UUID always
-- appears as a contiguous substring, so this reliably scopes access to the two
-- people in the couple.
drop policy if exists "pet_needs couple access" on public.pet_needs;
create policy "pet_needs couple access"
  on public.pet_needs
  for all
  to authenticated
  using (couple_key like '%' || auth.uid()::text || '%')
  with check (couple_key like '%' || auth.uid()::text || '%');

grant select, insert, update, delete on public.pet_needs to authenticated;
