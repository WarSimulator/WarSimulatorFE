import { WebRenderer, MilStdAttributes } from '@armyc2.c5isr.renderer/mil-sym-ts-web';
import type { TacticalGraphic } from '../../../types';
import { getTacticalTask, validateTaskPoints } from './tacticalTasks';

// Rendered geometry is derived; only the editable control points are persisted.
export function renderTacticalGraphic(graphic: TacticalGraphic, scale: number): GeoJSON.Feature[] {
  const symbol = graphic.tacticalSymbol;
  const task = getTacticalTask(symbol?.definitionId);
  if (!symbol || !task || graphic.geometry.type !== 'LineString') throw new Error('전술 도형 정의를 찾을 수 없습니다.');
  validateTaskPoints(task, graphic.geometry.coordinates);
  const color = symbol.affiliation === 'enemy' ? '#ff7777' : '#80d8ff';
  const attributes = new Map<string, string>([
    [MilStdAttributes.LineColor, color], [MilStdAttributes.TextColor, color],
    [MilStdAttributes.LineWidth, '3'], [MilStdAttributes.UseDashArray, 'false'],
  ]);
  const output = WebRenderer.RenderSymbol(graphic.id, graphic.name ?? '', '', symbol.sidc,
    graphic.geometry.coordinates.map(p => p.join(',')).join(' '), 'clampToGround', scale, '', new Map(), attributes, WebRenderer.OUTPUT_FORMAT_GEOJSON);
  const collection = JSON.parse(output) as GeoJSON.FeatureCollection;
  if (!Array.isArray(collection.features)) throw new Error('전술 도형 렌더링에 실패했습니다. 기준점을 확인해 주세요.');
  const features = collection.features.filter(feature => 'coordinates' in feature.geometry && feature.geometry.coordinates.length > 0);
  if (!features.some(f => f.geometry.type.includes('Line') || f.geometry.type.includes('Polygon'))) throw new Error('전술 도형의 선을 생성하지 못했습니다.');
  if (/NaN|Infinity/.test(JSON.stringify(features))) throw new Error('전술 도형 좌표가 유효하지 않습니다.');
  return features.map((feature, index) => ({
    ...feature, id: `${graphic.id}:${index}`,
    properties: { ...feature.properties, id: graphic.id, color, name: graphic.name ?? '',
      width: Number(feature.properties?.strokeWidth ?? 3),
      rotation: Number(feature.properties?.rotation ?? 0),
    },
  }));
}
