import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@armyc2.c5isr.renderer/mil-sym-ts-web'],
    exclude: ['maplibre-gl'],
  },
});
