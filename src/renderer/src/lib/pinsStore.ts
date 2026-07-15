import { supabase } from './supabaseClient';
import { getCoupleKey } from './coupleKey';
import type { SandboxCategory } from './sandboxCatalog';

// A pin's kind mirrors its sandbox category ('consumable' | 'toy' | 'cozy' |
// 'chaos'). Detailed behaviour is looked up per-emoji in the sandbox catalog.
export type PinKind = SandboxCategory;

export interface Pin {
  id: string;
  couple_key: string;
  emoji: string;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  kind: PinKind;
  permanent: boolean;
  created_by: string;
  created_at: string;
}

// Ephemeral stickers live for a few hours, then fade out over the final stretch
// before they're cleaned up. "Super Pinned" (permanent) stickers never fade.
export const PIN_LIFETIME_MS = 3 * 60 * 60 * 1000; // 3 hours
const PIN_FADE_START_MS = PIN_LIFETIME_MS - 30 * 60 * 1000; // last 30 min fades

export function pinAgeMs(pin: Pin, now: number = Date.now()): number {
  return now - new Date(pin.created_at).getTime();
}

export function isPinExpired(pin: Pin, now: number = Date.now()): boolean {
  return !pin.permanent && pinAgeMs(pin, now) >= PIN_LIFETIME_MS;
}

// Render opacity: full while young, easing to 0 over the final fade window.
export function pinOpacity(pin: Pin, now: number = Date.now()): number {
  if (pin.permanent) return 1;
  const age = pinAgeMs(pin, now);
  if (age <= PIN_FADE_START_MS) return 1;
  if (age >= PIN_LIFETIME_MS) return 0;
  return 1 - (age - PIN_FADE_START_MS) / (PIN_LIFETIME_MS - PIN_FADE_START_MS);
}

export async function fetchPins(userId: string, partnerId: string): Promise<Pin[]> {
  const coupleKey = getCoupleKey(userId, partnerId);
  const { data } = await supabase
    .from('pins')
    .select('*')
    .eq('couple_key', coupleKey)
    .order('created_at', { ascending: true });

  const pins = (data as Pin[]) ?? [];

  // Lazily prune stickers that have outlived their lifetime so the wall stays
  // tidy without a cron job. Fire-and-forget; the local filter is what matters.
  const now = Date.now();
  const expired = pins.filter((p) => isPinExpired(p, now));
  if (expired.length > 0) {
    supabase
      .from('pins')
      .delete()
      .in('id', expired.map((p) => p.id))
      .then(() => {});
  }

  return pins.filter((p) => !isPinExpired(p, now));
}

export async function addPin(
  userId: string,
  partnerId: string,
  emoji: string,
  x: number,
  y: number,
  kind: PinKind = 'chaos'
): Promise<Pin | null> {
  const coupleKey = getCoupleKey(userId, partnerId);
  const { data, error } = await supabase
    .from('pins')
    .insert({ couple_key: coupleKey, emoji, x, y, kind, created_by: userId })
    .select()
    .single();
  if (error) {
    console.error('Failed to add pin:', error.message);
    return null;
  }
  return data as Pin;
}

// Patch a pin in place (e.g. a toy changing sprite, or rolling to a new spot).
export async function updatePin(
  pinId: string,
  patch: Partial<Pick<Pin, 'emoji' | 'x' | 'y' | 'kind'>>
): Promise<boolean> {
  const { error } = await supabase.from('pins').update(patch).eq('id', pinId);
  if (error) {
    console.error('Failed to update pin:', error.message);
    return false;
  }
  return true;
}

export async function setPinPermanent(pinId: string, permanent: boolean): Promise<boolean> {
  const { error } = await supabase.from('pins').update({ permanent }).eq('id', pinId);
  if (error) {
    console.error('Failed to update pin:', error.message);
    return false;
  }
  return true;
}

export async function removePin(pinId: string): Promise<boolean> {
  const { error } = await supabase.from('pins').delete().eq('id', pinId);
  if (error) {
    console.error('Failed to remove pin:', error.message);
    return false;
  }
  return true;
}

// Remove every sticker of a given emoji (used to toggle a toy/cozy sticker off).
export async function removePinsByEmoji(userId: string, partnerId: string, emoji: string): Promise<boolean> {
  const coupleKey = getCoupleKey(userId, partnerId);
  const { error } = await supabase.from('pins').delete().eq('couple_key', coupleKey).eq('emoji', emoji);
  if (error) {
    console.error('Failed to remove pins:', error.message);
    return false;
  }
  return true;
}

// Wipe the whole sandbox for this couple ("Clear all").
export async function clearPins(userId: string, partnerId: string): Promise<boolean> {
  const coupleKey = getCoupleKey(userId, partnerId);
  const { error } = await supabase.from('pins').delete().eq('couple_key', coupleKey);
  if (error) {
    console.error('Failed to clear pins:', error.message);
    return false;
  }
  return true;
}
