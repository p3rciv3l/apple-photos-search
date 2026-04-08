import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { clearGeoIndexCache, loadGeoIndex } from '../dist/location-index.js';
import { findMatchingRegions, pointInBounds } from '../dist/location-resolver.js';

const fixturePath = path.resolve('tests/fixtures/geo-index.hierarchy.json');

test('compiled geo index preserves metro -> state -> country hierarchy', async () => {
    clearGeoIndexCache();
    const index = await loadGeoIndex(fixturePath);
    const metro = index.regionById.get('metro-sacramento');
    const state = index.regionById.get('us-ca');
    const country = index.regionById.get('country-us');

    assert.deepEqual(metro.parentIds, ['us-ca', 'country-us']);
    assert.deepEqual(state.parentIds, ['country-us']);
    assert.equal(country.kind, 'country');
    assert.equal(pointInBounds(38.58, -121.49, metro.bounds), true);
    assert.equal(pointInBounds(37.78, -122.42, metro.bounds), false);
    assert.deepEqual(findMatchingRegions('sacramento', index).map(region => region.id), ['metro-sacramento']);
});

test('compiled geo index resolves state and country aliases independently', async () => {
    const index = await loadGeoIndex(fixturePath);
    assert.deepEqual(findMatchingRegions('california', index).map(region => region.id), ['us-ca']);
    assert.deepEqual(findMatchingRegions('usa', index).map(region => region.id), ['country-us']);
});
