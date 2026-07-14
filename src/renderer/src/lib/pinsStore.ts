import { supabase } from './supabaseClient';
import { getCoupleKey } from './coupleKey';

export interface Pin {
  id: string;
  couple_key: string;
  emoji: string;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  created_by: string;
  created_at: string;
}

export const STICKERS = ['💖', '🌸', '⭐', '🍀', '🌙', '☀️', '🎀', '🔥', '🐟', '🍰', '🫧', '🌈'];

export async function fetchPins(userId: string, partnerId: string): Promise<Pin[]> {
  const coupleKey = getCoupleKey(userId, partnerId);
  const { data } = await supabase
    .from('pins')
    .select('*')
    .eq('couple_key', coupleKey)
    .order('created_at', { ascending: true });
  return (data as Pin[]) ?? [];
}

export async function addPin(
  userId: string,
  partnerId: string,
  emoji: string,
  x: number,
  y: number
): Promise<Pin | null> {
  const coupleKey = getCoupleKey(userId, partnerId);
  const { data, error } = await supabase
    .from('pins')
    .insert({ couple_key: coupleKey, emoji, x, y, created_by: userId })
    .select()
    .single();
  if (error) {
    console.error('Failed to add pin:', error.message);
    return null;
  }
  return data as Pin;
}

export async function removePin(pinId: string): Promise<boolean> {
  const { error } = await supabase.from('pins').delete().eq('id', pinId);
  if (error) {
    console.error('Failed to remove pin:', error.message);
    return false;
  }
  return true;
}
