import assert from 'node:assert/strict';
import { surfaceCoverage, DEFAULT_ENVIRONMENT } from '../src/features/simulation/lib/mapEnvironment.ts';

const snow = { ...DEFAULT_ENVIRONMENT, weather: 'snow', snowCover: 100 };
const rain = { ...DEFAULT_ENVIRONMENT, weather: 'rain', waterLevel: 100 };
assert.equal(surfaceCoverage(100, [100, 100, 100, 100], 10, DEFAULT_ENVIRONMENT), 0, 'Clear weather leaves the terrain untouched');
assert.equal(surfaceCoverage(100, [100, 100, 100, 100], 10, { ...snow, snowCover: 0 }), 0);
assert.ok(surfaceCoverage(100, [100, 100, 100, 100], 10, snow) > surfaceCoverage(100, [110, 90, 110, 90], 10, snow), 'Steep slopes retain less snow');
assert.ok(surfaceCoverage(100, [102, 102, 102, 102], 100, rain) > surfaceCoverage(102, [100, 100, 100, 100], 100, rain), 'Depressions collect more water than ridges');
assert.equal(surfaceCoverage(100, [120, 80, 120, 80], 10, rain), 0, 'Steep faces must not be flooded');
assert.equal(surfaceCoverage(100, [102, 102, 102, 102], 100, { ...rain, waterLevel: 0 }), 0);
assert.equal(surfaceCoverage(NaN, [1, 2, 3, 4], 10, snow), 0, 'Missing terrain must not invent surface effects');
assert.equal(surfaceCoverage(1, [NaN, 2, 3, 4], 10, rain), 0);
for (const weather of ['clear', 'rain', 'snow']) for (let amount = 0; amount <= 100; amount += 5) {
  for (let slope = -20; slope <= 20; slope++) {
    const coverage = surfaceCoverage(100, [100 + slope, 100 - slope, 102, 99], 10, { ...DEFAULT_ENVIRONMENT, weather, snowCover: amount, waterLevel: amount });
    assert.ok(Number.isFinite(coverage) && coverage >= 0 && coverage <= 1);
  }
}
console.log('Map environment: clear/reset, snow slope, lowland water, missing DEM and coverage bounds passed.');
