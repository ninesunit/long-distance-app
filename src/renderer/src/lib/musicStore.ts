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

  // Storage keys must be ASCII-safe — strip/replace anything that isn't a
  // safe filename character, but keep the file extension intact. The
  // display TITLE (below) can still contain any characters since that's
  // just stored as text in the database, not used as a file path.
  const extMatch = file.name.match(/\.[^.]+$/);
  const ext = extMatch ? extMatch[0] : '.mp3';
  const safeName = `${Date.now()}${ext}`;

  const filePath = `${coupleKey}/${safeName}`;

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

export function parseYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com|youtu\.be)/.test(url);
}

// Add a YouTube link as a "song" row (no storage upload; file_url IS the link).
export async function addYoutubeSong(
  userId: string,
  partnerId: string,
  url: string,
  title: string
): Promise<Song | null> {
  const coupleKey = getCoupleKey(userId, partnerId);
  const { data, error } = await supabase
    .from('songs')
    .insert({ couple_key: coupleKey, title: title || 'YouTube', file_url: url, uploaded_by: userId })
    .select()
    .single();
  if (error) {
    console.error('Failed to add YouTube song:', error.message);
    return null;
  }
  return data as Song;
}

export async function deleteSong(songId: string): Promise<boolean> {
  const { data: song, error: fetchError } = await supabase
    .from('songs')
    .select('file_url')
    .eq('id', songId)
    .maybeSingle();

  if (fetchError) {
    console.error('Failed to fetch song before delete:', fetchError.message);
  }

  const { error } = await supabase.from('songs').delete().eq('id', songId);
  if (error) {
    console.error('Failed to delete song:', error.message);
    return false;
  }

  if (song?.file_url) {
    const marker = '/storage/v1/object/public/songs/';
    const idx = song.file_url.indexOf(marker);
    if (idx !== -1) {
      const storagePath = song.file_url.slice(idx + marker.length);
      const { error: removeError } = await supabase.storage.from('songs').remove([storagePath]);
      if (removeError) {
        console.error('Failed to remove storage file:', removeError.message);
      }
    }
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