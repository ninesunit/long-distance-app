import { supabase } from './supabaseClient';
import { getCoupleKey } from './coupleKey';

export interface PetNeeds {
  fullness: number; // 0..100 (100 = well fed, 0 = starving)
  happiness: number; // 0..100
  energy: number; // 0..100 (100 = wide awake, 0 = exhausted)
  thirst: number; // 0..100 (100 = hydrated, 0 = parched)
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
const ENERGY_HOURS_TO_EMPTY = 16;
const THIRST_HOURS_TO_EMPTY = 10;
const FULLNESS_DECAY_PER_HOUR = NEEDS_MAX / FULLNESS_HOURS_TO_EMPTY;
const HAPPINESS_DECAY_PER_HOUR = NEEDS_MAX / HAPPINESS_HOURS_TO_EMPTY;
const ENERGY_DECAY_PER_HOUR = NEEDS_MAX / ENERGY_HOURS_TO_EMPTY;
const THIRST_DECAY_PER_HOUR = NEEDS_MAX / THIRST_HOURS_TO_EMPTY;

// How much a single interaction restores. Feeding/petting does NOT grant XP —
// XP (levels) is earned only by playing the co-op mini-game together.
const FEED_FULLNESS_GAIN = 45;
const PET_HAPPINESS_GAIN = 30;

export const XP_PER_STAGE = 100;
export const MAX_STAGE = 5;

export type InteractionType = 'feed' | 'pet';

// Deltas a sandbox interaction can apply to the pet's stats. Everything is
// optional so each sticker only touches the stats it cares about.
export interface StatDeltas {
  fullness?: number;
  happiness?: number;
  energy?: number;
  thirst?: number;
  xp?: number;
}

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
    energy: clamp(needs.energy - ENERGY_DECAY_PER_HOUR * elapsedHours),
    thirst: clamp(needs.thirst - THIRST_DECAY_PER_HOUR * elapsedHours),
  };
}

const DEFAULT_NEEDS = {
  fullness: NEEDS_MAX,
  happiness: NEEDS_MAX,
  energy: NEEDS_MAX,
  thirst: NEEDS_MAX,
  experience: 0,
  stage: 1,
};

export async function fetchNeeds(userId: string, partnerId: string): Promise<PetNeeds> {
  const coupleKey = getCoupleKey(userId, partnerId);
  const { data } = await supabase
    .from('pet_needs')
    .select('fullness, happiness, energy, thirst, experience, stage, updated_at')
    .eq('couple_key', coupleKey)
    .maybeSingle();

  if (!data) {
    const updated_at = new Date().toISOString();
    await supabase
      .from('pet_needs')
      .upsert({ couple_key: coupleKey, ...DEFAULT_NEEDS, updated_at }, { onConflict: 'couple_key' });
    return { ...DEFAULT_NEEDS, updated_at };
  }

  // Backfill in case the migration hasn't run yet / older rows lack the columns.
  return {
    fullness: data.fullness ?? NEEDS_MAX,
    happiness: data.happiness ?? NEEDS_MAX,
    energy: data.energy ?? NEEDS_MAX,
    thirst: data.thirst ?? NEEDS_MAX,
    experience: data.experience ?? 0,
    stage: data.stage ?? 1,
    updated_at: data.updated_at,
  };
}

// Apply arbitrary stat deltas on top of the current (decayed) needs, persist the
// checkpoint, and return the new stored needs so the caller can broadcast + show
// them. This is the single write path for every sandbox interaction.
export async function applyStatDeltas(
  userId: string,
  partnerId: string,
  deltas: StatDeltas
): Promise<PetNeeds> {
  const coupleKey = getCoupleKey(userId, partnerId);
  const current = decayNeeds(await fetchNeeds(userId, partnerId));
  const experience = current.experience + (deltas.xp ?? 0);

  const next: PetNeeds = {
    fullness: clamp(current.fullness + (deltas.fullness ?? 0)),
    happiness: clamp(current.happiness + (deltas.happiness ?? 0)),
    energy: clamp(current.energy + (deltas.energy ?? 0)),
    thirst: clamp(current.thirst + (deltas.thirst ?? 0)),
    experience,
    stage: stageFromXp(experience),
    updated_at: new Date().toISOString(),
  };

  await supabase.from('pet_needs').upsert({ couple_key: coupleKey, ...next }, { onConflict: 'couple_key' });
  return next;
}

// Convenience wrappers kept for the existing feed/pet buttons.
export async function applyInteraction(
  userId: string,
  partnerId: string,
  type: InteractionType
): Promise<PetNeeds> {
  return applyStatDeltas(userId, partnerId, {
    fullness: type === 'feed' ? FEED_FULLNESS_GAIN : 0,
    happiness: type === 'pet' ? PET_HAPPINESS_GAIN : 0,
  });
}

// Reward from the co-op mini-game: boosts happiness + XP.
export async function applyHappinessBoost(
  userId: string,
  partnerId: string,
  happinessDelta: number,
  xpDelta: number
): Promise<PetNeeds> {
  return applyStatDeltas(userId, partnerId, { happiness: happinessDelta, xp: xpDelta });
}
