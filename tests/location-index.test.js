import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { clearGeoIndexCache, loadGeoIndex } from '../dist/location-index.js';
import { findMatchingRegions, pointInBounds } from '../dist/location-resolver.js';
import { buildCompiledGeoIndex } from '../scripts/lib/geo-index-builder.mjs';

test('loadGeoIndex loads compiled offline data', async () => {
    clearGeoIndexCache();
    const index = await loadGeoIndex();
    assert.equal(index.version, 1);
    assert.ok(index.regionById.has('country-us'));
    assert.ok(index.aliasMap.has('massachusetts'));
});

test('findMatchingRegions resolves aliases from compiled index', async () => {
    const index = await loadGeoIndex();
    assert.deepEqual(findMatchingRegions('massachusetts', index).map(region => region.id), ['us-ma']);
    assert.ok(findMatchingRegions('charlotte', index).some(region => region.id === 'us-cbsa-16740'));
    assert.deepEqual(findMatchingRegions('charlotte, nc', index).map(region => region.id), ['us-cbsa-16740']);
});

test('multi-city metro aliases resolve to the same metro region', async () => {
    const compiled = buildCompiledGeoIndex({
        seedIndex: {
            version: 1,
            regions: [
                {
                    id: 'country-us',
                    kind: 'country',
                    name: 'United States',
                    bounds: { minLat: 24.3, maxLat: 49.5, minLon: -125, maxLon: -66.9 },
                },
            ],
            aliases: [],
        },
        metroRows: [
            {
                id: 'us-cbsa-40900',
                kind: 'metro',
                name: 'Sacramento-Roseville-Folsom, CA',
                aliases: ['Sacramento', 'Roseville', 'Folsom'],
                parentIds: ['country-us'],
                bounds: { minLat: 38.1, maxLat: 39.1, minLon: -122.7, maxLon: -121.0 },
            },
        ],
    });
    const generatedFixturePath = path.join(os.tmpdir(), `sisi-metro-aliases-${process.pid}.json`);
    await fs.writeFile(generatedFixturePath, `${JSON.stringify(compiled, null, 2)}\n`);
    clearGeoIndexCache();
    const index = await loadGeoIndex(generatedFixturePath);
    assert.deepEqual(findMatchingRegions('sacramento', index).map(region => region.id), ['us-cbsa-40900']);
    assert.deepEqual(findMatchingRegions('roseville', index).map(region => region.id), ['us-cbsa-40900']);
    await fs.unlink(generatedFixturePath);
});

test('pointInBounds checks geographic containment against compiled bounds', async () => {
    const index = await loadGeoIndex();
    const massachusetts = index.regionById.get('us-ma');
    assert.equal(pointInBounds(42.3601, -71.0589, massachusetts.bounds), true);
    assert.equal(pointInBounds(38.5816, -121.4944, massachusetts.bounds), false);
});

test('loadGeoIndex accepts compiled alias rows with regionIds arrays', async () => {
    const generatedFixturePath = path.join(os.tmpdir(), `sisi-generated-compiled-geo-${process.pid}.json`);
    const compiled = buildCompiledGeoIndex({
        seedIndex: {
            version: 1,
            regions: [
                {
                    id: 'country-us',
                    kind: 'country',
                    name: 'United States',
                    bounds: { minLat: 24.3, maxLat: 49.5, minLon: -125, maxLon: -66.9 },
                },
                {
                    id: 'metro-sacramento',
                    kind: 'metro',
                    name: 'Sacramento Metro',
                    parentIds: ['country-us'],
                    bounds: { minLat: 38.1, maxLat: 39.1, minLon: -122.7, maxLon: -121.0 },
                },
            ],
            aliases: [],
        },
    });
    await fs.writeFile(generatedFixturePath, `${JSON.stringify(compiled, null, 2)}\n`);
    clearGeoIndexCache();
    const index = await loadGeoIndex(generatedFixturePath);
    assert.deepEqual(findMatchingRegions('sacramento metro', index).map(region => region.id), ['metro-sacramento']);
    await fs.unlink(generatedFixturePath);
});

test('loadGeoIndex resolves Sacramento and Roseville to the same metro from compiled alias rows', async () => {
    const generatedFixturePath = path.join(os.tmpdir(), `sisi-generated-sacramento-roseville-${process.pid}.json`);
    const compiled = {
        version: 1,
        regions: [
            {
                id: 'country-us',
                kind: 'country',
                name: 'United States',
                bounds: { minLat: 24.3, maxLat: 49.5, minLon: -125, maxLon: -66.9 },
            },
            {
                id: 'us-cbsa-40900',
                kind: 'metro',
                name: 'Sacramento-Roseville-Folsom, CA',
                parentIds: ['country-us'],
                bounds: { minLat: 38.1, maxLat: 39.1, minLon: -122.7, maxLon: -121.0 },
            },
        ],
        aliases: [
            { alias: 'sacramento', regionIds: ['us-cbsa-40900'] },
            { alias: 'roseville', regionIds: ['us-cbsa-40900'] },
            { alias: 'folsom', regionIds: ['us-cbsa-40900'] },
        ],
    };
    await fs.writeFile(generatedFixturePath, `${JSON.stringify(compiled, null, 2)}\n`);
    clearGeoIndexCache();
    const index = await loadGeoIndex(generatedFixturePath);
    assert.deepEqual(findMatchingRegions('sacramento', index).map(region => region.id), ['us-cbsa-40900']);
    assert.deepEqual(findMatchingRegions('roseville', index).map(region => region.id), ['us-cbsa-40900']);
    await fs.unlink(generatedFixturePath);
});
