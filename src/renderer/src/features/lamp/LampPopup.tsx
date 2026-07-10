import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../auth/useAuth';
import { useCoupleChannel } from '../realtime/useCoupleChannel';
import { fetchSongs, uploadSong, deleteSong, fetchNowPlaying, setNowPlaying, type Song } from '../../lib/musicStore';
import type { MusicBroadcastPayload } from '../../../../shared/types';

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function LampPopup() {
  const { profile, loading } = useAuth();

  const [partnerIntensity, setPartnerIntensity] = useState(0);
  const [myIntensity, setMyIntensity] = useState(0);
  const [ignited, setIgnited] = useState(false);
  const rafRef = useRef<number | null>(null);
  const holdingRef = useRef(false);

  const [songs, setSongs] = useState<Song[]>([]);
  const [currentSongId, setCurrentSongId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadTitleInput, setUploadTitleInput] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const marqueeContainerRef = useRef<HTMLDivElement>(null);
  const marqueeTextRef = useRef<HTMLParagraphElement>(null);
  const [marqueeX, setMarqueeX] = useState(0);
  const marqueeRafRef = useRef<number | null>(null);

  const { sendLampUpdate, sendMusicUpdate } = useCoupleChannel(profile?.id, profile?.partner_id ?? undefined, {
    onLampUpdate: (payload) => setPartnerIntensity(payload.intensity),
    onMusicUpdate: (payload: MusicBroadcastPayload) => {
      if (payload.actorId === profile?.id) return;
      setCurrentSongId(payload.songId);
      setIsPlaying(payload.isPlaying);
      if (audioRef.current && Math.abs(audioRef.current.currentTime - payload.positionSeconds) > 2) {
        audioRef.current.currentTime = payload.positionSeconds;
      }
    },
  });

  useEffect(() => {
    if (!profile?.partner_id) return;
    fetchSongs(profile.id, profile.partner_id).then(setSongs);
    fetchNowPlaying(profile.id, profile.partner_id).then((np) => {
      if (np) {
        setCurrentSongId(np.song_id);
        setIsPlaying(np.is_playing);
      }
    });
  }, [profile]);

  useEffect(() => {
    const unsubscribe = window.api.onPopupShown(() => {
      if (!profile?.partner_id) return;
      fetchSongs(profile.id, profile.partner_id).then(setSongs);
    });
    return unsubscribe;
  }, [profile]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, currentSongId]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (!seeking) setCurrentTime(audio.currentTime);
    };
    const handleLoadedMetadata = () => setDuration(audio.duration);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [currentSongId, seeking]);

  // currentSong must be computed BEFORE the marquee effect below references it
  const currentSong = songs.find((s) => s.id === currentSongId) ?? null;

  useEffect(() => {
    if (marqueeRafRef.current) cancelAnimationFrame(marqueeRafRef.current);

    if (!currentSong || !marqueeContainerRef.current || !marqueeTextRef.current) {
      setMarqueeX(0);
      return;
    }

    const containerWidth = marqueeContainerRef.current.offsetWidth;
    const textWidth = marqueeTextRef.current.scrollWidth;

    if (textWidth <= containerWidth) {
      setMarqueeX((containerWidth - textWidth) / 2);
      return;
    }

    const startX = containerWidth;
    const endX = -textWidth;
    const totalDistance = startX - endX;
    const speed = 40; // px per second
    const durationMs = (totalDistance / speed) * 1000;

    let start: number | null = null;
    const step = (timestamp: number) => {
      if (start === null) start = timestamp;
      const elapsed = timestamp - start;
      const progress = (elapsed % durationMs) / durationMs;
      setMarqueeX(startX - progress * totalDistance);
      marqueeRafRef.current = requestAnimationFrame(step);
    };
    marqueeRafRef.current = requestAnimationFrame(step);

    return () => {
      if (marqueeRafRef.current) cancelAnimationFrame(marqueeRafRef.current);
    };
  }, [currentSong]);

  const broadcastState = useCallback(
    (songId: string | null, playing: boolean, position?: number) => {
      if (!profile || !profile.partner_id) return;
      const pos = position ?? audioRef.current?.currentTime ?? 0;
      sendMusicUpdate({ songId, isPlaying: playing, positionSeconds: pos, actorId: profile.id });
      setNowPlaying(profile.id, profile.partner_id, {
        song_id: songId,
        is_playing: playing,
        position_seconds: pos,
      });
    },
    [profile, sendMusicUpdate]
  );

  const handleSelectSong = (songId: string) => {
    setCurrentSongId(songId);
    setIsPlaying(true);
    setCurrentTime(0);
    broadcastState(songId, true, 0);
  };

  const togglePlayPause = () => {
    const next = !isPlaying;
    setIsPlaying(next);
    broadcastState(currentSongId, next);
  };

  const skipSong = (direction: 1 | -1) => {
    if (songs.length === 0) return;
    const idx = songs.findIndex((s) => s.id === currentSongId);
    const nextIdx = (idx + direction + songs.length) % songs.length;
    const nextSong = songs[nextIdx];
    handleSelectSong(nextSong.id);
  };

  const handleSeekChange = (value: number) => {
    setSeeking(true);
    setCurrentTime(value);
  };

  const handleSeekCommit = (value: number) => {
    if (audioRef.current) audioRef.current.currentTime = value;
    setSeeking(false);
    broadcastState(currentSongId, isPlaying, value);
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setUploadTitleInput(file.name.replace(/\.[^/.]+$/, ''));
  };

  const confirmUpload = async () => {
    if (!pendingFile || !profile?.partner_id) return;
    setUploading(true);
    const song = await uploadSong(profile.id, profile.partner_id, pendingFile, uploadTitleInput.trim());
    setUploading(false);
    if (song) setSongs((prev) => [song, ...prev]);
    setPendingFile(null);
    setUploadTitleInput('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const cancelUpload = () => {
    setPendingFile(null);
    setUploadTitleInput('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteSong = async (songId: string) => {
    const success = await deleteSong(songId);
    if (success) {
      setSongs((prev) => prev.filter((s) => s.id !== songId));
      if (currentSongId === songId) {
        setCurrentSongId(null);
        setIsPlaying(false);
        setCurrentTime(0);
        broadcastState(null, false, 0);
      }
    }
  };

  const tick = useCallback(() => {
    if (!profile) return;
    setMyIntensity((prev) => {
      const target = holdingRef.current ? 1 : ignited ? 0.4 : 0;
      const next = prev + (target - prev) * 0.08;
      const rounded = Math.abs(next - target) < 0.01 ? target : next;
      sendLampUpdate({ intensity: rounded, holderId: profile.id });
      if (Math.abs(rounded - target) > 0.001) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
      return rounded;
    });
  }, [profile, ignited, sendLampUpdate]);

  const startHold = useCallback(() => {
    holdingRef.current = true;
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const endHold = useCallback(() => {
    holdingRef.current = false;
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const handleFlameClick = useCallback(() => {
    setIgnited((prev) => !prev);
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (loading || !profile || !profile.partner_id) return <div className="w-full h-full" />;

  const displayIntensity = Math.max(myIntensity, partnerIntensity);
  const scale = 0.8 + displayIntensity * 0.6;
  const showHeart = displayIntensity > 0.6;

  return (
    <div className="w-full h-full relative p-3 font-sans">
      <div className="drag-region absolute top-0 left-0 w-full h-5" />
      <div className="w-full h-full rounded-3xl overflow-hidden shadow-xl border border-white/50">
        <div className="w-full h-full bg-white/90 backdrop-blur-md flex flex-col items-center gap-2 p-3 overflow-y-auto overflow-x-hidden no-drag">
          <div
            className="relative flex items-center justify-center h-16 cursor-pointer flex-shrink-0"
            onClick={handleFlameClick}
            onMouseDown={startHold}
            onMouseUp={endHold}
            onMouseLeave={endHold}
            onTouchStart={startHold}
            onTouchEnd={endHold}
          >
            {showHeart && (
              <span className="absolute -top-2 text-lg animate-pet-bounce select-none pointer-events-none">💗</span>
            )}
            <img
              src="./sprites/pixel_flame.gif"
              className="pixel-art select-none transition-transform"
              style={{
                width: 48 * scale,
                height: 48 * scale,
                filter: `drop-shadow(0 0 ${6 + displayIntensity * 16}px rgba(255,138,91,${0.4 + displayIntensity * 0.6}))`,
              }}
              alt="flame"
              draggable={false}
            />
          </div>

          <div className="w-full h-px bg-gray-200" />

          <div className="w-full flex flex-col gap-2 font-pixel min-w-0">
            <div ref={marqueeContainerRef} className="relative w-full h-4 overflow-hidden flex-shrink-0">
              <p
                ref={marqueeTextRef}
                className="text-[10px] text-gray-500 whitespace-nowrap absolute top-0"
                style={{ transform: `translateX(${marqueeX}px)` }}
              >
                {currentSong ? currentSong.title : 'No song selected'}
              </p>
            </div>

            <div className="flex items-center gap-1 w-full min-w-0">
              <select
                value={currentSongId ?? ''}
                onChange={(e) => e.target.value && handleSelectSong(e.target.value)}
                className="flex-1 min-w-0 text-[10px] font-sans px-2 py-1.5 rounded-lg bg-cozy outline-none"
              >
                <option value="" disabled>
                  {songs.length === 0 ? 'No songs yet' : 'Choose a song...'}
                </option>
                {songs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title.length > 28 ? s.title.slice(0, 28) + '…' : s.title}
                  </option>
                ))}
              </select>
              {currentSong && (
                <button
                  onClick={() => handleDeleteSong(currentSong.id)}
                  className="text-red-400 hover:text-red-600 px-1.5 text-xs flex-shrink-0"
                  title="Delete this song"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex flex-col gap-0.5 w-full">
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                disabled={!currentSong}
                onChange={(e) => handleSeekChange(Number(e.target.value))}
                onMouseUp={(e) => handleSeekCommit(Number((e.target as HTMLInputElement).value))}
                onTouchEnd={(e) => handleSeekCommit(Number((e.target as HTMLInputElement).value))}
                className="w-full disabled:opacity-40"
              />
              <div className="flex justify-between text-[9px] font-sans text-gray-400">
                <span>{formatDuration(currentTime)}</span>
                <span>{formatDuration(duration)}</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3">
              <button onClick={() => skipSong(-1)} className="text-lg hover:scale-110 transition">
                ⏮
              </button>
              <button
                onClick={togglePlayPause}
                disabled={!currentSongId}
                className="w-8 h-8 rounded-full bg-campfire text-white flex items-center justify-center text-sm disabled:opacity-40 hover:scale-110 transition"
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button onClick={() => skipSong(1)} className="text-lg hover:scale-110 transition">
                ⏭
              </button>
            </div>

            <div className="flex items-center gap-1.5 w-full">
              <span className="text-[10px] flex-shrink-0">🔈</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="flex-1 min-w-0"
              />
            </div>

            {pendingFile ? (
              <div className="flex flex-col gap-1">
                <input
                  type="text"
                  value={uploadTitleInput}
                  onChange={(e) => setUploadTitleInput(e.target.value)}
                  placeholder="Song title"
                  autoFocus
                  className="text-[10px] font-sans px-2 py-1 rounded-lg bg-cozy outline-none"
                />
                <div className="flex gap-1">
                  <button
                    onClick={confirmUpload}
                    disabled={uploading}
                    className="flex-1 text-[10px] py-1 rounded-lg bg-campfire text-white disabled:opacity-50"
                  >
                    {uploading ? 'Uploading...' : 'Confirm Upload'}
                  </button>
                  <button onClick={cancelUpload} className="text-[10px] px-2 rounded-lg bg-gray-200">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-[10px] font-sans py-1.5 rounded-lg bg-lavender/70 hover:bg-lavender transition"
              >
                + Upload MP3
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/mpeg,audio/mp3"
              onChange={handleFileSelected}
              className="hidden"
            />
          </div>

          {currentSong && (
            <audio ref={audioRef} src={currentSong.file_url} onEnded={() => skipSong(1)} autoPlay={isPlaying} />
          )}
        </div>
      </div>
    </div>
  );
}