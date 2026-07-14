import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../auth/useAuth';
import { useCoupleChannel } from '../realtime/useCoupleChannel';
import {
  fetchSongs,
  uploadSong,
  deleteSong,
  fetchNowPlaying,
  setNowPlaying,
  addYoutubeSong,
  isYouTubeUrl,
  parseYouTubeId,
  type Song,
} from '../../lib/musicStore';
import { LampGlowLayer } from '../../components/LampGlow';

// Lazily load the YouTube IFrame API once (returns window.YT).
function loadYouTubeApi(): Promise<any> {
  const w = window as any;
  if (w.YT && w.YT.Player) return Promise.resolve(w.YT);
  return new Promise((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      if (prev) prev();
      resolve(w.YT);
    };
    if (!document.getElementById('yt-iframe-api')) {
      const s = document.createElement('script');
      s.id = 'yt-iframe-api';
      s.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(s);
    }
  });
}
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
  const ignitedRef = useRef(false);
  const myIntensityRef = useRef(0);

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

  // YouTube backend (only used when the current song's file_url is a YT link).
  const ytPlayerRef = useRef<any>(null);
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const ytReadyRef = useRef(false);
  const currentIsYTRef = useRef(false);
  const skipSongRef = useRef<(d: 1 | -1) => void>(() => {});
  const [showYt, setShowYt] = useState(false);
  const [ytUrl, setYtUrl] = useState('');
  const [ytTitle, setYtTitle] = useState('');
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
      // Refetch the shared library AND catch up to whatever the couple is
      // currently playing (song + play/pause + position), so reopening the
      // Lamp syncs to your partner instead of showing a stale state.
      fetchSongs(profile.id, profile.partner_id).then(setSongs);
      fetchNowPlaying(profile.id, profile.partner_id).then((np) => {
        if (!np) return;
        setCurrentSongId(np.song_id);
        setIsPlaying(np.is_playing);
        if (audioRef.current && np.song_id && Number.isFinite(np.position_seconds)) {
          const applySeek = () => {
            if (audioRef.current) audioRef.current.currentTime = np.position_seconds;
          };
          if (audioRef.current.readyState >= 1) applySeek();
          else audioRef.current.addEventListener('loadedmetadata', applySeek, { once: true });
        }
      });
    });
    return unsubscribe;
  }, [profile]);

  const currentSong = songs.find((s) => s.id === currentSongId) ?? null;
  const currentIsYT = currentSong ? isYouTubeUrl(currentSong.file_url) : false;
  currentIsYTRef.current = currentIsYT;

  useEffect(() => {
    if (currentIsYT) {
      const p = ytPlayerRef.current;
      if (!p || !ytReadyRef.current) return;
      if (isPlaying) p.playVideo?.();
      else p.pauseVideo?.();
      return;
    }
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, currentSongId, currentIsYT]);

  useEffect(() => {
    if (currentIsYT) {
      ytPlayerRef.current?.setVolume?.(Math.round(volume * 100));
      return;
    }
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume, currentIsYT]);

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

  // currentSong / currentIsYT are computed earlier (the audio effects need them)

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
      const pos =
        position ??
        (currentIsYTRef.current ? ytPlayerRef.current?.getCurrentTime?.() : audioRef.current?.currentTime) ??
        0;
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
    if (currentIsYT) ytPlayerRef.current?.seekTo?.(value, true);
    else if (audioRef.current) audioRef.current.currentTime = value;
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

  skipSongRef.current = skipSong;

  // Create/refresh the YouTube player when the current song is a YT link.
  // IMPORTANT: YT replaces its target element with an <iframe>. Pointing it at a
  // React-managed node corrupts React's DOM tree (crashing the renderer). So we
  // append an imperatively-created child into a React container and let YT
  // replace THAT — React only ever owns the container.
  useEffect(() => {
    if (!currentIsYT || !currentSong) {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy?.();
        } catch {
          /* noop */
        }
        ytPlayerRef.current = null;
        ytReadyRef.current = false;
      }
      return;
    }
    const videoId = parseYouTubeId(currentSong.file_url);
    if (!videoId) return;
    let cancelled = false;

    loadYouTubeApi().then((YT) => {
      if (cancelled || !ytContainerRef.current) return;

      if (ytPlayerRef.current && ytReadyRef.current) {
        try {
          ytPlayerRef.current.loadVideoById(videoId);
          if (!isPlaying) ytPlayerRef.current.pauseVideo();
        } catch {
          /* noop */
        }
        return;
      }
      if (ytPlayerRef.current) return; // creation already in flight

      const host = document.createElement('div');
      ytContainerRef.current.innerHTML = '';
      ytContainerRef.current.appendChild(host);
      try {
        ytPlayerRef.current = new YT.Player(host, {
          width: '100%',
          height: '100%',
          videoId,
          playerVars: { autoplay: 1, controls: 1, disablekb: 1, playsinline: 1, modestbranding: 1, rel: 0 },
          events: {
            onReady: (e: any) => {
              ytReadyRef.current = true;
              e.target.setVolume(Math.round(volume * 100));
              if (!isPlaying) e.target.pauseVideo();
            },
            onStateChange: (e: any) => {
              if (e.data === 0) skipSongRef.current(1); // 0 = ended → next track
            },
          },
        });
      } catch (err) {
        console.error('YouTube player failed to init:', err);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIsYT, currentSongId]);

  // Tear down the YT player when the popup unmounts.
  useEffect(() => {
    return () => {
      try {
        ytPlayerRef.current?.destroy?.();
      } catch {
        /* noop */
      }
      ytPlayerRef.current = null;
    };
  }, []);

  // Poll the YT player for progress (parallels the <audio> timeupdate path).
  useEffect(() => {
    if (!currentIsYT) return;
    const id = window.setInterval(() => {
      const p = ytPlayerRef.current;
      if (!p || !ytReadyRef.current) return;
      if (!seeking && p.getCurrentTime) setCurrentTime(p.getCurrentTime());
      if (p.getDuration) setDuration(p.getDuration());
    }, 500);
    return () => clearInterval(id);
  }, [currentIsYT, seeking]);

  const handleAddYoutube = async () => {
    const url = ytUrl.trim();
    if (!url || !profile?.partner_id) return;
    if (!parseYouTubeId(url)) return; // not a recognizable YouTube link
    const song = await addYoutubeSong(profile.id, profile.partner_id, url, ytTitle.trim());
    if (song) {
      setSongs((prev) => [song, ...prev]);
      handleSelectSong(song.id);
    }
    setYtUrl('');
    setYtTitle('');
    setShowYt(false);
  };

  // Drive the flame animation off refs (not the `ignited` closure) so rapid
  // presses can't strand the loop at a stale target — the running frame always
  // reads the latest holding/ignited/intensity values.
  const tick = useCallback(() => {
    if (!profile) return;
    const target = holdingRef.current ? 1 : ignitedRef.current ? 0.4 : 0;
    const prev = myIntensityRef.current;
    const next = prev + (target - prev) * 0.12;
    const rounded = Math.abs(next - target) < 0.01 ? target : next;
    myIntensityRef.current = rounded;
    setMyIntensity(rounded);
    sendLampUpdate({ intensity: rounded, holderId: profile.id });
    if (Math.abs(rounded - target) > 0.001) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      rafRef.current = null;
    }
  }, [profile, sendLampUpdate]);

  const ensureTick = useCallback(() => {
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const startHold = useCallback(() => {
    holdingRef.current = true;
    ensureTick();
  }, [ensureTick]);

  const endHold = useCallback(() => {
    holdingRef.current = false;
    ensureTick();
  }, [ensureTick]);

  const handleFlameClick = useCallback(() => {
    ignitedRef.current = !ignitedRef.current;
    setIgnited(ignitedRef.current);
    ensureTick();
  }, [ensureTick]);

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
      <div className="pixel-window relative w-full h-full flex flex-col items-center gap-2 p-3 overflow-y-auto overflow-x-hidden no-drag">
          <LampGlowLayer intensity={displayIntensity} />
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

          <div className="w-full h-0.5 bg-ink/15" />

          <div className="w-full flex flex-col gap-2 font-pixel min-w-0">
            <div ref={marqueeContainerRef} className="relative w-full h-4 overflow-hidden flex-shrink-0">
              <p
                ref={marqueeTextRef}
                className="text-[10px] text-ink whitespace-nowrap absolute top-0"
                style={{ transform: `translateX(${marqueeX}px)` }}
              >
                {currentSong ? currentSong.title : 'No song selected'}
              </p>
            </div>

            {/* YouTube video (sized + visible so it actually plays). React owns
                this container; YT replaces an imperatively-added child inside it. */}
            <div
              ref={ytContainerRef}
              className="w-full border-2 border-ink bg-black flex-shrink-0"
              style={{ aspectRatio: '16 / 9', display: currentIsYT ? 'block' : 'none' }}
            />

            <div className="flex items-center gap-1 w-full min-w-0">
              <select
                value={currentSongId ?? ''}
                onChange={(e) => e.target.value && handleSelectSong(e.target.value)}
                className="pixel-input flex-1 min-w-0 text-[10px] font-sans px-2 py-1.5"
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
              <button onClick={() => skipSong(-1)} className="text-lg text-ink hover:scale-110 transition">
                ⏮
              </button>
              <button
                onClick={togglePlayPause}
                disabled={!currentSongId}
                className="pixel-btn pixel-btn--primary w-9 h-9 flex items-center justify-center text-sm"
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button onClick={() => skipSong(1)} className="text-lg text-ink hover:scale-110 transition">
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
                  className="pixel-input text-[10px] font-sans px-2 py-1"
                />
                <div className="flex gap-1">
                  <button onClick={confirmUpload} disabled={uploading} className="pixel-btn pixel-btn--primary flex-1 text-[10px] py-1">
                    {uploading ? 'Uploading...' : 'Confirm Upload'}
                  </button>
                  <button onClick={cancelUpload} className="pixel-btn text-[10px] px-2 py-1">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => fileInputRef.current?.click()} className="pixel-btn pixel-btn--accent text-[10px] font-sans py-1.5">
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

            {showYt ? (
              <div className="flex flex-col gap-1">
                <input
                  type="text"
                  value={ytUrl}
                  onChange={(e) => setYtUrl(e.target.value)}
                  placeholder="Paste YouTube link"
                  autoFocus
                  className="pixel-input text-[10px] font-sans px-2 py-1"
                />
                <input
                  type="text"
                  value={ytTitle}
                  onChange={(e) => setYtTitle(e.target.value)}
                  placeholder="Title (optional)"
                  className="pixel-input text-[10px] font-sans px-2 py-1"
                />
                <div className="flex gap-1">
                  <button
                    onClick={handleAddYoutube}
                    disabled={!parseYouTubeId(ytUrl.trim())}
                    className="pixel-btn pixel-btn--primary flex-1 text-[10px] py-1"
                  >
                    Add link
                  </button>
                  <button
                    onClick={() => {
                      setShowYt(false);
                      setYtUrl('');
                      setYtTitle('');
                    }}
                    className="pixel-btn text-[10px] px-2 py-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowYt(true)} className="pixel-btn text-[10px] font-sans py-1.5">
                ＋ YouTube link
              </button>
            )}
          </div>

          {currentSong && !currentIsYT && (
            <audio ref={audioRef} src={currentSong.file_url} onEnded={() => skipSong(1)} autoPlay={isPlaying} />
          )}
      </div>
    </div>
  );
}