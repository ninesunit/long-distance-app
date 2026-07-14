import { supabase } from './supabaseClient';
import { getCoupleKey } from './coupleKey';

export interface PetNeeds {
  fullness: number; // 0..100 (100 = well fed, 0 = starving)
  happiness: number; // 0..100
  experience: number; // accumulates toward the next stage
  stage: number; // 1..MAX_STAGE
  updated_at: string; // ISO timestamp of the last checkpoint
}

export const NEEDS_MAX = 100;
export const HUNGRY_THRESHOLD = 30; // fullness below this = "hungry"

// Decay is expressed as "how many hours to empty from full". Tuned so the pet
// visibly wants attention roughly once a day without nagging a couple who
// aren't always at their desks. Feeding/petting easily out-paces decay.
const FULLNESS_HOURS_TO_EMPTY = 8; // gets hungry within a day
const HAPPINESS_HOURS_TO_EMPTY = 12;
const FULLNESS_DECAY_PER_HOUR = NEEDS_MAX / FULLNESS_HOURS_TO_EMPTY;
const HAPPINESS_DECAY_PER_HOUR = NEEDS_MAX / HAPPINESS_HOURS_TO_EMPTY;

// How much a single interaction restores. Feeding/petting does NOT grant XP —
// XP (levels) is earned only by playing the co-op mini-game together.
const FEED_FULLNESS_GAIN = 45;
const PET_HAPPINESS_GAIN = 30;

export const XP_PER_STAGE = 100;
export const MAX_STAGE = 5;

export type InteractionType = 'feed' | 'pet';

function clamp(v: number): number {
  return Math.max(0, Math.min(NEEDS_MAX, v));
}

export function stageFromXp(xp: number): number {
  return Math.min(MAX_STAGE, 1 + Math.floor(xp / XP_PER_STAGE));
}

// Visual "evolution": a subtle hue shift applied to the cat, synced across both
// screens because it's derived purely from the shared stage.
export function stageColorFilter(stage: number): string {
  if (stage <= 1) return 'none';
  const hue = (stage - 1) * 18;
  const sat = 1 + (stage - 1) * 0.15;
  return `hue-rotate(${hue}deg) saturate(${sat.toFixed(2)})`;
}

// Progress (0..1) toward the next stage, for a progress bar.
export function stageProgress(experience: number): number {
  if (stageFromXp(experience) >= MAX_STAGE) return 1;
  return (experience % XP_PER_STAGE) / XP_PER_STAGE;
}

// Apply elapsed-time decay to stored needs to get their CURRENT values.
export function decayNeeds(needs: PetNeeds, now: number = Date.now()): PetNeeds {
  const elapsedHours = Math.max(0, (now - new Date(needs.updated_at).getTime()) / 3_600_000);
  return {
    ...needs,
    fullness: clamp(needs.fullness - FULLNESS_DECAY_PER_HOUR * elapsedHours),
    happiness: clamp(needs.happiness - HAPPINESS_DECAY_PER_HOUR * elapsedHours),
  };
}

const DEFAULT_NEEDS = { fullness: NEEDS_MAX, happiness: NEEDS_MAX, experience: 0, stage: 1 };

export async function fetchNeeds(userId: string, partnerId: string): Promise<PetNeeds> {
  const coupleKey = getCoupleKey(userId, partnerId);
  const { data } = await supabase
    .from('pet_needs')
    .select('fullness, happiness, experience, stage, updated_at')
    .eq('couple_key', coupleKey)
    .maybeSingle();

  if (!data) {
    const updated_at = new Date().toISOString();
    await supabase
      .from('pet_needs')
      .upsert({ couple_key: coupleKey, ...DEFAULT_NEEDS, updated_at }, { onConflict: 'couple_key' });
    return { ...DEFAULT_NEEDS, updated_at };
  }

  return data as PetNeeds;
}

// Feed/pet on top of the current (decayed) needs, persist the checkpoint, and
// return the new stored needs so the caller can broadcast + display them.
export async function applyInteraction(
  userId: string,
  partnerId: string,
  type: InteractionType
): Promise<PetNeeds> {
  const coupleKey = getCoupleKey(userId, partnerId);
  const current = decayNeeds(await fetchNeeds(userId, partnerId));
  // No XP from feed/pet — experience is unchanged here.
  const next: PetNeeds = {
    fullness: clamp(current.fullness + (type === 'feed' ? FEED_FULLNESS_GAIN : 0)),
    happiness: clamp(current.happiness + (type === 'pet' ? PET_HAPPINESS_GAIN : 0)),
    experience: current.experience,
    stage: current.stage,
    updated_at: new Date().toISOString(),
  };

  await supabase.from('pet_needs').upsert({ couple_key: coupleKey, ...next }, { onConflict: 'couple_key' });
  return next;
}

// Reward from the co-op mini-game: boosts happiness + XP on top of current
// (decayed) needs, persists, and returns the new stored needs.
export async function applyHappinessBoost(
  userId: string,
  partnerId: string,
  happinessDelta: number,
  xpDelta: number
): Promise<PetNeeds> {
  const coupleKey = getCoupleKey(userId, partnerId);
  const current = decayNeeds(await fetchNeeds(userId, partnerId));
  const experience = current.experience + xpDelta;

  const next: PetNeeds = {
    fullness: current.fullness,
    happiness: clamp(current.happiness + happinessDelta),
    experience,
    stage: stageFromXp(experience),
    updated_at: new Date().toISOString(),
  };

  await supabase.from('pet_needs').upsert({ couple_key: coupleKey, ...next }, { onConflict: 'couple_key' });
  return next;
}
