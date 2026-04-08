import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadTigerCbsaGeometries, pointInPolygon } from '../scripts/lib/tiger-cbsa-source.mjs';

test('pointInPolygon handles outer rings and holes', () => {
    const polygon = {
        bounds: { minLon: 0, minLat: 0, maxLon: 10, maxLat: 10 },
        rings: [
            [
                { lon: 0, lat: 0 },
                { lon: 10, lat: 0 },
                { lon: 10, lat: 10 },
                { lon: 0, lat: 10 },
                { lon: 0, lat: 0 },
            ],
            [
                { lon: 3, lat: 3 },
                { lon: 7, lat: 3 },
                { lon: 7, lat: 7 },
                { lon: 3, lat: 7 },
                { lon: 3, lat: 3 },
            ],
        ],
    };
    assert.equal(pointInPolygon(1, 1, polygon), true);
    assert.equal(pointInPolygon(5, 5, polygon), false);
    assert.equal(pointInPolygon(11, 11, polygon), false);
});

test('loadTigerCbsaGeometries loads CBSA polygons when local TIGER zip is present', async (t) => {
    const zipPath = path.resolve('tmp/geo/us/tl_2024_us_cbsa.zip');
    try {
        await fs.access(zipPath);
    }
    catch {
        t.skip(`TIGER CBSA zip not available at ${zipPath}`);
        return;
    }
    const geometries = await loadTigerCbsaGeometries(zipPath);
    const sacramento = geometries.get('40900');
    assert.ok(sacramento);
    assert.equal(sacramento.name, 'Sacramento-Roseville-Folsom, CA Metro Area');
    assert.ok(Array.isArray(sacramento.rings));
    assert.ok(sacramento.rings.length > 0);
    assert.equal(pointInPolygon(sacramento.centroid.lat, sacramento.centroid.lon, sacramento), true);
});
