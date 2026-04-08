import { execFile as execFileCb } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { promisify } from 'node:util';
import { normalizeText, escapeSqlString } from './location.js';
import { loadGeoIndex } from './location-index.js';
import { expandRegionsWithDescendants, findMatchingRegions, pointInBounds } from './location-resolver.js';

const execFile = promisify(execFileCb);
export const PHOTOS_DB_PATH = `${homedir()}/Pictures/Photos Library.photoslibrary/database/Photos.sqlite`;

export async function queryPhotosDb(sql, dbPath = PHOTOS_DB_PATH) {
    if (!existsSync(dbPath))
        return [];
    try {
        const { stdout } = await execFile('sqlite3', ['-json', dbPath, sql]);
        return JSON.parse(stdout);
    }
    catch {
        return [];
    }
}

export async function getPhotoMetadata(uuids, dbPath = PHOTOS_DB_PATH) {
    if (uuids.length === 0)
        return new Map();
    const quoted = uuids.map(u => `'${escapeSqlString(u)}'`).join(',');
    const rows = await queryPhotosDb(`
        SELECT a.ZUUID, a.ZTRASHEDSTATE, a.ZHIDDEN, a.ZDATECREATED,
               a.ZLATITUDE, a.ZLONGITUDE, a.ZFILENAME,
               m.ZTITLE, m.ZSUBTITLE
        FROM ZASSET a
        LEFT JOIN ZMOMENT m ON a.ZMOMENT = m.Z_PK
        WHERE a.ZUUID IN (${quoted})
    `, dbPath);
    const map = new Map();
    for (const row of rows) {
        const date = row.ZDATECREATED != null
            ? new Date((row.ZDATECREATED + 978307200) * 1000)
            : null;
        map.set(row.ZUUID, {
            trashed: row.ZTRASHEDSTATE === 1,
            hidden: row.ZHIDDEN === 1,
            date,
            lat: row.ZLATITUDE,
            lon: row.ZLONGITUDE,
            filename: row.ZFILENAME,
            title: row.ZTITLE,
            subtitle: row.ZSUBTITLE,
        });
    }
    return map;
}

function isValidCoordinate(lat, lon) {
    return lat != null && lon != null
        && lat !== -180 && lon !== -180
        && (lat !== 0 || lon !== 0);
}

function toRadians(value) {
    return value * Math.PI / 180;
}

function haversineKm(aLat, aLon, bLat, bLon) {
    const dLat = toRadians(bLat - aLat);
    const dLon = toRadians(bLon - aLon);
    const lat1 = toRadians(aLat);
    const lat2 = toRadians(bLat);
    const sinLat = Math.sin(dLat / 2);
    const sinLon = Math.sin(dLon / 2);
    const h = sinLat * sinLat
        + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function computeBroadRadiusKm(seedPoints) {
    if (seedPoints.length < 2)
        return 25;
    let maxDistance = 0;
    for (let i = 0; i < seedPoints.length; ++i) {
        for (let j = i + 1; j < seedPoints.length; ++j) {
            maxDistance = Math.max(maxDistance, haversineKm(
                seedPoints[i].lat,
                seedPoints[i].lon,
                seedPoints[j].lat,
                seedPoints[j].lon,
            ));
        }
    }
    return Math.min(Math.max(maxDistance + 10, 25), 100);
}

async function findPhotosMomentMatchesForTerms(terms, uuids, dbPath = PHOTOS_DB_PATH) {
    const normalizedTerms = [...new Set((terms ?? []).map(normalizeText).filter(Boolean))];
    if (normalizedTerms.length === 0)
        return new Set();
    const whereClause = normalizedTerms
        .map(term => {
            const escaped = escapeSqlString(term);
            return `(
                lower(replace(IFNULL(m.ZTITLE, ''), char(160), ' ')) LIKE '%${escaped}%'
                OR lower(replace(IFNULL(m.ZSUBTITLE, ''), char(160), ' ')) LIKE '%${escaped}%'
            )`;
        })
        .join(' OR ');
    const uuidClause = uuids?.length
        ? `AND a.ZUUID IN (${uuids.map(u => `'${escapeSqlString(u)}'`).join(',')})`
        : '';
    const exactRows = await queryPhotosDb(`
        SELECT DISTINCT a.ZUUID, a.ZLATITUDE, a.ZLONGITUDE
        FROM ZASSET a
        LEFT JOIN ZMOMENT m ON a.ZMOMENT = m.Z_PK
        WHERE (${whereClause})
        ${uuidClause}
    `, dbPath);
    const matches = new Set(exactRows.map(row => row.ZUUID).filter(Boolean));
    const seedPoints = exactRows
        .filter(row => isValidCoordinate(row.ZLATITUDE, row.ZLONGITUDE))
        .map(row => ({ lat: row.ZLATITUDE, lon: row.ZLONGITUDE }));
    if (seedPoints.length === 0)
        return matches;
    const radiusKm = computeBroadRadiusKm(seedPoints);
    const latitudes = seedPoints.map(point => point.lat);
    const longitudes = seedPoints.map(point => point.lon);
    const avgLat = latitudes.reduce((sum, value) => sum + value, 0) / latitudes.length;
    const latDelta = radiusKm / 111;
    const lonDelta = radiusKm / (111 * Math.max(Math.cos(toRadians(avgLat)), 0.2));
    const nearbyRows = await queryPhotosDb(`
        SELECT DISTINCT a.ZUUID, a.ZLATITUDE, a.ZLONGITUDE
        FROM ZASSET a
        WHERE a.ZLATITUDE BETWEEN ${Math.min(...latitudes) - latDelta} AND ${Math.max(...latitudes) + latDelta}
          AND a.ZLONGITUDE BETWEEN ${Math.min(...longitudes) - lonDelta} AND ${Math.max(...longitudes) + lonDelta}
          AND a.ZLATITUDE != -180 AND a.ZLONGITUDE != -180
          ${uuidClause}
    `, dbPath);
    for (const row of nearbyRows) {
        if (!isValidCoordinate(row.ZLATITUDE, row.ZLONGITUDE))
            continue;
        for (const seed of seedPoints) {
            if (haversineKm(seed.lat, seed.lon, row.ZLATITUDE, row.ZLONGITUDE) <= radiusKm) {
                matches.add(row.ZUUID);
                break;
            }
        }
    }
    return matches;
}

async function findIndexMatches(locationQuery, uuids, dbPath = PHOTOS_DB_PATH) {
    const geoIndex = await loadGeoIndex();
    const matchedRegions = findMatchingRegions(locationQuery, geoIndex);
    if (matchedRegions.length === 0)
        return new Set();
    if (matchedRegions.length > 1) {
        const exactTextMatches = await findPhotosMomentMatchesForTerms([locationQuery], uuids, dbPath);
        if (exactTextMatches.size > 0)
            return exactTextMatches;
    }
    const regions = expandRegionsWithDescendants(matchedRegions, geoIndex);
    const uuidClause = uuids?.length
        ? `AND a.ZUUID IN (${uuids.map(u => `'${escapeSqlString(u)}'`).join(',')})`
        : '';
    const seen = new Set();
    for (const region of regions) {
        if (region.bounds) {
            const rows = await queryPhotosDb(`
                SELECT DISTINCT a.ZUUID, a.ZLATITUDE, a.ZLONGITUDE
                FROM ZASSET a
                WHERE a.ZLATITUDE BETWEEN ${region.bounds.minLat} AND ${region.bounds.maxLat}
                  AND a.ZLONGITUDE BETWEEN ${region.bounds.minLon} AND ${region.bounds.maxLon}
                  AND a.ZLATITUDE != -180 AND a.ZLONGITUDE != -180
                  ${uuidClause}
            `, dbPath);
            for (const row of rows) {
                if (!isValidCoordinate(row.ZLATITUDE, row.ZLONGITUDE))
                    continue;
                if (pointInBounds(row.ZLATITUDE, row.ZLONGITUDE, region.bounds))
                    seen.add(row.ZUUID);
            }
            continue;
        }
        const aliases = geoIndex.aliasesByRegionId?.get(region.id) ?? [region.name];
        const aliasMatches = await findPhotosMomentMatchesForTerms(aliases, uuids, dbPath);
        for (const uuid of aliasMatches) {
            seen.add(uuid);
        }
    }
    return seen;
}

async function findPhotosMomentMatches(locationQuery, uuids, dbPath = PHOTOS_DB_PATH) {
    return findPhotosMomentMatchesForTerms([locationQuery], uuids, dbPath);
}

export async function findLocationMatches(locationQuery, uuids, dbPath = PHOTOS_DB_PATH) {
    const indexMatches = await findIndexMatches(locationQuery, uuids, dbPath);
    if (indexMatches.size > 0)
        return indexMatches;
    return findPhotosMomentMatches(locationQuery, uuids, dbPath);
}
