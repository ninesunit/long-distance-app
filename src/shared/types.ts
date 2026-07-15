export type StatusValue = 'busy' | 'free' | 'missing_you';
export type BroadcastEventType = 'lamp_update' | 'pet_interaction' | 'note_sent' | 'status_changed';

export interface ToastPayload {
  id: string;
  type: 'note' | 'pet' | 'status';
  title: string;
  message?: string;
  emoji?: string;
}

export interface LampEvent {
  intensity: number; // 0 - 1
  holderId: string;
}

export interface PetEvent {
  interactionType: 'feed' | 'pet';
  actorId: string;
}

export interface Profile {
  id: string;
  display_name: string;
  partner_id: string | null;
  pairing_code: string;
  created_at: string;
}

export interface PairResult {
  success: boolean;
  error?: string;
  partner_name?: string;
}

export interface LampBroadcastPayload {
  intensity: number; // 0 - 1
  holderId: string;
}

export interface PetBroadcastPayload {
  interactionType: 'feed' | 'pet';
  actorId: string;
  actorName: string;
}

export interface NoteBroadcastPayload {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
}

export interface StatusBroadcastPayload {
  status: StatusValue;
  userId: string;
}

export interface MusicBroadcastPayload {
  songId: string | null;
  isPlaying: boolean;
  positionSeconds: number;
  actorId: string;
}

export interface NoteDeletedPayload {
  noteId: string;
}

export interface PetPositionPayload {
  x: number;
  y: number;
  facingLeft: boolean;
  state: 'roam' | 'run' | 'jump' | 'drag' | 'fall' | 'fling' | 'idle';
  actorId: string;
}

// A sandbox reaction the cat plays (eat / warm / trap / …). Broadcast by the
// authority so BOTH partners see the same sprite change + hear the same SFX,
// not just the client that happens to drive the cat.
export interface PetReactionPayload {
  action: string; // CatAction ('eat' | 'warm' | 'inspect' | …)
  sprite: string | null; // sprite override to show
  trap: boolean; // true = lock into the pose until the sticker is removed
  pinId: string | null; // the trapping sticker (for traps)
  arriveMs: number; // how long a non-trap reaction lasts
  bubble: string; // status bubble text ("Kitty ate the 🍣")
  emoji: string; // the sticker emoji (for SFX)
  actorId: string;
}

export interface NeedsBroadcastPayload {
  fullness: number;
  happiness: number;
  energy: number;
  thirst: number;
  experience: number;
  stage: number;
  updatedAt: string;
  actorId: string;
}

// "Treat Catch" mini-game. In both Solo and Versus each player runs their own
// board locally, so the only thing that crosses the wire is match control +
// live scores. Discriminated on `kind`.
export type GameSignal =
  | { kind: 'versus_ready'; actorId: string } // in the versus lobby, heartbeat
  | { kind: 'versus_go'; startAt: number; roundSeconds: number; hostId: string }
  | { kind: 'score'; score: number; finished: boolean; actorId: string }
  | { kind: 'cancel'; actorId: string };