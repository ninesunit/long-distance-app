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
}

export function useCoupleChannel(userId: string | undefined, partnerId: string | undefined, handlers: Handlers) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [connected, setConnected] = useState(false);

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!userId || !partnerId) {
      setConnected(false);
      return;
    }

    const channelName = getCoupleChannelName(userId, partnerId);
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false },
        private: true,
      },
    });

    channel
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
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
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

  return {
    connected,
    sendLampUpdate,
    sendPetInteraction,
    sendNoteSent,
    sendNoteDeleted,
    sendStatusChanged,
    sendMusicUpdate,
    sendPetPosition,
  };
}