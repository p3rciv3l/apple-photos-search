import test from 'node:test';
import assert from 'node:assert/strict';
import { filterResultsByLocation, getResultUuid, normalizeText, parseLocationIntent } from '../dist/location.js';

test('normalizeText collapses spaces and non-breaking spaces', () => {
    assert.equal(normalizeText('  Boston\u00a0 Common  '), 'boston common');
});

test('parseLocationIntent splits semantic and location query when location matches exist', async () => {
    const intent = await parseLocationIntent('beer in sacramento', async (locationQuery) => {
        assert.equal(locationQuery, 'sacramento');
        return new Set(['11111111-1111-1111-1111-111111111111']);
    });
    assert.equal(intent.semanticQuery, 'beer');
    assert.equal(intent.locationQuery, 'sacramento');
    assert.deepEqual([...intent.locationUuids], ['11111111-1111-1111-1111-111111111111']);
});

test('parseLocationIntent falls back to semantic query when location has no metadata matches', async () => {
    const intent = await parseLocationIntent('white dog in middle earth', async () => new Set());
    assert.deepEqual(intent, { semanticQuery: 'white dog in middle earth' });
});

test('parseLocationIntent accepts state-level location matches', async () => {
    const intent = await parseLocationIntent('white dog in massachusetts', async () => new Set(['33333333-3333-3333-3333-333333333333']));
    assert.equal(intent.semanticQuery, 'white dog');
    assert.equal(intent.locationQuery, 'massachusetts');
});

test('parseLocationIntent supports comma-separated location queries', async () => {
    const intent = await parseLocationIntent('beer, charlotte', async () => new Set(['22222222-2222-2222-2222-222222222222']));
    assert.equal(intent.semanticQuery, 'beer');
    assert.equal(intent.locationQuery, 'charlotte');
});

test('parseLocationIntent leaves plain city queries semantic-only', async () => {
    const intent = await parseLocationIntent('roseville', async () => new Set(['44444444-4444-4444-4444-444444444444']));
    assert.deepEqual(intent, { semanticQuery: 'roseville' });
});

test('parseLocationIntent does not treat plain city tokens as location constraints without an explicit clause', async () => {
    const intent = await parseLocationIntent('davis beer', async () => new Set(['11111111-1111-1111-1111-111111111111']));
    assert.deepEqual(intent, { semanticQuery: 'davis beer' });
});

test('getResultUuid extracts asset UUIDs from result paths', () => {
    const uuid = getResultUuid({
        filePath: '/tmp/ABC/12345678-1234-1234-1234-1234567890AB.jpeg',
        score: 99,
    });
    assert.equal(uuid, '12345678-1234-1234-1234-1234567890AB');
});

test('filterResultsByLocation keeps only results with matching location UUIDs', () => {
    const results = [
        {
            filePath: '/photos/11111111-1111-1111-1111-111111111111.jpeg',
            score: 95,
        },
        {
            filePath: '/photos/22222222-2222-2222-2222-222222222222.jpeg',
            score: 90,
        },
        {
            filePath: '/photos/no-uuid-name.jpeg',
            score: 80,
        },
    ];
    const filtered = filterResultsByLocation(results, new Set(['22222222-2222-2222-2222-222222222222']));
    assert.deepEqual(filtered, [results[1]]);
});
