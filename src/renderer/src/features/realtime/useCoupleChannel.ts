import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  LampBroadcastPayload,
  PetBroadcastPayload,
  NoteBroadcastPayload,
  StatusBroadcastPayload,
  MusicBroadcastPayload,
  NoteDeletedPayload,
  PetPositionPayload,
  NeedsBroadcastPayload,
  PetReactionPayload,
  GameSignal,
} from '../../../../shared/types';

function getCoupleChannelName(userId: string, partnerId: string): string {
  const [a, b] = [userId, partnerId].sort();
  return `couple-room-${a}-${b}`;
}

interface Handlers {
  onLampUpdate?: (payload: LampBroadcastPayload) => void;
  onPetInteraction?: (payload: PetBroadcastPayload) => void;
  onNoteSent?: (payload: NoteBroadcastPayload) => void;
  onNoteDeleted?: (payload: NoteDeletedPayload) => void;
  onStatusChanged?: (payload: StatusBroadcastPayload) => void;
  onMusicUpdate?: (payload: MusicBroadcastPayload) => void;
  onPetPosition?: (payload: PetPositionPayload) => void;
  onNeedsUpdate?: (payload: NeedsBroadcastPayload) => void;
  onPetReaction?: (payload: PetReactionPayload) => void;
  onGameSignal?: (payload: GameSignal) => void;
  onPartnerOnline?: () => void;
  onPinsChanged?: () => void;
  onMusicLibraryChanged?: () => void;
}

export function useCoupleChannel(
  userId: string | undefined,
  partnerId: string | undefined,
  handlers: Handlers,
  options?: { trackPresence?: boolean }
) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [connected, setConnected] = useState(false);
  // Whether the partner is currently online (only meaningful when trackPresence
  // is enabled). Lets features fall back to solo behaviour when alone.
  const [partnerPresent, setPartnerPresent] = useState(false);

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!userId || !partnerId) {
      setConnected(false);
      setPartnerPresent(false);
      return;
    }

    const channelName = getCoupleChannelName(userId, partnerId);
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false },
        private: true,
        // Only enable presence on the window that actually tracks it (the pet
        // overlay). Enabling it everywhere put presence on every popup channel
        // (and the double-subscribed LampGlow), which needs presence RLS to
        // succeed and can otherwise error the channel.
        ...(options?.trackPresence ? { presence: { key: userId } } : {}),
      },
    });

    // Grace window so the initial presence sync (partner already online) doesn't
    // fire a "welcome home" on our own launch — only genuine later joins do.
    let presenceReady = false;
    const graceTimer = setTimeout(() => {
      presenceReady = true;
    }, 4000);

    const syncPartnerPresence = () => {
      const state = channel.presenceState();
      setPartnerPresent(Object.keys(state).includes(partnerId));
    };

    channel
      .on('presence', { event: 'sync' }, syncPartnerPresence)
      .on('presence', { event: 'join' }, ({ key }) => {
        if (key === partnerId) setPartnerPresent(true);
        if (presenceReady && key === partnerId) handlersRef.current.onPartnerOnline?.();
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (key === partnerId) setPartnerPresent(false);
      })
      .on('broadcast', { event: 'lamp_update' }, ({ payload }) => {
        handlersRef.current.onLampUpdate?.(payload as LampBroadcastPayload);
      })
      .on('broadcast', { event: 'pet_interaction' }, ({ payload }) => {
        handlersRef.current.onPetInteraction?.(payload as PetBroadcastPayload);
      })
      .on('broadcast', { event: 'note_sent' }, ({ payload }) => {
        handlersRef.current.onNoteSent?.(payload as NoteBroadcastPayload);
      })
      .on('broadcast', { event: 'note_deleted' }, ({ payload }) => {
        handlersRef.current.onNoteDeleted?.(payload as NoteDeletedPayload);
      })
      .on('broadcast', { event: 'status_changed' }, ({ payload }) => {
        handlersRef.current.onStatusChanged?.(payload as StatusBroadcastPayload);
      })
      .on('broadcast', { event: 'music_update' }, ({ payload }) => {
        handlersRef.current.onMusicUpdate?.(payload as MusicBroadcastPayload);
      })
      .on('broadcast', { event: 'pet_position' }, ({ payload }) => {
        handlersRef.current.onPetPosition?.(payload as PetPositionPayload);
      })
      .on('broadcast', { event: 'needs_update' }, ({ payload }) => {
        handlersRef.current.onNeedsUpdate?.(payload as NeedsBroadcastPayload);
      })
      .on('broadcast', { event: 'pet_reaction' }, ({ payload }) => {
        handlersRef.current.onPetReaction?.(payload as PetReactionPayload);
      })
      .on('broadcast', { event: 'game_signal' }, ({ payload }) => {
        handlersRef.current.onGameSignal?.(payload as GameSignal);
      })
      .on('broadcast', { event: 'pins_changed' }, () => {
        handlersRef.current.onPinsChanged?.();
      })
      .on('broadcast', { event: 'music_library' }, () => {
        handlersRef.current.onMusicLibraryChanged?.();
      })
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED' && options?.trackPresence) {
          channel.track({ userId, at: Date.now() });
        }
      });

    channelRef.current = channel;

    return () => {
      clearTimeout(graceTimer);
      supabase.removeChannel(channel);
      channelRef.current = null;
      setPartnerPresent(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, partnerId]);

  const sendLampUpdate = useCallback((payload: LampBroadcastPayload) => {
    channelRef.current?.send({ type: 'broadcast', event: 'lamp_update', payload });
  }, []);

  const sendPetInteraction = useCallback((payload: PetBroadcastPayload) => {
    channelRef.current?.send({ type: 'broadcast', event: 'pet_interaction', payload });
  }, []);

  const sendNoteSent = useCallback((payload: NoteBroadcastPayload) => {
    channelRef.current?.send({ type: 'broadcast', event: 'note_sent', payload });
  }, []);

  const sendNoteDeleted = useCallback((payload: NoteDeletedPayload) => {
    channelRef.current?.send({ type: 'broadcast', event: 'note_deleted', payload });
  }, []);

  const sendStatusChanged = useCallback((payload: StatusBroadcastPayload) => {
    channelRef.current?.send({ type: 'broadcast', event: 'status_changed', payload });
  }, []);

  const sendMusicUpdate = useCallback((payload: MusicBroadcastPayload) => {
    channelRef.current?.send({ type: 'broadcast', event: 'music_update', payload });
  }, []);

  const sendPetPosition = useCallback((payload: PetPositionPayload) => {
    channelRef.current?.send({ type: 'broadcast', event: 'pet_position', payload });
  }, []);

  const sendNeedsUpdate = useCallback((payload: NeedsBroadcastPayload) => {
    channelRef.current?.send({ type: 'broadcast', event: 'needs_update', payload });
  }, []);

  const sendPetReaction = useCallback((payload: PetReactionPayload) => {
    channelRef.current?.send({ type: 'broadcast', event: 'pet_reaction', payload });
  }, []);

  const sendGameSignal = useCallback((payload: GameSignal) => {
    channelRef.current?.send({ type: 'broadcast', event: 'game_signal', payload });
  }, []);

  const sendPinsChanged = useCallback(() => {
    channelRef.current?.send({ type: 'broadcast', event: 'pins_changed', payload: {} });
  }, []);

  const sendMusicLibraryChanged = useCallback(() => {
    channelRef.current?.send({ type: 'broadcast', event: 'music_library', payload: {} });
  }, []);

  return {
    connected,
    partnerPresent,
    sendLampUpdate,
    sendPetInteraction,
    sendNoteSent,
    sendNoteDeleted,
    sendStatusChanged,
    sendMusicUpdate,
    sendPetPosition,
    sendNeedsUpdate,
    sendPetReaction,
    sendGameSignal,
    sendPinsChanged,
    sendMusicLibraryChanged,
  };
}