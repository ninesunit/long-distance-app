// Cat meows built from the REAL meow.mp3 sample (so it actually sounds like a
// cat) but played through Web Audio with a small random pitch/speed variation
// each time, so repeated pets don't sound identical or robotic.

import { SOUNDS } from './sounds';

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
let buffer: AudioBuffer | null = null;
let loading: Promise<void> | null = null;

function ac(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    bus = ctx.createGain();
    bus.gain.value = 0.9;
    bus.connect(ctx.destination);
  }
  return ctx;
}

function loadBuffer(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    const c = ac();
    const res = await fetch(SOUNDS.MEOW);
    const arr = await res.arrayBuffer();
    buffer = await c.decodeAudioData(arr);
  })().catch(() => {
    loading = null; // allow a retry on the next call
  });
  return loading;
}

export function resumeCatAudio(): void {
  const c = ac();
  if (c.state === 'suspended') c.resume();
  if (!buffer) loadBuffer();
}

export function playMeow(): void {
  const c = ac();
  if (c.state === 'suspended') c.resume();
  if (!buffer) {
    loadBuffer();
    return; // sample not ready yet — skip this one rather than glitch
  }

  const src = c.createBufferSource();
  src.buffer = buffer;
  // Vary pitch + length a little: some mews higher/quicker, some lower/slower.
  src.playbackRate.value = 0.9 + Math.random() * 0.24; // 0.90 – 1.14

  const g = c.createGain();
  g.gain.value = 0.85;
  // Tiny fade-out to avoid a click if the sample is trimmed abruptly.
  const dur = src.buffer.duration / src.playbackRate.value;
  const t = c.currentTime;
  g.gain.setValueAtTime(0.85, t);
  g.gain.setValueAtTime(0.85, t + Math.max(0, dur - 0.04));
  g.gain.linearRampToValueAtTime(0.0001, t + dur);

  src.connect(g);
  g.connect(bus!);
  src.start(t);
}

// Warm the sample up as soon as the module loads so the first pet has sound.
loadBuffer();
