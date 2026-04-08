import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
    buildPlaceAliasesForMetro,
    findContainingCbsa,
    loadUsPlaceMetroAliases,
    parseGazetteerPlaceText,
} from '../scripts/lib/us-place-source.mjs';

test('parseGazetteerPlaceText parses Census gazetteer rows', () => {
    const rows = parseGazetteerPlaceText([
        'USPS\tGEOID\tNAME\tINTPTLAT\tINTPTLONG',
        'CA\t0622666\tElk Grove city\t38.408799\t-121.371617',
    ].join('\n'));
    assert.deepEqual(rows, [{
        USPS: 'CA',
        GEOID: '0622666',
        NAME: 'Elk Grove city',
        INTPTLAT: '38.408799',
        INTPTLONG: '-121.371617',
    }]);
});

test('buildPlaceAliasesForMetro strips common place suffixes and keeps state forms', () => {
    const aliases = buildPlaceAliasesForMetro({
        NAME: 'Huntersville town',
        USPS: 'NC',
    });
    assert.ok(aliases.includes('Huntersville'));
    assert.ok(aliases.includes('Huntersville town'));
    assert.ok(aliases.includes('Huntersville, NC'));
    assert.ok(aliases.includes('Huntersville town, NC'));
});

test('findContainingCbsa matches a place centroid into a CBSA polygon', () => {
    const matched = findContainingCbsa({
        INTPTLAT: '38.4',
        INTPTLONG: '-121.4',
    }, new Map([['40900', {
        code: '40900',
        bounds: { minLat: 38, maxLat: 39, minLon: -122, maxLon: -121 },
        rings: [[
            { lat: 38, lon: -122 },
            { lat: 39, lon: -122 },
            { lat: 39, lon: -121 },
            { lat: 38, lon: -121 },
            { lat: 38, lon: -122 },
        ]],
    }]]));
    assert.equal(matched?.code, '40900');
});

test('loadUsPlaceMetroAliases maps nationwide place names onto CBSAs when raw files are present', async (t) => {
    const placesPath = path.resolve('tmp/geo/us/places');
    const cbsaZipPath = path.resolve('tmp/geo/us/tl_2024_us_cbsa.zip');
    try {
        await Promise.all([fs.access(placesPath), fs.access(cbsaZipPath)]);
    }
    catch {
        t.skip(`Official Census place/CBSA raw files are not available under ${path.resolve('tmp/geo/us')}`);
        return;
    }
    const aliasRows = await loadUsPlaceMetroAliases(placesPath, cbsaZipPath);
    assert.ok(aliasRows.some(row => row.alias === 'Elk Grove, CA' && row.regionId === 'us-cbsa-40900'));
    assert.ok(aliasRows.some(row => row.alias === 'Huntersville, NC' && row.regionId === 'us-cbsa-16740'));
    assert.ok(aliasRows.some(row => row.alias === 'Citrus Heights, CA' && row.regionId === 'us-cbsa-40900'));
});
