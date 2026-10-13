# MapLibre regional benchmark dataset

Bounds: 127.15°E–127.75°E, 38.25°N–38.70°N (VER1 operation near Cheorwon).

- Basemap: Protomaps daily archive `https://build.protomaps.com/20261012.pmtiles`, z0–13; vector tiles extracted with the PMTiles reader. © OpenStreetMap contributors, ODbL; Protomaps attribution retained.
- Terrain: Mapterhorn `https://download.mapterhorn.com/planet.pmtiles`, z0–12, 512px Terrarium WebP. Mapterhorn attribution retained. See https://mapterhorn.com/attribution/ for underlying DEM sources.
- Font: MapLibre demo Noto Sans Regular glyph range 0–255. Noto fonts are distributed under the SIL Open Font License.
- `simulation.json`: fixed VER1 simulation output generated once, including road routes or recorded fallbacks, so every benchmark condition uses identical paths without runtime routing requests.
- `manifest.json`: bounds, provenance, preparation time and tile file sizes.

Reproduce: `npm run prepare:map-benchmark` (network required only during preparation).
Open the **MapLibre 지역·로컬 성능 테스트** menu. Local conditions use only app-hosted map, map-label glyph and simulation assets. The application-wide UI webfonts still use Google Fonts and fall back to system fonts without network. Remote conditions require network access and the development or preview server. The Protomaps download archive does not publish browser CORS headers, so the test-only fixed-upstream relay forwards bounded Range requests without storing the remote archive. Production static hosting needs an equivalent relay for remote comparison; local conditions need no relay.

Comparison controls: identical camera, viewport, 1.5 maximum pixel ratio, weather, VER1 tracks/action effects and 10-second camera/replay sequence. Three-second camera-path warmup after tile readiness, followed by a wait for the warmed path tiles. Fixed-height results panel keeps the map viewport constant. Default two rounds reverse ordering in the second round. Browser/OS/GPU caching is not cleared; load times are explicitly cache-sensitive. Backgrounded, delayed or tile-error runs are invalidated. Render event FPS is not GPU execution time.

The test uses a vector basemap in every condition, unlike the production OSM raster basemap. It isolates regional bounds, data location and DEM maximum zoom; it does not measure the benefit of switching production basemap formats. No OSM public image tiles were bulk downloaded.

Measured pilot results: [RESULTS.md](RESULTS.md).

## Simulator integration

The MapLibre GL simulator now uses this local package for both playback and Revision, with DEM z12 retained. Camera bounds, accepted deployments, generated road routes and Revision edits are restricted to the manifest bounds. Out-of-region packages/routes are rejected with a message; no silent clipping or remote-map fallback is performed. This dataset covers Cheorwon, not the entire Korean peninsula. New map packages must keep their manifest and extracted tiles consistent. The simulator still generates road routes through its configured routing service; local map delivery does not make route generation offline.
