// Procedural chiptune music + sound effects for the mini-game, synthesized with
// the Web Audio API so no audio files are shipped. Everything is generated on
// the fly from oscillators + a little noise. Call resumeAudio() from a user
// gesture (e.g. the Start button) before expecting sound.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicTimer: number | null = null;
let musicStep = 0;

function ac(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.2;
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.65;
    sfxBus.connect(master);
  }
  return ctx;
}

export function resumeAudio(): void {
  const c = ac();
  if (c.state === 'suspended') c.resume();
}

function blip(freq: number, start: number, dur: number, type: OscillatorType, bus: GainNode, vol: number) {
  const c = ac();
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(bus);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function slide(f0: number, f1: number, start: number, dur: number, type: OscillatorType, bus: GainNode, vol: number) {
  const c = ac();
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), start + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(bus);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function noiseBurst(start: number, dur: number, bus: GainNode, vol: number) {
  const c = ac();
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(g);
  g.connect(bus);
  src.start(start);
}

export type Sfx = 'treat' | 'bomb' | 'go' | 'gameover' | 'win' | 'lose';

export function playSfx(name: Sfx): void {
  const c = ac();
  if (c.state === 'suspended') c.resume();
  const t = c.currentTime;
  const sb = sfxBus!;
  switch (name) {
    case 'treat': // bright two-note "ding up"
      blip(880, t, 0.07, 'square', sb, 0.5);
      blip(1318.51, t + 0.06, 0.1, 'square', sb, 0.5);
      break;
    case 'bomb': // descending buzz + noise puff
      slide(320, 60, t, 0.28, 'sawtooth', sb, 0.5);
      noiseBurst(t, 0.16, sb, 0.35);
      break;
    case 'go': // countdown → start
      blip(660, t, 0.1, 'square', sb, 0.5);
      blip(990, t + 0.11, 0.16, 'square', sb, 0.55);
      break;
    case 'gameover': // sad descending arpeggio
      blip(523.25, t, 0.14, 'square', sb, 0.5);
      blip(392.0, t + 0.15, 0.14, 'square', sb, 0.5);
      blip(261.63, t + 0.3, 0.3, 'square', sb, 0.5);
      break;
    case 'win': // triumphant rise
      blip(523.25, t, 0.1, 'square', sb, 0.5);
      blip(659.25, t + 0.1, 0.1, 'square', sb, 0.5);
      blip(783.99, t + 0.2, 0.1, 'square', sb, 0.5);
      blip(1046.5, t + 0.3, 0.24, 'square', sb, 0.55);
      break;
    case 'lose':
      blip(440, t, 0.12, 'triangle', sb, 0.5);
      blip(349.23, t + 0.13, 0.12, 'triangle', sb, 0.5);
      blip(261.63, t + 0.26, 0.28, 'triangle', sb, 0.5);
      break;
  }
}

// --- Looping chiptune (cheerful C-major pentatonic bounce) ------------------
const LEAD = [
  523.25, 659.25, 783.99, 659.25, 880.0, 659.25, 783.99, 587.33,
  523.25, 659.25, 783.99, 1046.5, 880.0, 783.99, 659.25, 587.33,
];
const BASS = [
  130.81, 0, 174.61, 0, 196.0, 0, 130.81, 0,
  146.83, 0, 174.61, 0, 196.0, 0, 174.61, 0,
];
const STEP_MS = 150;

export function startMusic(): void {
  const c = ac();
  if (c.state === 'suspended') c.resume();
  if (musicTimer !== null) return;
  musicStep = 0;
  musicTimer = window.setInterval(() => {
    const t = ac().currentTime + 0.02;
    const i = musicStep % LEAD.length;
    if (LEAD[i]) blip(LEAD[i], t, 0.13, 'square', musicBus!, 0.5);
    if (BASS[i]) blip(BASS[i], t, 0.2, 'triangle', musicBus!, 0.8);
    musicStep++;
  }, STEP_MS);
}

export function stopMusic(): void {
  if (musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

export function isMusicPlaying(): boolean {
  return musicTimer !== null;
}
