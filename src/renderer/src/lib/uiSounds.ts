// Tiny synthesized UI "click" for buttons across the app. One global listener
// per window plays a soft blip on any button/link press — no per-button wiring.

let ctx: AudioContext | null = null;

function ac(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function playClick(): void {
  const c = ac();
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(440, t);
  osc.frequency.exponentialRampToValueAtTime(720, t + 0.03);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.1, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.1);
}

let installed = false;

// Call once per window. Plays a click when the user presses a button/link.
export function installUiClickSounds(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener(
    'pointerdown',
    (e) => {
      const target = e.target as HTMLElement | null;
      const el = target?.closest?.('button, [role="button"], a');
      if (el && !(el as HTMLButtonElement).disabled) playClick();
    },
    true
  );
}
