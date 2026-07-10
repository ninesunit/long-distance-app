import { supabase } from './supabaseClient';

export async function getUnreadNoteCount(myId: string): Promise<number> {
  const { count } = await supabase
    .from('notes')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_id', myId)
    .is('seen_at', null);

  return count ?? 0;
}
