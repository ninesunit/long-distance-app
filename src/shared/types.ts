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
  state: 'roam' | 'drag' | 'fall' | 'idle';
  actorId: string;
}