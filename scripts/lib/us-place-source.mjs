import { execFile as execFileCb } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { readZipEntryText } from './zip-entry.mjs';
import { loadTigerCbsaGeometries, pointInPolygon } from './tiger-cbsa-source.mjs';

const execFile = promisify(execFileCb);

function compactWhitespace(value) {
    return String(value ?? '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeText(value) {
    return compactWhitespace(value).toLowerCase();
}

function uniq(values) {
    return [...new Set(values.filter(Boolean))];
}

function stripPlaceSuffix(name) {
    return compactWhitespace(name)
        .replace(/\b(consolidated government|metro township|unified government|municipio|municipality|borough|village|town|city|cdp)\b$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

async function listZipEntries(zipPath) {
    const { stdout } = await execFile('unzip', ['-Z1', zipPath], {
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
    });
    return stdout.split('\n').map(value => value.trim()).filter(Boolean);
}

async function readGazetteerPlaceText(placesPath) {
    const pathStat = await stat(placesPath);
    if (pathStat.isDirectory()) {
        const entries = await readdir(placesPath);
        const fileNames = entries
            .filter(fileName => /^2024_gaz_place_\d{2}\.txt$/i.test(fileName))
            .sort();
        const texts = await Promise.all(fileNames.map(fileName => readFile(path.join(placesPath, fileName), 'utf8')));
        return texts
            .map((text, index) => index === 0 ? text : text.split(/\r?\n/).slice(1).join('\n'))
            .join('\n');
    }
    if (path.extname(placesPath).toLowerCase() !== '.zip')
        return readFile(placesPath, 'utf8');
    const entries = await listZipEntries(placesPath);
    const entryPath = entries.find(entry => /gaz_place_national\.txt$/i.test(entry))
        ?? entries.find(entry => entry.toLowerCase().endsWith('.txt'));
    if (!entryPath) {
        throw new Error(`Could not find a place gazetteer text entry inside ${path.basename(placesPath)}.`);
    }
    return readZipEntryText(placesPath, entryPath, { maxBuffer: 32 * 1024 * 1024 });
}

export function parseGazetteerPlaceText(text) {
    const lines = String(text ?? '')
        .split(/\r?\n/)
        .map(line => line.trimEnd())
        .filter(Boolean);
    if (lines.length === 0)
        return [];
    const headers = lines[0].split('\t').map(compactWhitespace);
    return lines.slice(1).map((line) => {
        const values = line.split('\t').map(compactWhitespace);
        return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    }).filter(row => Object.values(row).some(Boolean));
}

export function buildPlaceAliasesForMetro(row) {
    const shortName = stripPlaceSuffix(row.NAME);
    return uniq([
        shortName,
        row.NAME,
        shortName && row.USPS ? `${shortName}, ${row.USPS}` : null,
        row.NAME && row.USPS ? `${row.NAME}, ${row.USPS}` : null,
    ]);
}

function placeRowsToPoints(rows) {
    return rows.map(row => ({
        row,
        aliases: buildPlaceAliasesForMetro(row),
        lat: Number(row.INTPTLAT),
        lon: Number(row.INTPTLONG),
    })).filter(row => Number.isFinite(row.lat) && Number.isFinite(row.lon));
}

export function findContainingCbsa(place, cbsaGeometries) {
    const lat = Number(place.INTPTLAT ?? place.lat);
    const lon = Number(place.INTPTLONG ?? place.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon))
        return null;
    for (const geometry of cbsaGeometries.values()) {
        const bounds = geometry.bounds;
        if (!bounds)
            continue;
        if (lat < bounds.minLat || lat > bounds.maxLat || lon < bounds.minLon || lon > bounds.maxLon)
            continue;
        if (pointInPolygon(lat, lon, geometry))
            return geometry;
    }
    return null;
}

export async function loadUsPlaceMetroAliases(placesPath, cbsaBoundsPath) {
    const [text, geometries] = await Promise.all([
        readGazetteerPlaceText(placesPath),
        loadTigerCbsaGeometries(cbsaBoundsPath),
    ]);
    const places = placeRowsToPoints(parseGazetteerPlaceText(text));
    const aliasMap = new Map();
    for (const place of places) {
        const geometry = findContainingCbsa(place, geometries);
        if (!geometry)
            continue;
        for (const alias of place.aliases) {
            const key = `${normalizeText(alias)}\n${geometry.code}`;
            if (!alias || aliasMap.has(key))
                continue;
            aliasMap.set(key, {
                alias,
                regionId: `us-cbsa-${geometry.code}`,
            });
        }
    }
    return [...aliasMap.values()].sort((a, b) =>
        normalizeText(a.alias).localeCompare(normalizeText(b.alias)) || a.regionId.localeCompare(b.regionId));
}
