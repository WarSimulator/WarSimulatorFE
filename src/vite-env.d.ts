/// <reference types="vite/client" />

declare module '@mapbox/mapbox-gl-draw' {
  type DrawMode = 'simple_select' | 'direct_select' | 'draw_line_string' | 'draw_polygon';

  export default class MapboxDraw {
    static constants: {
      classes: Record<string, string>;
    };

    constructor(options?: Record<string, unknown>);
    onAdd(map: unknown): HTMLElement;
    onRemove(map: unknown): void;
    changeMode(mode: DrawMode, options?: Record<string, unknown>): void;
    add(feature: GeoJSON.Feature | GeoJSON.FeatureCollection): string[];
    delete(ids: string | string[]): this;
    deleteAll(): this;
    getAll(): GeoJSON.FeatureCollection;
    get(id: string): GeoJSON.Feature | undefined;
    set(featureCollection: GeoJSON.FeatureCollection): string[];
    trash(): void;
  }
}
