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

// Whoosh when the cat is flung through the air.
export function playWhoosh(): void {
  const c = ac();
  if (c.state === 'suspended') c.resume();
  const t = c.currentTime;
  const dur = 0.3;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1;
  bp.frequency.setValueAtTime(400, t);
  bp.frequency.exponentialRampToValueAtTime(2600, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.22, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp);
  bp.connect(g);
  g.connect(bus!);
  src.start(t);
}

// Soft thud when the cat lands on its feet.
export function playThud(): void {
  const c = ac();
  if (c.state === 'suspended') c.resume();
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(170, t);
  osc.frequency.exponentialRampToValueAtTime(48, t + 0.15);
  const g = c.createGain();
  g.gain.setValueAtTime(0.32, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  osc.connect(g);
  g.connect(bus!);
  osc.start(t);
  osc.stop(t + 0.2);
}

// --- Sandbox sticker SFX (all synthesized, no extra assets) ----------------

function noiseBurst(dur: number, gain: number, from: number, to: number, type: BiquadFilterType = 'bandpass'): void {
  const c = ac();
  if (c.state === 'suspended') c.resume();
  const t = c.currentTime;
  const n = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(bus!);
  src.start(t);
}

function blip(freqFrom: number, freqTo: number, dur: number, gain: number, type: OscillatorType = 'sine', delay = 0): void {
  const c = ac();
  if (c.state === 'suspended') c.resume();
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freqFrom, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur / 2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(bus!);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Crunchy chewing while eating.
export function playCrunch(): void {
  noiseBurst(0.09, 0.24, 1800, 500);
  noiseBurst(0.09, 0.2, 1600, 450);
  window.setTimeout(() => noiseBurst(0.09, 0.22, 1700, 500), 180);
}

// Quick tongue-lapping while drinking.
export function playSip(): void {
  blip(900, 1500, 0.06, 0.14);
  blip(950, 1600, 0.06, 0.12, 'sine', 0.12);
  blip(900, 1500, 0.06, 0.12, 'sine', 0.24);
}

// Little "pop" when a sticker drops in / the cat hops into a box.
export function playPop(): void {
  blip(300, 900, 0.09, 0.22, 'sine');
}

// Water splash.
export function playSplash(): void {
  noiseBurst(0.35, 0.26, 2600, 300, 'lowpass');
  blip(700, 180, 0.25, 0.14, 'sine');
}

// Cartoon boing (swat / pounce / startle).
export function playBoing(): void {
  blip(600, 160, 0.22, 0.2, 'triangle');
  blip(200, 520, 0.16, 0.12, 'triangle', 0.1);
}

// Soft ascending sparkle (cozy / sniff).
export function playSparkle(): void {
  blip(880, 1320, 0.09, 0.12, 'sine');
  blip(1180, 1760, 0.09, 0.1, 'sine', 0.09);
  blip(1480, 2100, 0.1, 0.09, 'sine', 0.18);
}

// A sneeze: sharp inhale then an "achoo" burst.
export function playSneeze(): void {
  blip(500, 1200, 0.18, 0.1, 'sawtooth');
  window.setTimeout(() => noiseBurst(0.18, 0.28, 2400, 700), 200);
}

// Descending sweep for "clear all".
export function playSweep(): void {
  noiseBurst(0.35, 0.2, 3000, 300, 'bandpass');
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
