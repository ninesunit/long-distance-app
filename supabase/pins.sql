-- Shared "wall": cute stickers pinned to the couple's desktop.
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query → Run).
--
-- x / y are normalized (0..1 fractions of the screen) so a pin lands in the
-- same relative spot regardless of each partner's resolution.

create table if not exists public.pins (
  id         uuid        primary key default gen_random_uuid(),
  couple_key text        not null,
  emoji      text        not null,
  x          real        not null,
  y          real        not null,
  created_by uuid        not null,
  created_at timestamptz not null default now()
);

create index if not exists pins_couple_key_idx on public.pins (couple_key);

alter table public.pins enable row level security;

-- A member's own UUID always appears as a substring of couple_key ("uuidA-uuidB").
drop policy if exists "pins couple access" on public.pins;
create policy "pins couple access"
  on public.pins
  for all
  to authenticated
  using (couple_key like '%' || auth.uid()::text || '%')
  with check (couple_key like '%' || auth.uid()::text || '%');

grant select, insert, update, delete on public.pins to authenticated;
