import { MercatorCoordinate, type CanvasSource, type CustomLayerInterface, type Map as MapLibreMap } from 'maplibre-gl';
import { surfaceCoverage, type MapEnvironment } from './mapEnvironment';

const SURFACE = 'environment-surface';
const PARTICLES = 'environment-precipitation';
const GRID = 48;
const SAMPLE_ROWS_PER_BATCH = 4;
const PRECIPITATION_FRAME_MS = 1000 / 30;
const MAX_PARTICLES = 1800;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Custom 3D particles in geographic space, sharing the map camera and depth buffer. */
function precipitationLayer(map: MapLibreMap, read: () => MapEnvironment, elevationAt: (coordinate: MercatorCoordinate) => number): CustomLayerInterface & { refreshTerrain: () => void } {
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let position = 0;
  let matrixLocation: WebGLUniformLocation | null = null;
  let snowLocation: WebGLUniformLocation | null = null;
  let sizeLocation: WebGLUniformLocation | null = null;
  let colorLocation: WebGLUniformLocation | null = null;
  let anchor = MercatorCoordinate.fromLngLat(map.getCenter());
  let meters = anchor.meterInMercatorCoordinateUnits();
  let span = 1000;
  const seeds = new Float32Array(MAX_PARTICLES * 3);
  const ground = new Float32Array(MAX_PARTICLES);
  const vertices = new Float32Array(MAX_PARTICLES * 6);
  const matrix = new Float32Array(16);
  let elapsed = 0;
  let previousTime = 0;
  let repaintTimer: ReturnType<typeof setTimeout> | undefined;
  let vertexCount = 0;
  let vertexSettings = '';
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  const relocate = () => {
    previousTime = 0;
    anchor = MercatorCoordinate.fromLngLat(map.getCenter());
    meters = anchor.meterInMercatorCoordinateUnits();
    span = clamp(40075016 * Math.cos(map.getCenter().lat * Math.PI / 180) / 2 ** map.getZoom() * 2, 300, 18000);
    if (read().weather === 'clear') return;
    // Sample a small height grid once per camera/terrain change, not per particle per frame.
    const size = 20;
    const heights = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const coord = new MercatorCoordinate(anchor.x + (x / (size - 1) - 0.5) * span * meters, anchor.y + (y / (size - 1) - 0.5) * span * meters);
      heights[y * size + x] = elevationAt(coord);
    }
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const x = Math.round(seeds[i * 3] * (size - 1));
      const y = Math.round(seeds[i * 3 + 1] * (size - 1));
      ground[i] = heights[y * size + x];
    }
  };
  return {
    id: PARTICLES, type: 'custom', renderingMode: '3d', refreshTerrain: relocate,
    onAdd(_map, gl) {
      const shaders: WebGLShader[] = [];
      try {
        const compile = (type: number, source: string) => {
          const shader = gl.createShader(type);
          if (!shader) throw new Error('날씨 셰이더를 생성할 수 없습니다.');
          shaders.push(shader);
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? '날씨 셰이더 오류');
          return shader;
        };
        program = gl.createProgram();
        if (!program) throw new Error('날씨 렌더러를 생성할 수 없습니다.');
        gl.attachShader(program, compile(gl.VERTEX_SHADER, `
          attribute vec3 a_position;
          uniform mat4 u_matrix;
          uniform float u_size;
          void main() { gl_Position = u_matrix * vec4(a_position, 1.0); gl_PointSize = u_size; }
        `));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, `
          precision mediump float;
          uniform float u_snow;
          uniform vec4 u_color;
          void main() {
            float alpha = 1.0;
            if (u_snow > 0.5) {
              float d = length(gl_PointCoord - vec2(0.5));
              alpha = 1.0 - smoothstep(0.12, 0.5, d);
              if (alpha < 0.01) discard;
            }
            gl_FragColor = vec4(u_color.rgb * u_color.a * alpha, u_color.a * alpha);
          }
        `));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? '날씨 렌더러 연결 오류');
        buffer = gl.createBuffer();
        if (!buffer) throw new Error('날씨 버퍼를 생성할 수 없습니다.');
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices.byteLength, gl.DYNAMIC_DRAW);
        position = gl.getAttribLocation(program, 'a_position');
        matrixLocation = gl.getUniformLocation(program, 'u_matrix');
        snowLocation = gl.getUniformLocation(program, 'u_snow');
        sizeLocation = gl.getUniformLocation(program, 'u_size');
        colorLocation = gl.getUniformLocation(program, 'u_color');
        relocate();

      } catch (error) {
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
        buffer = null; program = null;
        throw error;
      } finally { shaders.forEach(shader => gl.deleteShader(shader)); }
    },
    render(gl, input) {
      const settings = read();
      if (!program || !buffer || settings.weather === 'clear' || document.hidden) { previousTime = 0; return; }
      const now = performance.now();
      const snow = settings.weather === 'snow';
      const settingsKey = `${settings.weather}:${settings.intensity}`;
      const updateVertices = !previousTime || settingsKey !== vertexSettings || now - previousTime >= PRECIPITATION_FRAME_MS;
      if (updateVertices) {
        elapsed += previousTime ? Math.min((now - previousTime) / 1000, 0.05) : 0;
        previousTime = now;
        vertexSettings = settingsKey;
        const count = settings.intensity * 600;
        const height = clamp(span * 0.3, 120, 2800);
        const speed = height * (snow ? 0.07 : 0.6);
        for (let i = 0; i < count; i++) {
          const x = (seeds[i * 3] - 0.5) * span;
          const y = (seeds[i * 3 + 1] - 0.5) * span;
          const z = ground[i] + ((seeds[i * 3 + 2] * height - elapsed * speed) % height + height) % height;
          const offset = i * (snow ? 3 : 6);
          vertices[offset] = x + (snow ? Math.sin(elapsed + i) * span * 0.002 : 0);
          vertices[offset + 1] = y;
          vertices[offset + 2] = z;
          if (!snow) {
            vertices[offset + 3] = x + height * 0.002;
            vertices[offset + 4] = y;
            vertices[offset + 5] = z + height * 0.025;
          }
        }
        vertexCount = count * (snow ? 1 : 2);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices.subarray(0, vertexCount * 3));
      }
      // Translate in double precision before the GPU upload to avoid geographic jitter.
      const projection = input.defaultProjectionData.mainMatrix;
      for (let row = 0; row < 4; row++) {
        matrix[row] = projection[row] * meters;
        matrix[4 + row] = projection[4 + row] * meters;
        matrix[8 + row] = projection[8 + row] * meters;
        matrix[12 + row] = projection[row] * anchor.x + projection[4 + row] * anchor.y + projection[12 + row];
      }
      gl.useProgram(program);
      gl.uniformMatrix4fv(matrixLocation, false, matrix);
      gl.uniform1f(snowLocation, snow ? 1 : 0);
      gl.uniform1f(sizeLocation, (snow ? 3.5 : 1) * Math.min(window.devicePixelRatio, 2));
      gl.uniform4f(colorLocation, snow ? 0.94 : 0.63, snow ? 0.97 : 0.78, 1, settings.time === 'night' ? 0.65 : 0.8);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.drawArrays(snow ? gl.POINTS : gl.LINES, 0, vertexCount);
      gl.disableVertexAttribArray(position);
      gl.depthMask(true);
      if (!repaintTimer) repaintTimer = setTimeout(() => {
        repaintTimer = undefined;
        if (read().weather !== 'clear' && !document.hidden) map.triggerRepaint();
      }, Math.max(0, PRECIPITATION_FRAME_MS - (now - previousTime)));
    },
    onRemove(_map, gl) {
      clearTimeout(repaintTimer);
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
    },
  };
}

export function attachMapEnvironment(map: MapLibreMap, initial: MapEnvironment) {
  let settings = initial;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = GRID;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('지형 날씨 효과를 생성할 수 없습니다.');
  const elevations = new Float32Array(GRID * GRID);
  let spacing = 1;
  let surfaceReady = false;
  let sampleGeneration = 0;
  let sampleTimer: ReturnType<typeof setTimeout> | undefined;
  let sampledLeft = 0, sampledTop = 0, sampledStep = 1;
  const style = map.getStyle();
  const originalSky = style.sky;
  const originalPaint = style.layers.filter(layer => layer.id === 'osm' || layer.id === 'terrain-hillshade').map(layer => ({ id: layer.id, paint: { ...layer.paint } }));
  const before = style.layers.find(layer => layer.id.startsWith('deployment-') || layer.id.startsWith('task-'))?.id;
  const center = map.getCenter();
  map.addSource(SURFACE, { type: 'canvas', canvas, animate: false, coordinates: [[center.lng - 0.01, center.lat + 0.01], [center.lng + 0.01, center.lat + 0.01], [center.lng + 0.01, center.lat - 0.01], [center.lng - 0.01, center.lat - 0.01]] });
  map.addLayer({ id: SURFACE, type: 'raster', source: SURFACE, paint: { 'raster-opacity': 0.9, 'raster-fade-duration': 0 } }, before);
  const particles = precipitationLayer(map, () => settings, coordinate => {
    if (!surfaceReady) return 0;
    const x = clamp(Math.round((coordinate.x - sampledLeft) / sampledStep), 0, GRID - 1);
    const y = clamp(Math.round((coordinate.y - sampledTop) / sampledStep), 0, GRID - 1);
    return elevations[y * GRID + x] || 0;
  });
  try { map.addLayer(particles); }
  catch (error) { map.removeLayer(SURFACE); map.removeSource(SURFACE); throw error; }

  const paintSurface = () => {
    if (disposed || !surfaceReady) return;
    const pixels = ctx.createImageData(GRID, GRID);
    for (let y = 1; y < GRID - 1; y++) for (let x = 1; x < GRID - 1; x++) {
      const index = y * GRID + x;
      const coverage = surfaceCoverage(elevations[index], [elevations[index - 1], elevations[index + 1], elevations[index - GRID], elevations[index + GRID]], spacing, settings);
      const snow = settings.weather === 'snow';
      const night = settings.time === 'night';
      const shade = clamp(1 + (elevations[index - GRID] - elevations[index + GRID]) / spacing * 0.25, 0.6, 1);
      pixels.data[index * 4] = (snow ? (night ? 96 : 239) : (night ? 22 : 42)) * shade;
      pixels.data[index * 4 + 1] = (snow ? (night ? 120 : 246) : (night ? 52 : 125)) * shade;
      pixels.data[index * 4 + 2] = (snow ? (night ? 154 : 255) : (night ? 78 : 174)) * shade;
      pixels.data[index * 4 + 3] = 255 * coverage;
    }
    ctx.putImageData(pixels, 0, 0);
    const source = map.getSource(SURFACE) as CanvasSource | undefined;
    // One upload per change, instead of continuously repainting terrain textures.
    source?.play();
    map.once('render', () => { if (!disposed) source?.pause(); });
    map.triggerRepaint();
  };
  const sampleSurface = () => {
    timer = undefined;
    if (disposed || !map.getTerrain() || settings.weather === 'clear') return;
    const bounds = map.getBounds();
    const middle = MercatorCoordinate.fromLngLat(map.getCenter());
    const scale = middle.meterInMercatorCoordinateUnits();
    const northwest = MercatorCoordinate.fromLngLat(bounds.getNorthWest());
    const southeast = MercatorCoordinate.fromLngLat(bounds.getSouthEast());
    // Limit work to local terrain. MapLibre may fall back to coarser DEM tiles or sea level.
    const half = clamp(Math.max(Math.abs(southeast.x - northwest.x), Math.abs(southeast.y - northwest.y)) / scale * 0.6, 250, 40000) * scale;
    const left = middle.x - half, top = middle.y - half;
    const step = half * 2 / (GRID - 1);
    const generation = ++sampleGeneration;
    const sampled = new Float32Array(GRID * GRID);
    let row = 0;
    const sampleBatch = () => {
      sampleTimer = undefined;
      if (disposed || generation !== sampleGeneration || settings.weather === 'clear') return;
      const endRow = Math.min(row + SAMPLE_ROWS_PER_BATCH, GRID);
      for (; row < endRow; row++) for (let x = 0; x < GRID; x++) {
        sampled[row * GRID + x] = map.queryTerrainElevation(new MercatorCoordinate(left + x * step, top + row * step).toLngLat()) ?? NaN;
      }
      if (row < GRID) { sampleTimer = setTimeout(sampleBatch, 0); return; }
      elevations.set(sampled);
      sampledLeft = left; sampledTop = top; sampledStep = step;
      spacing = step / scale;
      const coord = (x: number, y: number): [number, number] => {
        const point = new MercatorCoordinate(x, y).toLngLat();
        return [point.lng, point.lat];
      };
      (map.getSource(SURFACE) as CanvasSource).setCoordinates([coord(left, top), coord(left + half * 2, top), coord(left + half * 2, top + half * 2), coord(left, top + half * 2)]);
      surfaceReady = true;
      particles.refreshTerrain();
      paintSurface();
    };
    sampleBatch();
  };
  const cancelSampling = () => {
    clearTimeout(timer); timer = undefined;
    clearTimeout(sampleTimer); sampleTimer = undefined;
    sampleGeneration++;
  };
  const scheduleSurface = () => {
    if (disposed || settings.weather === 'clear' || map.isMoving()) return;
    cancelSampling();
    timer = setTimeout(sampleSurface, 250);
  };
  const onSourceData = (event: { sourceId?: string; isSourceLoaded?: boolean }) => {
    if (event.sourceId === 'terrainSource' && event.isSourceLoaded) scheduleSurface();
  };
  const onVisibility = () => { if (!document.hidden) map.triggerRepaint(); };
  map.on('movestart', cancelSampling);
  map.on('moveend', scheduleSurface);
  map.on('sourcedata', onSourceData);
  map.on('terrain', scheduleSurface);
  document.addEventListener('visibilitychange', onVisibility);

  const update = (next: MapEnvironment) => {
    const previousWeather = settings.weather;
    settings = next;
    const night = settings.time === 'night';
    const wet = settings.weather === 'rain';
    const cloudy = settings.weather !== 'clear';
    map.setSky({ 'sky-color': night ? '#071323' : cloudy ? '#768997' : '#88c6fc', 'horizon-color': night ? '#152538' : cloudy ? '#adb9bf' : '#dbeaf5', 'fog-color': night ? '#132033' : cloudy ? '#a1afb6' : '#dbeaf5', 'fog-ground-blend': cloudy ? 0.35 : 0.08, 'horizon-fog-blend': 0.5 });
    if (map.getLayer('osm')) {
      map.setPaintProperty('osm', 'raster-brightness-min', night ? 0.02 : 0.12);
      map.setPaintProperty('osm', 'raster-brightness-max', night ? 0.24 : wet ? 0.49 : 0.72);
      map.setPaintProperty('osm', 'raster-saturation', night ? -0.85 : -0.55);
    }
    if (map.getLayer('terrain-hillshade')) {
      map.setPaintProperty('terrain-hillshade', 'hillshade-shadow-color', night ? '#030b17' : '#182018');
      map.setPaintProperty('terrain-hillshade', 'hillshade-highlight-color', night ? '#41516a' : '#c9d2b0');
    }
    map.setLayoutProperty(SURFACE, 'visibility', settings.weather === 'clear' ? 'none' : 'visible');
    if (settings.weather === 'clear') cancelSampling();
    else paintSurface();
    if (previousWeather !== settings.weather || !surfaceReady) scheduleSurface();
    map.triggerRepaint();
  };
  update(initial);
  return {
    update,
    destroy() {
      disposed = true;
      cancelSampling();
      map.off('movestart', cancelSampling);
      map.off('moveend', scheduleSurface);
      map.off('sourcedata', onSourceData);
      map.off('terrain', scheduleSurface);
      document.removeEventListener('visibilitychange', onVisibility);
      // The owning map can be removed before React cleans up this child.
      if (!map.getStyle()) return;
      if (map.getLayer(PARTICLES)) map.removeLayer(PARTICLES);
      if (map.getLayer(SURFACE)) map.removeLayer(SURFACE);
      if (map.getSource(SURFACE)) map.removeSource(SURFACE);
      map.setSky(originalSky ?? {});
      for (const layer of originalPaint) if (map.getLayer(layer.id)) {
        for (const [key, value] of Object.entries(layer.paint)) map.setPaintProperty(layer.id, key as Parameters<MapLibreMap['setPaintProperty']>[1], value as Parameters<MapLibreMap['setPaintProperty']>[2]);
      }
    },
  };
}
