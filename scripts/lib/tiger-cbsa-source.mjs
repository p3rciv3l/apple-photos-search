import { readZipEntry } from './zip-entry.mjs';

function compactWhitespace(value) {
    return String(value ?? '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseDbfFields(buffer) {
    const fields = [];
    for (let offset = 32; buffer[offset] !== 0x0D; offset += 32) {
        const name = buffer.subarray(offset, offset + 11)
            .toString('ascii')
            .replace(/\0+$/g, '')
            .trim();
        fields.push({
            name,
            length: buffer[offset + 16],
        });
    }
    return fields;
}

function parseDbfRecords(buffer) {
    const recordCount = buffer.readUInt32LE(4);
    const headerLength = buffer.readUInt16LE(8);
    const recordLength = buffer.readUInt16LE(10);
    const fields = parseDbfFields(buffer);
    const records = [];
    for (let recordIndex = 0; recordIndex < recordCount; ++recordIndex) {
        const offset = headerLength + recordIndex * recordLength;
        if (buffer[offset] === 0x2A)
            continue;
        let fieldOffset = offset + 1;
        const record = {};
        for (const field of fields) {
            const raw = buffer.subarray(fieldOffset, fieldOffset + field.length);
            record[field.name] = compactWhitespace(raw.toString('utf8'));
            fieldOffset += field.length;
        }
        records.push(record);
    }
    return records;
}

function parseShapeRecordBounds(buffer) {
    if (buffer.length < 36)
        return null;
    const shapeType = buffer.readInt32LE(0);
    if (shapeType === 0)
        return null;
    return {
        minLon: buffer.readDoubleLE(4),
        minLat: buffer.readDoubleLE(12),
        maxLon: buffer.readDoubleLE(20),
        maxLat: buffer.readDoubleLE(28),
    };
}

function parsePolygonParts(buffer) {
    if (buffer.length < 44)
        return [];
    const shapeType = buffer.readInt32LE(0);
    if (shapeType === 0 || ![5, 15, 25].includes(shapeType))
        return [];
    const partCount = buffer.readInt32LE(36);
    const pointCount = buffer.readInt32LE(40);
    const partsOffset = 44;
    const pointsOffset = partsOffset + partCount * 4;
    const partIndexes = [];
    for (let index = 0; index < partCount; ++index) {
        partIndexes.push(buffer.readInt32LE(partsOffset + index * 4));
    }
    partIndexes.push(pointCount);
    const rings = [];
    for (let partIndex = 0; partIndex < partCount; ++partIndex) {
        const start = partIndexes[partIndex];
        const end = partIndexes[partIndex + 1];
        const ring = [];
        for (let pointIndex = start; pointIndex < end; ++pointIndex) {
            const pointOffset = pointsOffset + pointIndex * 16;
            ring.push({
                lon: buffer.readDoubleLE(pointOffset),
                lat: buffer.readDoubleLE(pointOffset + 8),
            });
        }
        if (ring.length > 0)
            rings.push(ring);
    }
    return rings;
}

function parseShapefileBounds(buffer) {
    const bounds = [];
    for (let offset = 100; offset + 8 <= buffer.length;) {
        const contentLengthWords = buffer.readUInt32BE(offset + 4);
        const contentLength = contentLengthWords * 2;
        const recordStart = offset + 8;
        const recordEnd = recordStart + contentLength;
        bounds.push(parseShapeRecordBounds(buffer.subarray(recordStart, recordEnd)));
        offset = recordEnd;
    }
    return bounds;
}

function parseShapefileGeometries(buffer) {
    const geometries = [];
    for (let offset = 100; offset + 8 <= buffer.length;) {
        const contentLengthWords = buffer.readUInt32BE(offset + 4);
        const contentLength = contentLengthWords * 2;
        const recordStart = offset + 8;
        const recordEnd = recordStart + contentLength;
        const recordBuffer = buffer.subarray(recordStart, recordEnd);
        geometries.push({
            bounds: parseShapeRecordBounds(recordBuffer),
            rings: parsePolygonParts(recordBuffer),
        });
        offset = recordEnd;
    }
    return geometries;
}

export function pointInRing(lat, lon, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i].lon;
        const yi = ring[i].lat;
        const xj = ring[j].lon;
        const yj = ring[j].lat;
        const intersects = ((yi > lat) !== (yj > lat))
            && (lon < ((xj - xi) * (lat - yi) / ((yj - yi) || Number.EPSILON)) + xi);
        if (intersects)
            inside = !inside;
    }
    return inside;
}

export function pointInPolygon(lat, lon, polygon) {
    if (!polygon?.bounds)
        return false;
    if (lon < polygon.bounds.minLon || lon > polygon.bounds.maxLon
        || lat < polygon.bounds.minLat || lat > polygon.bounds.maxLat) {
        return false;
    }
    let inside = false;
    for (const ring of polygon.rings ?? []) {
        if (ring.length < 3)
            continue;
        if (pointInRing(lat, lon, ring))
            inside = !inside;
    }
    return inside;
}

export async function loadTigerCbsaBounds(zipPath) {
    const [dbfBuffer, shpBuffer] = await Promise.all([
        readZipEntry(zipPath, 'tl_2024_us_cbsa.dbf', { maxBuffer: 8 * 1024 * 1024 }),
        readZipEntry(zipPath, 'tl_2024_us_cbsa.shp', { maxBuffer: 128 * 1024 * 1024 }),
    ]);
    const records = parseDbfRecords(dbfBuffer);
    const bounds = parseShapefileBounds(shpBuffer);
    const byCode = new Map();
    for (let index = 0; index < Math.min(records.length, bounds.length); ++index) {
        const row = records[index];
        const bbox = bounds[index];
        const code = compactWhitespace(row.CBSAFP || row.GEOID);
        if (!code || !bbox)
            continue;
        byCode.set(code, {
            code,
            name: compactWhitespace(row.NAMELSAD || row.NAME),
            bounds: bbox,
            centroid: {
                lat: Number(row.INTPTLAT),
                lon: Number(row.INTPTLON),
            },
        });
    }
    return byCode;
}

export async function loadTigerCbsaGeometries(zipPath) {
    const [dbfBuffer, shpBuffer] = await Promise.all([
        readZipEntry(zipPath, 'tl_2024_us_cbsa.dbf', { maxBuffer: 8 * 1024 * 1024 }),
        readZipEntry(zipPath, 'tl_2024_us_cbsa.shp', { maxBuffer: 128 * 1024 * 1024 }),
    ]);
    const records = parseDbfRecords(dbfBuffer);
    const geometries = parseShapefileGeometries(shpBuffer);
    const byCode = new Map();
    for (let index = 0; index < Math.min(records.length, geometries.length); ++index) {
        const row = records[index];
        const geometry = geometries[index];
        const code = compactWhitespace(row.CBSAFP || row.GEOID);
        if (!code || !geometry?.bounds || !geometry.rings?.length)
            continue;
        byCode.set(code, {
            code,
            name: compactWhitespace(row.NAMELSAD || row.NAME),
            bounds: geometry.bounds,
            rings: geometry.rings,
            centroid: {
                lat: Number(row.INTPTLAT),
                lon: Number(row.INTPTLON),
            },
        });
    }
    return byCode;
}
