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
        cozy: '#fff1e6',
        lavender: '#e0d4f7',
        mint: '#c8f4de',
      },
      animation: {
        'slide-in': 'slideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-out': 'slideOut 0.3s cubic-bezier(0.7, 0, 0.84, 0) forwards',
        'pet-bounce': 'petBounce 0.6s ease-in-out',
        'glow-pulse': 'glowPulse 1.5s ease-in-out infinite',
        'cat-walk': 'catWalk 6s ease-in-out infinite',
        'marquee': 'marquee 8s linear infinite',
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
      },
    },
  },
  plugins: [],
};