import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile as execFileCb } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { PHOTOS_DB_PATH, findLocationMatches } from '../dist/location-db.js';

const execFile = promisify(execFileCb);
const shouldRun = process.env.SISI_LIVE_LOCATION_TESTS === '1' && existsSync(PHOTOS_DB_PATH);

function parsePrintedResults(stdout) {
    const lines = stdout.split('\n').map(line => line.trim()).filter(Boolean);
    const paths = [];
    for (let i = 0; i < lines.length; i += 2)
        paths.push(lines[i].split(' (')[0]);
    return paths;
}

function extractUuid(filePath) {
    return filePath.match(/([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})/i)?.[1];
}

test('live search results for sacramento resolve to sacramento-linked UUIDs', { skip: !shouldRun }, async () => {
    const { stdout } = await execFile('sisi', ['search', 'beer in sacramento', '--print', '--max', '15']);
    const uuids = parsePrintedResults(stdout).map(extractUuid).filter(Boolean);
    assert.ok(uuids.length > 0, 'expected printed results');
    const allowed = await findLocationMatches('sacramento');
    assert.ok(allowed.size > 0, 'expected sacramento location matches');
    for (const uuid of uuids)
        assert.ok(allowed.has(uuid), `result ${uuid} is not sacramento-linked`);
});

test('live search results for charlotte resolve to charlotte-linked UUIDs', { skip: !shouldRun }, async () => {
    const { stdout } = await execFile('sisi', ['search', 'beer in charlotte', '--print', '--max', '15']);
    const uuids = parsePrintedResults(stdout).map(extractUuid).filter(Boolean);
    assert.ok(uuids.length > 0, 'expected printed results');
    const allowed = await findLocationMatches('charlotte');
    assert.ok(allowed.size > 0, 'expected charlotte location matches');
    for (const uuid of uuids)
        assert.ok(allowed.has(uuid), `result ${uuid} is not charlotte-linked`);
});

test('live search results for massachusetts resolve to region-linked UUIDs', { skip: !shouldRun }, async () => {
    const { stdout } = await execFile('sisi', ['search', 'beer in massachusetts', '--print', '--max', '15']);
    const uuids = parsePrintedResults(stdout).map(extractUuid).filter(Boolean);
    assert.ok(uuids.length > 0, 'expected printed results');
    const allowed = await findLocationMatches('massachusetts');
    assert.ok(allowed.size > 0, 'expected massachusetts location matches');
    for (const uuid of uuids)
        assert.ok(allowed.has(uuid), `result ${uuid} is not massachusetts-linked`);
});
