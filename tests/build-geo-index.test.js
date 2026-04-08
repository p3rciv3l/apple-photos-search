import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

test('build:geo-index script converts Census-style metro fixture into compiled artifact', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sisi-geo-build-'));
    const outputPath = path.join(tempDir, 'compiled-index.json');
    const fixturePath = path.resolve('tests/fixtures/us-census-metros.tsv');
    const seedPath = path.resolve('data/geo/seed.json');
    await execFile(process.execPath, [
        'scripts/build-geo-index.mjs',
        '--seed', seedPath,
        '--metros', fixturePath,
        '--output', outputPath,
    ], {
        cwd: path.resolve('.'),
    });
    const compiled = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    assert.ok(compiled.regions.some(region => region.id === 'us-cbsa-40900'));
    assert.ok(compiled.regions.some(region => region.id === 'us-cbsa-16740'));
    assert.ok(compiled.aliases.some(alias => alias.alias === 'charlotte-concord-gastonia, nc-sc'));
    await fs.rm(tempDir, { recursive: true, force: true });
});

test('build:geo-index script accepts official Census workbook plus TIGER bounds when local raw files are present', async (t) => {
    const workbookPath = path.resolve('tmp/geo/us/list1_2023.xlsx');
    const cbsaBoundsPath = path.resolve('tmp/geo/us/tl_2024_us_cbsa.zip');
    const placesPath = path.resolve('tmp/geo/us/places');
    try {
        await Promise.all([fs.access(workbookPath), fs.access(cbsaBoundsPath), fs.access(placesPath)]);
    }
    catch {
        t.skip(`Official Census raw files are not available under ${path.resolve('tmp/geo/us')}`);
        return;
    }
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sisi-geo-build-raw-'));
    const outputPath = path.join(tempDir, 'compiled-index.json');
    const seedPath = path.resolve('data/geo/seed.json');
    await execFile(process.execPath, [
        'scripts/build-geo-index.mjs',
        '--seed', seedPath,
        '--metros', workbookPath,
        '--cbsa-bounds', cbsaBoundsPath,
        '--places', placesPath,
        '--output', outputPath,
    ], {
        cwd: path.resolve('.'),
    });
    const compiled = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    const sacramento = compiled.regions.find(region => region.id === 'us-cbsa-40900');
    assert.ok(sacramento);
    assert.equal(sacramento.name, 'Sacramento-Roseville-Folsom, CA');
    assert.ok(compiled.aliases.some(alias => alias.alias === 'roseville' && alias.regionIds.includes('us-cbsa-40900')));
    assert.ok(compiled.aliases.some(alias => alias.alias === 'citrus heights, ca' && alias.regionIds.includes('us-cbsa-40900')));
    assert.ok(compiled.aliases.some(alias => alias.alias === 'davis' && alias.regionIds.includes('us-cbsa-40900')));
    assert.ok(compiled.aliases.some(alias => alias.alias === 'rock hill' && alias.regionIds.includes('us-cbsa-16740')));
    assert.ok(sacramento.bounds);
    await fs.rm(tempDir, { recursive: true, force: true });
});
