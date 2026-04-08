import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseCensusMetroText, parseCensusMetroWorkbook, buildMetroIndexPayload } from '../scripts/lib/us-metro-source.mjs';
import { buildCompiledGeoIndex } from '../scripts/lib/geo-index-builder.mjs';

const fixturePath = path.resolve('tests/fixtures/us-census-metros.tsv');

test('parseCensusMetroText normalizes Census metro rows', async () => {
    const text = await fs.readFile(fixturePath, 'utf8');
    const metros = parseCensusMetroText(text, {
        year: 2024,
        dataset: 'census-delineation-fixture',
        revision: 'fixture',
    });
    assert.equal(metros.length, 2);
    assert.equal(metros[0].id, 'us-cbsa-40900');
    assert.equal(metros[0].metroType, 'cbsa');
    assert.equal(metros[0].name, 'Sacramento-Roseville-Folsom, CA');
    assert.ok(metros[0].aliases.includes('Sacramento-Roseville-Folsom, CA'));
    assert.ok(metros[0].aliases.includes('Sacramento-Roseville-Folsom metro'));
    assert.ok(metros[0].aliases.includes('Sacramento'));
    assert.ok(metros[0].aliases.includes('Roseville'));
    assert.ok(metros[0].aliases.includes('Folsom'));
    assert.deepEqual(metros[0].bounds, {
        minLat: 38.1,
        maxLat: 39.1,
        minLon: -122.7,
        maxLon: -121,
    });
});

test('buildMetroIndexPayload produces region and alias rows for metros', async () => {
    const text = await fs.readFile(fixturePath, 'utf8');
    const metros = parseCensusMetroText(text);
    const payload = buildMetroIndexPayload(metros);
    assert.equal(payload.regions.length, 2);
    assert.ok(payload.aliases.some(alias => alias.alias === 'Charlotte-Concord-Gastonia, NC-SC'));
    assert.ok(payload.aliases.some(alias => alias.alias === 'Roseville'));
});

test('buildCompiledGeoIndex merges normalized metro rows into compiled artifact', async () => {
    const text = await fs.readFile(fixturePath, 'utf8');
    const metros = parseCensusMetroText(text);
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
            aliases: [{ alias: 'usa', regionId: 'country-us' }],
        },
        metroRows: metros,
    });
    assert.ok(compiled.regions.some(region => region.id === 'us-cbsa-40900'));
    assert.ok(compiled.aliases.some(alias => alias.alias === 'sacramento-roseville-folsom, ca'));
    assert.ok(compiled.aliases.some(alias => alias.alias === 'roseville'));
});

test('parseCensusMetroWorkbook aggregates official Census workbook rows into metro aliases', async (t) => {
    const workbookPath = path.resolve('tmp/geo/us/list1_2023.xlsx');
    const cbsaBoundsPath = path.resolve('tmp/geo/us/tl_2024_us_cbsa.zip');
    try {
        await Promise.all([fs.access(workbookPath), fs.access(cbsaBoundsPath)]);
    }
    catch {
        t.skip(`Official Census raw files are not available under ${path.resolve('tmp/geo/us')}`);
        return;
    }
    const metros = await parseCensusMetroWorkbook(workbookPath, {
        dataset: 'census-delineation-workbook',
        revision: 'list1_2023.xlsx',
        cbsaBoundsPath,
    });
    const sacramento = metros.find(metro => metro.id === 'us-cbsa-40900');
    const charlotte = metros.find(metro => metro.id === 'us-cbsa-16740');
    assert.ok(sacramento);
    assert.ok(charlotte);
    assert.equal(sacramento.name, 'Sacramento-Roseville-Folsom, CA');
    assert.ok(sacramento.aliases.includes('Sacramento'));
    assert.ok(sacramento.aliases.includes('Roseville'));
    assert.ok(!sacramento.aliases.includes('Sacramento-Roseville-Folsom, CA, CA'));
    assert.ok(sacramento.components.includes('Sacramento County'));
    assert.ok(sacramento.components.includes('Placer County'));
    assert.ok(sacramento.parentIds.includes('us-ca'));
    assert.deepEqual(sacramento.bounds, {
        minLat: 38.018421,
        maxLat: 39.316496,
        minLon: -122.422048,
        maxLon: -119.877248,
    });
    assert.equal(charlotte.name, 'Charlotte-Concord-Gastonia, NC-SC');
    assert.ok(charlotte.aliases.includes('Charlotte'));
    assert.ok(charlotte.aliases.includes('Concord'));
    assert.ok(charlotte.aliases.includes('Gastonia'));
    assert.ok(charlotte.parentIds.includes('us-nc'));
    assert.ok(charlotte.parentIds.includes('us-sc'));
});
