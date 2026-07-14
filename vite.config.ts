import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  envDir: path.resolve(__dirname),
  publicDir: path.resolve(__dirname, 'src/renderer/assets'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer/src'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        dock: path.resolve(__dirname, 'src/renderer/dock.html'),
        pet: path.resolve(__dirname, 'src/renderer/pet.html'),
        petOverlay: path.resolve(__dirname, 'src/renderer/pet-overlay.html'),
        note: path.resolve(__dirname, 'src/renderer/note.html'),
        lamp: path.resolve(__dirname, 'src/renderer/lamp.html'),
        settings: path.resolve(__dirname, 'src/renderer/settings.html'),
        game: path.resolve(__dirname, 'src/renderer/game.html'),
        toast: path.resolve(__dirname, 'src/renderer/toast.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});