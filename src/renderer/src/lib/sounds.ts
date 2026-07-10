const cache = new Map<string, HTMLAudioElement>();

export function playSound(path: string, volume = 0.6): void {
  let audio = cache.get(path);
  if (!audio) {
    audio = new Audio(path);
    cache.set(path, audio);
  }
  audio.volume = volume;
  audio.currentTime = 0;
  audio.play().catch(() => {
    // Autoplay can be blocked before any user gesture in some contexts —
    // safe to ignore, the sound just won't play that one time.
  });
}

export const SOUNDS = {
  MEOW: './sounds/meow.mp3',
  NOTIFICATION: './sounds/notification.mp3',
} as const;
