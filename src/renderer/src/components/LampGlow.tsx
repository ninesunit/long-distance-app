// Warm cozy wash rendered INSIDE a popup card (not across the desktop). Sits
// behind the card content, pointer-events-none. `intensity` is 0..1.
//
// Presentational only: each popup already owns a couple channel, so it feeds
// its own max lamp intensity here (no second channel subscription).
export function LampGlowLayer({ intensity }: { intensity: number }) {
  if (intensity <= 0.01) return null;
  const a = Math.min(1, intensity);
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background: `radial-gradient(120% 100% at 50% 100%, rgba(255,166,110,${(0.5 * a).toFixed(3)}) 0%, rgba(255,138,91,${(0.22 * a).toFixed(3)}) 45%, rgba(255,138,91,0) 78%)`,
        boxShadow: `inset 0 0 ${Math.round(24 * a)}px rgba(255,150,90,${(0.35 * a).toFixed(3)})`,
        transition: 'background 350ms linear, box-shadow 350ms linear',
      }}
    />
  );
}
