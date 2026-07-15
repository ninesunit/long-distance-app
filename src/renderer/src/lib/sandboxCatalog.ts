import type { StatDeltas } from './needsStore';

// The desktop "sandbox": stickers the user drops from the Pet popup fall into
// the overlay and the cat pathfinds to interact with them. Behaviour is fully
// data-driven from this catalog (keyed by emoji) so the overlay stays generic.

export type SandboxCategory = 'consumable' | 'toy' | 'cozy' | 'chaos';

// The animation the cat plays on arrival. The overlay maps each to a sprite +
// CSS. Several are approximations of the spec using the existing sprite set.
export type CatAction = 'eat' | 'drink' | 'warm' | 'nest' | 'sniff' | 'swat' | 'hunt' | 'inspect';

export interface SandboxDef {
  emoji: string;
  icon?: string; // optional pixel-art button icon (falls back to the emoji)
  label: string;
  category: SandboxCategory;
  action: CatAction;
  deltas: StatDeltas; // applied each time the cat completes the interaction
  consume: boolean; // removed after the cat interacts once
  floats?: boolean; // rises instead of resting on the ground (butterfly)
  anchor?: boolean; // cat prefers to idle near this afterwards (campfire)
  residueEmoji?: string; // consumed item leaves this behind, then it fades (fishbone)
  shrinkOut?: boolean; // consumed item shrinks away instead of a hard cut (milk)
  zoomies?: boolean; // cat gets the zoomies right after (cupcake)
  swatsToBreak?: number; // toy: swats before it "breaks" and the cat loses interest (yarn)
  brokenEmoji?: string; // what a broken toy becomes (unravelled string)
  arriveMs?: number; // how long the arrival animation lasts before the effect resolves
  spammable?: boolean; // treats can be clicked repeatedly; everything else toggles
  trap?: boolean; // chaos: the cat locks into `catSprite` until the user clicks it
  catSprite?: string; // sprite the cat shows while reacting / trapped
  hint: string; // shown in the palette tooltip
}

export const SANDBOX: SandboxDef[] = [
  // 🍱 Consumables — vanish after the cat eats/drinks, affect core stats.
  {
    emoji: '🍣',
    label: 'Sushi',
    category: 'consumable',
    action: 'eat',
    deltas: { fullness: 20, happiness: 5 },
    consume: true,
    spammable: true,
    arriveMs: 3000,
    hint: 'Sushi — the cat sprints over and eats it (Hunger +20)',
  },
  {
    emoji: '🧁',
    label: 'Cupcake',
    category: 'consumable',
    action: 'eat',
    deltas: { energy: 30, happiness: 10 },
    consume: true,
    spammable: true,
    zoomies: true,
    arriveMs: 1600,
    hint: 'Cupcake — a sweet treat, then the zoomies! (Energy +30)',
  },
  {
    emoji: '🥛',
    label: 'Milk',
    category: 'consumable',
    action: 'drink',
    deltas: { thirst: 25 },
    consume: true,
    spammable: true,
    shrinkOut: true,
    arriveMs: 2600,
    hint: 'Milk — the cat laps it up (Thirst +25)',
  },

  // 🛋️ Cozy — persist, become idle anchors / resting spots.
  {
    emoji: '🔥',
    icon: './sprites/pixel_flame.gif',
    label: 'Campfire',
    category: 'cozy',
    action: 'warm',
    deltas: { happiness: 15 },
    consume: false,
    anchor: true,
    arriveMs: 2600,
    catSprite: './sprites/pixel_cat_warming.png',
    hint: 'Campfire — the cat curls up to warm its paws (Happiness +15)',
  },
  {
    emoji: '☁️',
    label: 'Pillow',
    category: 'cozy',
    action: 'nest',
    deltas: { energy: 100 },
    consume: false,
    arriveMs: 3000,
    hint: 'Pillow — the cat nests and sleeps deeply (Energy → full)',
  },
  {
    emoji: '🌻',
    label: 'Flower',
    category: 'cozy',
    action: 'sniff',
    deltas: { happiness: 5 },
    consume: false,
    arriveMs: 1800,
    hint: 'Flower — the cat sniffs it… and sneezes!',
  },

  // 🧸 Toys — persist and change state as the cat plays.
  {
    emoji: '🧶',
    label: 'Yarn',
    category: 'toy',
    action: 'swat',
    deltas: { happiness: 8 },
    consume: false,
    swatsToBreak: 3,
    brokenEmoji: '🧵',
    arriveMs: 900,
    hint: 'Yarn — the cat bats it around until it unravels (Happiness +8)',
  },

  // 🌪️ Playful chaos.
  {
    emoji: '🦋',
    label: 'Butterfly',
    category: 'toy',
    action: 'hunt',
    deltas: { happiness: 12 },
    consume: true,
    floats: true,
    arriveMs: 1500,
    hint: 'Butterfly — it drifts up; the cat stalks and leaps to catch it',
  },

  // 🌪️ Chaos — the cat gets "trapped" in a special pose until you click it.
  {
    emoji: '📦',
    icon: './sprites/pixel_box.png',
    label: 'Box',
    category: 'chaos',
    action: 'inspect',
    deltas: { happiness: 6 },
    consume: false,
    trap: true,
    arriveMs: 1000,
    catSprite: './sprites/pixel_catbox.png',
    hint: 'Box — the cat jumps in and hides. Click the cat to tip it out.',
  },
  {
    emoji: '🥒',
    label: 'Cucumber',
    category: 'chaos',
    action: 'inspect',
    deltas: {},
    consume: false,
    trap: true,
    arriveMs: 1000,
    catSprite: './sprites/pixel_cat_startled.png',
    hint: 'Cucumber — the cat spots it and freezes in fright. Click to calm it.',
  },
  {
    emoji: '💦',
    label: 'Splash',
    category: 'chaos',
    action: 'inspect',
    deltas: {},
    consume: false,
    trap: true,
    arriveMs: 1000,
    catSprite: './sprites/pixel_cat_wet.png',
    hint: 'Splash — a grumpy wet cat. Click it to help it dry off.',
  },
];

const BY_EMOJI: Record<string, SandboxDef> = Object.fromEntries(SANDBOX.map((d) => [d.emoji, d]));

export function sandboxDef(emoji: string): SandboxDef | undefined {
  return BY_EMOJI[emoji];
}
