import { defineConfig } from 'vite';
// @ts-expect-error Test relay is a small Node-only module.
import { mapBenchmarkProxy } from './scripts/map-benchmark-proxy.mjs';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const cesiumSource = 'node_modules/cesium/Build/Cesium';
const cesiumBaseUrl = 'cesiumStatic';

export default defineConfig({
  base: '/simulator/',
  define: { CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}/`) },
  plugins: [
    react(),
    mapBenchmarkProxy(),
    viteStaticCopy({
      targets: [
        { src: `${cesiumSource}/ThirdParty`, dest: cesiumBaseUrl, rename: { stripBase: 4 } },
        { src: `${cesiumSource}/Workers`, dest: cesiumBaseUrl, rename: { stripBase: 4 } },
        { src: `${cesiumSource}/Assets`, dest: cesiumBaseUrl, rename: { stripBase: 4 } },
        { src: `${cesiumSource}/Widgets`, dest: cesiumBaseUrl, rename: { stripBase: 4 } },
      ],
    }),
  ],
  server: { port: 5174, strictPort: true, fs: { allow: ['.', '../AtomicActionVisualizer'] } },
  optimizeDeps: {
    include: ['@armyc2.c5isr.renderer/mil-sym-ts-web'],
    exclude: ['maplibre-gl'],
  },
});
