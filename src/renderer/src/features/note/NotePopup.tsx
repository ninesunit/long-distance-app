import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../auth/useAuth';
import { useCoupleChannel } from '../realtime/useCoupleChannel';
import { supabase } from '../../lib/supabaseClient';

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

export default function NotePopup() {
  const { profile, loading } = useAuth();
  const [history, setHistory] = useState<NoteRow[]>([]);
  const [partnerName, setPartnerName] = useState('them');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const { sendNoteSent, sendNoteDeleted } = useCoupleChannel(profile?.id, profile?.partner_id ?? undefined, {
    onNoteSent: () => loadHistory(),
    onNoteDeleted: () => loadHistory(),
  });

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    const unsubscribe = window.api.onPopupShown(() => {
      loadHistory();
    });
    return unsubscribe;
  }, [loadHistory]);

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

  return (
    <div className="w-full h-full relative p-3 font-sans">
      <div className="drag-region absolute top-0 left-0 w-full h-5" />
      <div className="w-full h-full rounded-3xl overflow-hidden shadow-xl border border-white/50">
        <div className="w-full h-full bg-white/90 backdrop-blur-md flex flex-col gap-2 p-4 no-drag">
          <div className="flex items-center gap-1.5">
            <img src="./sprites/pixel_letter.gif" className="w-5 h-5 pixel-art" alt="notes" />
            <p className="text-xs font-semibold text-gray-600">Notes</p>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto flex flex-col gap-2 min-h-0">
            {history.length === 0 && <p className="text-xs text-gray-400 italic">No notes yet</p>}
            {history.map((note) => {
              const isMine = note.sender_id === profile.id;
              return (
                <div key={note.id} className="text-xs bg-cozy/70 rounded-2xl px-2.5 py-2 flex items-start gap-1">
                  <div className="flex-1">
                    <p className="text-gray-700">
                      {isMine ? 'You' : partnerName}: {note.content}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{formatTime(note.created_at)}</p>
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

          <form onSubmit={handleSend} className="flex flex-col gap-1">
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
              className="w-full rounded-xl px-2.5 py-1.5 text-xs bg-cozy outline-none"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={sending || !content.trim()}
              className="rounded-xl py-1.5 text-xs font-semibold bg-campfire text-white disabled:opacity-40"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}