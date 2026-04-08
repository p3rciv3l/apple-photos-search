#!/usr/bin/env node
import { Builtins, Cli, Command, Option } from 'clipanion';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { getPackageJson, shortPath } from './fs.js';
import { index, search, listIndex, removeIndex, getIndexedImages } from './sisi.js';
import { parseLocationIntent, getResultUuid, filterResultsByLocation } from './location.js';
import { getPhotoMetadata, findLocationMatches } from './location-db.js';
import { presentResults } from './search.js';

const execFile = promisify(execFileCb);

async function searchWithMetadata(query, { maxResults, targetDir }) {
    const intent = await parseLocationIntent(query, (locationQuery) => findLocationMatches(locationQuery));
    const semanticQuery = intent.semanticQuery;
    if (!semanticQuery && !intent.locationUuids?.size) return;
    if (semanticQuery) {
        const searchLimit = intent.locationUuids?.size
            ? Math.max(maxResults * 25, maxResults)
            : maxResults;
        let results = await search(semanticQuery, {
            maxResults: searchLimit,
            targetDir,
        });
        if (!results) return;
        if (intent.locationUuids?.size) {
            results = filterResultsByLocation(results, intent.locationUuids)
                .slice(0, maxResults);
        }
        return {
            results,
            queryForDisplay: query,
            semanticQuery,
            locationQuery: intent.locationQuery,
        };
    }
    if (intent.locationUuids?.size) {
        const images = await getIndexedImages(targetDir);
        const results = images
            .map(image => ({ filePath: image.filePath, score: 100 }))
            .filter(result => {
                const uuid = getResultUuid(result);
                return uuid ? intent.locationUuids.has(uuid) : false;
            })
            .slice(0, maxResults);
        return {
            results,
            queryForDisplay: query,
            semanticQuery: '',
            locationQuery: intent.locationQuery,
        };
    }
}

function parseDatePart(str, isEnd) {
    const parts = str.trim().split('/');
    if (parts.length === 2) {
        // M/YY format (month/year)
        const month = parseInt(parts[0]);
        let year = parseInt(parts[1]);
        if (year < 100) year += 2000;
        if (isEnd) {
            // Last day of the month
            const d = new Date(year, month, 0); // day 0 of next month = last day of this month
            d.setHours(23, 59, 59, 999);
            return d;
        }
        return new Date(year, month - 1, 1);
    }
    if (parts.length === 3) {
        // M/D/YY format
        const month = parseInt(parts[0]);
        const day = parseInt(parts[1]);
        let year = parseInt(parts[2]);
        if (year < 100) year += 2000;
        const d = new Date(year, month - 1, day);
        if (isNaN(d.getTime())) {
            console.error(`Invalid date: "${str}"`);
            process.exit(1);
        }
        return d;
    }
    console.error(`Invalid date: "${str}" (use M/YY or M/D/YY)`);
    process.exit(1);
}

function parseDateRange(str) {
    const [startStr, endStr] = str.split(',');
    if (!startStr) {
        console.error(`Invalid date range: "${str}" (use start,end or just start e.g. 5/25)`);
        process.exit(1);
    }
    const start = parseDatePart(startStr, false);
    const end = endStr ? parseDatePart(endStr, true) : new Date();
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

async function filterResultsByDate(results, { start, end }) {
    const uuidRegex = /([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})/i;
    const uuids = results.map(r => r.filePath.match(uuidRegex)?.[1]).filter(Boolean);
    const metaMap = await getPhotoMetadata([...new Set(uuids)]);
    return results.filter(r => {
        const uuid = r.filePath.match(uuidRegex)?.[1];
        if (!uuid) return true;
        const meta = metaMap.get(uuid);
        if (!meta?.date) return false;
        return meta.date >= start && meta.date <= end;
    });
}

function formatMeta(meta) {
    const parts = [];
    if (meta.date) {
        parts.push(meta.date.toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
        }));
    }
    if (meta.title) {
        parts.push(meta.subtitle ? `${meta.title} / ${meta.subtitle}` : meta.title);
    }
    if (meta.lat != null && meta.lon != null
        && (meta.lat !== 0 || meta.lon !== 0)
        && meta.lat !== -180 && meta.lon !== -180) {
        parts.push(`${meta.lat.toFixed(4)}, ${meta.lon.toFixed(4)}`);
    }
    if (meta.trashed) parts.push('[TRASHED]');
    if (meta.hidden) parts.push('[HIDDEN]');
    return parts.length > 0 ? ` (${parts.join(' | ')})` : '';
}

export class IndexCommand extends Command {
    static paths = [['index']];
    static usage = Command.Usage({
        description: 'Build or update index for images under target directory.',
        examples: [
            [
                'Build index for ~/Pictures/',
                '$0 index ~/Pictures/',
            ],
        ]
    });
    target = Option.String();
    async execute() {
        await index(this.target);
    }
}
export class SearchCommand extends Command {
    static paths = [['search']];
    static usage = Command.Usage({
        description: 'Search the query string from indexed images.',
        examples: [
            [
                'Search pictures from all indexed images:',
                '$0 search cat',
            ],
            [
                'Search from the ~/Pictures/ directory:',
                '$0 search cat --in ~/Pictures/',
            ],
            [
                'Search images with remote image:',
                '$0 search https://images.pexels.com/photos/45201/kitty-cat-kitten-pet-45201.jpeg',
            ],
            [
                'Search images with local image:',
                '$0 search file:///Users/Your/Pictures/cat.jpg',
            ],
            [
                'Search photos from summer 2024:',
                '$0 search cat --date 6/1/24,8/31/24',
            ],
        ]
    });
    query = Option.String();
    target = Option.String('--in', { description: 'The directory where images are searched.' });
    max = Option.String('--max', '20', { description: 'The maximum number of results to return.' });
    print = Option.Boolean('--print', { description: 'Print the results to stdout.' });
    date = Option.String('--date', { description: 'Date range as start,end (e.g. 3/1/24,6/1/24).' });
    async execute() {
        const dateRange = this.date ? parseDateRange(this.date) : null;
        const max = parseInt(this.max);
        const searchResponse = await searchWithMetadata(this.query, {
            maxResults: dateRange ? max * 10 : max,
            targetDir: this.target,
        });
        const results = searchResponse?.results;
        if (!results) {
            const target = this.target ?? '<target>';
            console.error(`No images in index, please run "sisi index ${target}" first.`);
            return;
        }
        let filtered = results;
        if (dateRange) {
            filtered = await filterResultsByDate(results, dateRange);
            filtered = filtered.slice(0, max);
        }
        if (filtered.length == 0) {
            console.error('There is no matching images');
            return;
        }
        if (this.print) {
            // Extract UUIDs and fetch metadata for --print mode
            const uuids = filtered.map(r => getResultUuid(r)).filter(Boolean);
            const metaMap = await getPhotoMetadata(uuids);
            console.log(filtered.map(r => {
                const uuid = getResultUuid(r);
                const meta = uuid ? metaMap.get(uuid) : null;
                const metaStr = meta ? formatMeta(meta) : '';
                return `${shortPath(r.filePath)}${metaStr}\n${r.score.toFixed(2)}`;
            }).join('\n'));
            return;
        }
        console.log('Showing results in your browser...');
        await presentResults(searchResponse.queryForDisplay, filtered);
    }
}
export class ListIndexCommand extends Command {
    static paths = [['list-index']];
    static usage = Command.Usage({
        description: 'List the directories in the index.',
    });
    async execute() {
        const results = await listIndex();
        if (results.length > 0)
            console.log(results.map(shortPath).join('\n'));
    }
}
export class RemoveIndexCommand extends Command {
    static paths = [['remove-index']];
    static usage = Command.Usage({
        description: 'Remove index for all items under target directory.',
        examples: [
            [
                'Remove index for everything under ~/Pictures/',
                '$0 remove-index ~/Pictures/',
            ],
        ]
    });
    target = Option.String();
    async execute() {
        const removed = await removeIndex(this.target);
        for (const dir of removed)
            console.log('Index deleted:', dir);
    }
}
export class AlbumCommand extends Command {
    static paths = [['album']];
    static usage = Command.Usage({
        description: 'Search images and create an Apple Photos album with the results.',
        examples: [
            [
                'Create an album of cat photos:',
                '$0 album cat',
            ],
            [
                'Create an album with at most 10 results:',
                '$0 album "sunset at beach" --max 10',
            ],
        ]
    });
    query = Option.String();
    target = Option.String('--in', { description: 'The directory where images are searched.' });
    max = Option.String('--max', '20', { description: 'The maximum number of results to return.' });
    date = Option.String('--date', { description: 'Date range as start,end (e.g. 3/1/24,6/1/24).' });
    async execute() {
        const dateRange = this.date ? parseDateRange(this.date) : null;
        const max = parseInt(this.max);
        const searchResponse = await searchWithMetadata(this.query, {
            maxResults: dateRange ? max * 10 : max,
            targetDir: this.target,
        });
        const results = searchResponse?.results;
        if (!results) {
            const target = this.target ?? '<target>';
            console.error(`No images in index, please run "sisi index ${target}" first.`);
            return;
        }
        if (dateRange) {
            const filtered = await filterResultsByDate(results, dateRange);
            results.length = 0;
            results.push(...filtered.slice(0, max));
        }
        if (results.length === 0) {
            console.error('There are no matching images.');
            return;
        }
        const albumName = this.query;
        const uuidRegex = /([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})/i;
        const uuids = results
            .map(r => {
                const match = r.filePath.match(uuidRegex);
                return match ? match[1] : null;
            })
            .filter(Boolean);
        if (uuids.length === 0) {
            console.error('Could not extract photo UUIDs from search results.');
            return;
        }
        // Filter out trashed/hidden photos and show metadata
        const metaMap = await getPhotoMetadata([...new Set(uuids)]);
        const validUuids = [];
        let skippedCount = 0;
        for (const uuid of [...new Set(uuids)]) {
            const meta = metaMap.get(uuid);
            if (meta?.trashed || meta?.hidden) {
                skippedCount++;
                console.log(`  Skipping ${meta.filename ?? uuid}${formatMeta(meta)}`);
            } else {
                validUuids.push(uuid);
                if (meta) {
                    console.log(`  Adding ${meta.filename ?? uuid}${formatMeta(meta)}`);
                }
            }
        }
        if (skippedCount > 0) {
            console.log(`Skipped ${skippedCount} trashed/hidden photo(s).`);
        }
        if (validUuids.length === 0) {
            console.error('No valid (non-trashed, non-hidden) photos to add.');
            return;
        }
        const mediaItemIds = validUuids.map(id => `"${id}/L0/001"`).join(', ');
        const applescript = `
tell application "Photos"
    activate
    set newAlbum to make new album named "${albumName.replace(/"/g, '\\"')}"
    set idList to {${mediaItemIds}}
    set addedCount to 0
    repeat with photoId in idList
        try
            set thePhoto to media item id (photoId as text)
            add {thePhoto} to newAlbum
            set addedCount to addedCount + 1
        end try
    end repeat
    return addedCount as text
end tell`;
        console.log(`Creating album "${albumName}" with ${validUuids.length} photos...`);
        try {
            const { stdout } = await execFile('osascript', ['-e', applescript]);
            const addedCount = parseInt(stdout.trim()) || validUuids.length;
            console.log(`Album "${albumName}" created with ${addedCount} photo(s).`);
        } catch (error) {
            console.error('Failed to create album:', error.stderr || error.message);
        }
    }
}
const cli = new Cli({
    binaryName: 'sisi',
    binaryLabel: 'Semantic Image Search CLI',
    binaryVersion: getPackageJson().version,
});
cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);
cli.register(IndexCommand);
cli.register(SearchCommand);
cli.register(ListIndexCommand);
cli.register(RemoveIndexCommand);
cli.register(AlbumCommand);
cli.runExit(process.argv.slice(2)).then(() => process.exit());
