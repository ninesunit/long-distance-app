import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../auth/useAuth';
import { useCoupleChannel } from '../realtime/useCoupleChannel';
import { supabase } from '../../lib/supabaseClient';
import { fetchPins, addPin, removePin, STICKERS, type Pin } from '../../lib/pinsStore';
import { LampGlowLayer } from '../../components/LampGlow';

interface NoteRow {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  seen_at: string | null;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Short relative time ("just now", "5m", "2h", "3d") for a cozier feel.
function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatTime(iso);
}

export default function NotePopup() {
  const { profile, loading } = useAuth();
  const [history, setHistory] = useState<NoteRow[]>([]);
  const [partnerName, setPartnerName] = useState('them');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [lampGlow, setLampGlow] = useState(0);
  const lampIntensitiesRef = useRef<Record<string, number>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadPins = useCallback(() => {
    if (!profile?.partner_id) return;
    fetchPins(profile.id, profile.partner_id).then(setPins);
  }, [profile]);

  const loadHistory = useCallback(async () => {
    if (!profile?.partner_id) return;

    const partnerId = profile.partner_id;

    const { data, error: fetchError } = await supabase
      .from('notes')
      .select('id, sender_id, content, created_at, seen_at')
      .or(
        `and(sender_id.eq.${profile.id},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${profile.id})`
      )
      .order('created_at', { ascending: false })
      .limit(30);

    if (fetchError) {
      console.error('Failed to load notes:', fetchError.message);
      return;
    }

    if (data) {
      const chronological = [...data].reverse();
      setHistory(chronological as NoteRow[]);

      const unseenToMe = data.filter((n) => n.sender_id !== profile.id && !n.seen_at);
      if (unseenToMe.length > 0) {
        await supabase
          .from('notes')
          .update({ seen_at: new Date().toISOString() })
          .in('id', unseenToMe.map((n) => n.id));
      }

      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [profile]);

  const { sendNoteSent, sendNoteDeleted, sendPinsChanged } = useCoupleChannel(
    profile?.id,
    profile?.partner_id ?? undefined,
    {
      onNoteSent: () => loadHistory(),
      onNoteDeleted: () => loadHistory(),
      onPinsChanged: () => loadPins(),
      onLampUpdate: (p) => {
        lampIntensitiesRef.current[p.holderId] = p.intensity;
        setLampGlow(Math.max(0, ...Object.values(lampIntensitiesRef.current)));
      },
    }
  );

  useEffect(() => {
    loadHistory();
    loadPins();
  }, [loadHistory, loadPins]);

  useEffect(() => {
    const unsubscribe = window.api.onPopupShown(() => {
      loadHistory();
      loadPins();
    });
    return unsubscribe;
  }, [loadHistory, loadPins]);

  useEffect(() => {
    if (!profile?.partner_id) return;
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', profile.partner_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPartnerName(data.display_name);
      });
  }, [profile]);

  if (loading || !profile || !profile.partner_id) return <div className="w-full h-full" />;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;

    setSending(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from('notes')
      .insert({ sender_id: profile.id, recipient_id: profile.partner_id, content: trimmed })
      .select()
      .single();

    setSending(false);

    if (insertError || !data) {
      setError(insertError?.message ?? 'Failed to send');
      return;
    }

    sendNoteSent({ id: data.id, content: trimmed, senderId: profile.id, senderName: profile.display_name });
    setContent('');
    loadHistory();
  };

  const handleDeleteNote = async (noteId: string) => {
    await supabase.from('notes').delete().eq('id', noteId);
    setHistory((prev) => prev.filter((n) => n.id !== noteId));
    sendNoteDeleted({ noteId });
  };

  const handleAddPin = async (emoji: string) => {
    if (!profile.partner_id) return;
    // Drop into the cozy lower band of the screen so pins hang out near the cat.
    const x = 0.08 + Math.random() * 0.84;
    const y = 0.72 + Math.random() * 0.18;
    const pin = await addPin(profile.id, profile.partner_id, emoji, x, y);
    if (pin) {
      setPins((prev) => [...prev, pin]);
      sendPinsChanged();
    }
  };

  const handleRemovePin = async (pinId: string) => {
    const ok = await removePin(pinId);
    if (ok) {
      setPins((prev) => prev.filter((p) => p.id !== pinId));
      sendPinsChanged();
    }
  };

  return (
    <div className="w-full h-full relative p-3 font-sans">
      <div className="drag-region absolute top-0 left-0 w-full h-5" />
      <div className="pixel-window relative w-full h-full flex flex-col gap-2 p-4 no-drag">
        <LampGlowLayer intensity={lampGlow} />
        <div className="flex items-center gap-1.5">
          <img src="./sprites/pixel_letter.gif" className="w-5 h-5 pixel-art" alt="notes" />
          <p className="font-pixel text-[10px] text-ink">Notes</p>
        </div>

        {/* Shared wall — pin cute stickers onto your partner's desktop */}
        <div className="pixel-panel p-1.5 flex flex-col gap-1">
          <p className="font-pixel text-[8px] text-ink-soft">📌 Pin a sticker to your desktop</p>
          <div className="flex flex-wrap gap-0.5">
            {STICKERS.map((s) => (
              <button
                key={s}
                onClick={() => handleAddPin(s)}
                className="text-sm leading-none w-5 h-5 flex items-center justify-center hover:scale-125 transition"
                title="Pin this"
              >
                {s}
              </button>
            ))}
          </div>
          {pins.length > 0 && (
            <div className="flex flex-wrap gap-0.5 border-t border-ink/15 pt-1">
              {pins.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleRemovePin(p.id)}
                  className="text-sm leading-none w-5 h-5 flex items-center justify-center hover:opacity-40 transition"
                  title="Remove pin"
                >
                  {p.emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto flex flex-col gap-2 min-h-0 pr-1">
          {history.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-1 text-center py-4">
              <span className="text-2xl opacity-60">💌</span>
              <p className="text-xs text-ink-soft italic">No notes yet — leave {partnerName} a little message</p>
            </div>
          )}
          {history.map((note) => {
            const isMine = note.sender_id === profile.id;
            const isNew = !isMine && !note.seen_at; // unseen note from partner
            return (
              <div
                key={note.id}
                className={`pixel-panel text-xs px-2.5 py-2 flex items-start gap-1 ${
                  isNew ? 'border-campfire bg-blush/50' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-ink break-words">
                    <span className="font-pixel text-[9px] text-campfire-dark">{isMine ? 'You' : partnerName}:</span>{' '}
                    {note.content}
                  </p>
                  <p className="text-[10px] text-ink-soft mt-0.5" title={formatTime(note.created_at)}>
                    {isNew && <span className="text-campfire font-pixel">● new · </span>}
                    {formatRelative(note.created_at)}
                  </p>
                </div>
                {isMine && (
                  <button
                    onClick={() => handleDeleteNote(note.id)}
                    className="text-red-400 hover:text-red-600 text-[10px] flex-shrink-0 cursor-pointer"
                    title="Delete"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <form onSubmit={handleSend} className="flex flex-col gap-1.5">
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSend(e as unknown as React.FormEvent);
              }
            }}
            placeholder="Leave a note..."
            maxLength={280}
            className="pixel-input w-full px-2.5 py-1.5 text-xs"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={sending || !content.trim()} className="pixel-btn pixel-btn--primary py-1.5 text-[11px]">
            {sending ? 'Sending...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
}