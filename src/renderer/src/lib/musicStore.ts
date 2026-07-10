import { supabase } from './supabaseClient';
import { getCoupleKey } from './coupleKey';

export interface Song {
  id: string;
  title: string;
  file_url: string;
  uploaded_by: string;
  created_at: string;
}

export async function fetchSongs(userId: string, partnerId: string): Promise<Song[]> {
  const coupleKey = getCoupleKey(userId, partnerId);
  const { data } = await supabase
    .from('songs')
    .select('*')
    .eq('couple_key', coupleKey)
    .order('created_at', { ascending: false });
  return (data as Song[]) ?? [];
}

export async function uploadSong(
  userId: string,
  partnerId: string,
  file: File,
  title: string
): Promise<Song | null> {
  const coupleKey = getCoupleKey(userId, partnerId);
  const filePath = `${coupleKey}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage.from('songs').upload(filePath, file);
  if (uploadError) {
    console.error('Upload failed:', uploadError.message);
    return null;
  }

  const { data: urlData } = supabase.storage.from('songs').getPublicUrl(filePath);

  const { data, error } = await supabase
    .from('songs')
    .insert({
      couple_key: coupleKey,
      title: title || file.name.replace(/\.[^/.]+$/, ''),
      file_url: urlData.publicUrl,
      uploaded_by: userId,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to save song record:', error.message);
    return null;
  }

  return data as Song;
}

export async function deleteSong(songId: string): Promise<boolean> {
  const { error } = await supabase.from('songs').delete().eq('id', songId);
  if (error) {
    console.error('Failed to delete song:', error.message);
    return false;
  }
  return true;
}

export interface NowPlaying {
  song_id: string | null;
  is_playing: boolean;
  position_seconds: number;
}

export async function fetchNowPlaying(userId: string, partnerId: string): Promise<NowPlaying | null> {
  const coupleKey = getCoupleKey(userId, partnerId);
  const { data } = await supabase
    .from('now_playing')
    .select('song_id, is_playing, position_seconds')
    .eq('couple_key', coupleKey)
    .maybeSingle();
  return data as NowPlaying | null;
}

export async function setNowPlaying(
  userId: string,
  partnerId: string,
  state: Partial<NowPlaying>
): Promise<void> {
  const coupleKey = getCoupleKey(userId, partnerId);
  await supabase
    .from('now_playing')
    .upsert(
      { couple_key: coupleKey, ...state, updated_at: new Date().toISOString() },
      { onConflict: 'couple_key' }
    );
}
