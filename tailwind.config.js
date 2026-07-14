/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/*.html',
    './src/renderer/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
  pixel: ['"Press Start 2P"', 'monospace'],
  sans: ['Quicksand', 'ui-sans-serif', 'system-ui', 'sans-serif'],
},
      colors: {
        blush: '#ffd6e8',
        campfire: '#ff8a5b',
        'campfire-dark': '#e56a3d',
        cozy: '#fff1e6',
        lavender: '#e0d4f7',
        mint: '#c8f4de',
        // Structural tones for the SNES-style double-stroke borders.
        // Warm deep plum keeps the cozy identity while reading as "ink".
        ink: '#4a3546',
        'ink-soft': '#7a6470',
        paper: '#fff8f0',
      },
      boxShadow: {
        // Chunky offset "pixel" depth + inner light stroke (double-stroke look)
        pixel: 'inset 0 0 0 2px rgba(255,255,255,0.75), 4px 4px 0 0 rgba(74,53,70,0.22)',
        'pixel-sm': 'inset 0 0 0 2px rgba(255,255,255,0.7), 3px 3px 0 0 rgba(74,53,70,0.2)',
        'pixel-btn': '3px 3px 0 0 #4a3546',
        'pixel-btn-sm': '2px 2px 0 0 #4a3546',
      },
      animation: {
        'slide-in': 'slideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-out': 'slideOut 0.3s cubic-bezier(0.7, 0, 0.84, 0) forwards',
        'pet-bounce': 'petBounce 0.6s ease-in-out',
        'glow-pulse': 'glowPulse 1.5s ease-in-out infinite',
        'cat-walk': 'catWalk 6s ease-in-out infinite',
        'marquee': 'marquee 8s linear infinite',
        'cat-step': 'catStep 0.45s ease-in-out infinite',
        'cat-run': 'catRun 0.26s ease-in-out infinite',
        'cat-groom': 'catGroom 0.75s ease-in-out infinite',
        'cat-breathe': 'catBreathe 2.6s ease-in-out infinite',
        'music-float': 'musicFloat 1.6s ease-in-out infinite',
        'cat-flip': 'catFlip 0.5s linear infinite',
        'cat-hop': 'catHop 0.55s ease-in-out infinite',
        'cat-hop-fast': 'catHop 0.32s ease-in-out infinite',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(120%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideOut: {
          '0%': { transform: 'translateX(0)', opacity: '1' },
          '100%': { transform: 'translateX(120%)', opacity: '0' },
        },
        petBounce: {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '50%': { transform: 'translateY(-12px) scale(1.05)' },
        },
        glowPulse: {
          '0%, 100%': { filter: 'drop-shadow(0 0 4px rgba(255,138,91,0.5))' },
          '50%': { filter: 'drop-shadow(0 0 20px rgba(255,138,91,0.9))' },
        },
        catWalk: {
          '0%, 100%': { transform: 'translateX(0)' },
          '50%': { transform: 'translateX(140px) scaleX(-1)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-100%)' },
        },
        // Gentle hop while walking
        catStep: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6%)' },
        },
        // Fast bob + forward lean + stretch while running
        catRun: {
          '0%, 100%': { transform: 'translateY(0) skewX(-7deg) scaleX(1.06)' },
          '50%': { transform: 'translateY(-13%) skewX(-7deg) scaleX(1.06)' },
        },
        // Tilt down to lick, then back up — reads as grooming
        catGroom: {
          '0%, 100%': { transform: 'rotate(0deg) translateY(0)' },
          '45%, 60%': { transform: 'rotate(9deg) translateY(5%)' },
        },
        // Slow breathing while asleep
        catBreathe: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
        // Music notes bobbing above the cat's head
        musicFloat: {
          '0%, 100%': { transform: 'translateY(0)', opacity: '0.9' },
          '50%': { transform: 'translateY(-5px)', opacity: '1' },
        },
        // Spin while flung through the air (lands upright when it stops)
        catFlip: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        // Pronounced hop while roaming (visibly jumps up and lands)
        catHop: {
          '0%, 100%': { transform: 'translateY(0)' },
          '45%': { transform: 'translateY(-26%)' },
        },
      },
    },
  },
  plugins: [],
};