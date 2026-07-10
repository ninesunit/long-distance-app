import { supabase } from './supabaseClient';
import { getCoupleKey } from './coupleKey';

export type PetGender = 'male' | 'female';

interface PetData {
  pet_name: string;
  pet_gender: PetGender;
}

export async function fetchPetData(userId: string, partnerId: string): Promise<PetData> {
  const coupleKey = getCoupleKey(userId, partnerId);
  const { data } = await supabase
    .from('pets')
    .select('pet_name, pet_gender')
    .eq('couple_key', coupleKey)
    .maybeSingle();

  return {
    pet_name: data?.pet_name ?? 'Kitty',
    pet_gender: (data?.pet_gender as PetGender) ?? 'male',
  };
}

// Kept for backward compatibility with any existing callers
export async function fetchPetName(userId: string, partnerId: string): Promise<string> {
  const data = await fetchPetData(userId, partnerId);
  return data.pet_name;
}

export async function setPetName(userId: string, partnerId: string, name: string): Promise<void> {
  const coupleKey = getCoupleKey(userId, partnerId);
  await supabase
    .from('pets')
    .upsert({ couple_key: coupleKey, pet_name: name, updated_at: new Date().toISOString() }, { onConflict: 'couple_key' });
  window.api.notifyAuthChanged();
}

export async function setPetGender(userId: string, partnerId: string, gender: PetGender): Promise<void> {
  const coupleKey = getCoupleKey(userId, partnerId);
  await supabase
    .from('pets')
    .upsert({ couple_key: coupleKey, pet_gender: gender, updated_at: new Date().toISOString() }, { onConflict: 'couple_key' });
  window.api.notifyAuthChanged();
}