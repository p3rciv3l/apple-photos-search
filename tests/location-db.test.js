import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { clearGeoIndexCache, loadGeoIndex } from '../dist/location-index.js';
import { findLocationMatches } from '../dist/location-db.js';
import { findMatchingRegions, pointInBounds } from '../dist/location-resolver.js';

const execFile = promisify(execFileCb);

test('findMatchingRegions resolves state aliases', async () => {
    clearGeoIndexCache();
    const index = await loadGeoIndex();
    const regions = findMatchingRegions('massachusetts', index);
    assert.ok(regions.length > 0);
    assert.equal(regions[0].id, 'us-ma');
    assert.deepEqual(findMatchingRegions('MA', index).map(region => region.id), ['us-ma']);
});

test('findMatchingRegions resolves country aliases', async () => {
    const index = await loadGeoIndex();
    assert.deepEqual(findMatchingRegions('usa', index).map(region => region.id), ['country-us']);
    assert.deepEqual(findMatchingRegions('united states', index).map(region => region.id), ['country-us']);
});

test('pointInBounds matches coordinates inside a named region', async () => {
    const index = await loadGeoIndex();
    const [massachusetts] = findMatchingRegions('massachusetts', index);
    assert.equal(pointInBounds(42.3601, -71.0589, massachusetts.bounds), true);
    assert.equal(pointInBounds(38.5816, -121.4944, massachusetts.bounds), false);
});

test('findLocationMatches falls back to metro alias metadata matches when compiled metro lacks bounds', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sisi-location-db-'));
    const previousCwd = process.cwd();
    const dbPath = path.join(tempDir, 'Photos.sqlite');
    const dataDir = path.join(tempDir, 'data', 'geo');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(path.join(dataDir, 'index.json'), `${JSON.stringify({
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
            },
        ],
        aliases: [
            { alias: 'sacramento', regionIds: ['us-cbsa-40900'] },
            { alias: 'roseville', regionIds: ['us-cbsa-40900'] },
            { alias: 'folsom', regionIds: ['us-cbsa-40900'] },
        ],
    }, null, 2)}\n`);
    await execFile('sqlite3', [dbPath, `
        CREATE TABLE ZMOMENT (Z_PK INTEGER PRIMARY KEY, ZTITLE TEXT, ZSUBTITLE TEXT);
        CREATE TABLE ZASSET (
            ZUUID TEXT PRIMARY KEY,
            ZMOMENT INTEGER,
            ZLATITUDE REAL,
            ZLONGITUDE REAL
        );
        INSERT INTO ZMOMENT (Z_PK, ZTITLE, ZSUBTITLE) VALUES (1, 'Roseville', 'California');
        INSERT INTO ZASSET (ZUUID, ZMOMENT, ZLATITUDE, ZLONGITUDE) VALUES ('uuid-roseville', 1, 38.7521, -121.2880);
    `]);
    process.chdir(tempDir);
    clearGeoIndexCache();
    try {
        const matches = await findLocationMatches('sacramento', undefined, dbPath);
        assert.deepEqual([...matches], ['uuid-roseville']);
    }
    finally {
        process.chdir(previousCwd);
        clearGeoIndexCache();
        await fs.rm(tempDir, { recursive: true, force: true });
    }
});

test('findLocationMatches prefers direct metadata matches when a place alias is nationally ambiguous', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sisi-location-db-ambiguous-'));
    const previousCwd = process.cwd();
    const dbPath = path.join(tempDir, 'Photos.sqlite');
    const dataDir = path.join(tempDir, 'data', 'geo');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(path.join(dataDir, 'index.json'), `${JSON.stringify({
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
                bounds: { minLat: 38.0, maxLat: 39.4, minLon: -122.6, maxLon: -119.8 },
            },
            {
                id: 'us-cbsa-23300',
                kind: 'metro',
                name: 'Davis Metro Example',
                parentIds: ['country-us'],
                bounds: { minLat: 43.0, maxLat: 44.0, minLon: -92.0, maxLon: -91.0 },
            },
        ],
        aliases: [
            { alias: 'davis', regionIds: ['us-cbsa-40900', 'us-cbsa-23300'] },
            { alias: 'davis, ca', regionIds: ['us-cbsa-40900'] },
        ],
    }, null, 2)}\n`);
    await execFile('sqlite3', [dbPath, `
        CREATE TABLE ZMOMENT (Z_PK INTEGER PRIMARY KEY, ZTITLE TEXT, ZSUBTITLE TEXT);
        CREATE TABLE ZASSET (
            ZUUID TEXT PRIMARY KEY,
            ZMOMENT INTEGER,
            ZLATITUDE REAL,
            ZLONGITUDE REAL
        );
        INSERT INTO ZMOMENT (Z_PK, ZTITLE, ZSUBTITLE) VALUES (1, 'Davis', 'California');
        INSERT INTO ZASSET (ZUUID, ZMOMENT, ZLATITUDE, ZLONGITUDE) VALUES ('uuid-davis-ca', 1, 38.5449, -121.7405);
    `]);
    process.chdir(tempDir);
    clearGeoIndexCache();
    try {
        const matches = await findLocationMatches('davis', undefined, dbPath);
        assert.deepEqual([...matches], ['uuid-davis-ca']);
    }
    finally {
        process.chdir(previousCwd);
        clearGeoIndexCache();
        await fs.rm(tempDir, { recursive: true, force: true });
    }
});
