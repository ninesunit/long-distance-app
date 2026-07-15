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
        'cat-jump': 'catJump 1.5s ease-in-out infinite',
        'cat-eat': 'catEat 0.4s ease-in-out infinite',
        'cat-swat': 'catSwat 0.5s ease-in-out infinite',
        'cat-sneeze': 'catSneeze 0.9s ease-in-out',
        'cat-nest': 'catNest 1.4s ease-in-out',
        'residue-fade': 'residueFade 60s linear forwards',
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
        // A real jump arc: rise a quarter of the screen facing up (weight), then
        // ROTATE (not mirror) to face down at the apex and fall.
        catJump: {
          '0%': { transform: 'translateY(0) rotate(0deg)' },
          '45%': { transform: 'translateY(-25vh) rotate(0deg)' },
          '55%': { transform: 'translateY(-25vh) rotate(180deg)' },
          '100%': { transform: 'translateY(0) rotate(180deg)' },
        },
        // Head-bob while eating / drinking
        catEat: {
          '0%, 100%': { transform: 'translateY(0) scaleY(1)' },
          '50%': { transform: 'translateY(8%) scaleY(0.94)' },
        },
        // Quick paw swipe at a toy
        catSwat: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '35%': { transform: 'rotate(-10deg) translateX(-6%)' },
          '70%': { transform: 'rotate(6deg) translateX(4%)' },
        },
        // Sniff… then a startled sneeze that knocks the cat back
        catSneeze: {
          '0%, 55%': { transform: 'translate(0,0) rotate(0deg)' },
          '65%': { transform: 'translate(0,3%) rotate(0deg)' },
          '80%': { transform: 'translate(14%,-6%) rotate(6deg)' },
          '100%': { transform: 'translate(0,0) rotate(0deg)' },
        },
        // Circle a couple of times before settling to nest
        catNest: {
          '0%': { transform: 'rotate(0deg) scale(1)' },
          '60%': { transform: 'rotate(360deg) scale(1)' },
          '100%': { transform: 'rotate(360deg) scale(0.92)' },
        },
        residueFade: {
          '0%': { opacity: '0.85' },
          '80%': { opacity: '0.5' },
          '100%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
};