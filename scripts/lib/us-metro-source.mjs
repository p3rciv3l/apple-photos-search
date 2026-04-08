import { normalizeHeaderName, parseDelimitedText } from './tabular-text.mjs';
import { readXlsxSheetObjects } from './xlsx-table.mjs';
import { loadTigerCbsaBounds } from './tiger-cbsa-source.mjs';

const METRO_TYPE_ALIASES = new Map([
    ['core based statistical area', 'cbsa'],
    ['cbsa', 'cbsa'],
    ['metropolitan statistical area', 'cbsa'],
    ['micropolitan statistical area', 'cbsa'],
    ['combined statistical area', 'csa'],
    ['csa', 'csa'],
    ['metropolitan division', 'metropolitanDivision'],
    ['md', 'metropolitanDivision'],
]);

function compactWhitespace(value) {
    return String(value ?? '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeText(value) {
    return compactWhitespace(value).toLowerCase();
}

function stripMetroSuffix(name) {
    return compactWhitespace(name)
        .replace(/\s*-\s*$/g, '')
        .replace(/\b(Metropolitan|Micropolitan|Combined|Statistical|Area|Division)\b/gi, '')
        .replace(/,\s*[A-Z]{2}(?:-[A-Z]{2})*\s*$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function splitTitleAndState(name) {
    const trimmed = compactWhitespace(name);
    const match = trimmed.match(/^(.*?)(?:,\s*([A-Z]{2}(?:-[A-Z]{2})?))$/);
    if (!match)
        return { title: trimmed, stateSuffix: '' };
    return {
        title: compactWhitespace(match[1]),
        stateSuffix: match[2],
    };
}

function derivePrincipalCityAliases(name) {
    const { title } = splitTitleAndState(name);
    const parts = title.split('-').map(compactWhitespace).filter(Boolean);
    // Keep this conservative for now: only expand when the title clearly lists
    // multiple principal cities, which is common in multi-city metro names like
    // Sacramento-Roseville-Folsom or Charlotte-Concord-Gastonia.
    if (parts.length < 3)
        return [];
    return uniq(parts);
}

function uniq(values) {
    return [...new Set(values.filter(Boolean))];
}

function getField(row, names) {
    const lookup = new Map(Object.entries(row).map(([key, value]) => [normalizeHeaderName(key), value]));
    for (const name of names) {
        const value = lookup.get(normalizeHeaderName(name));
        if (value != null && String(value).trim() !== '')
            return String(value).trim();
    }
    return '';
}

function getNumericField(row, names) {
    const value = getField(row, names);
    if (!value)
        return null;
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMetroType(value) {
    const key = normalizeText(value);
    return METRO_TYPE_ALIASES.get(key) ?? 'cbsa';
}

function buildMetroId(type, code) {
    return `us-${type}-${String(code).trim()}`;
}

function buildMetroAliases(record) {
    const baseName = stripMetroSuffix(record.name);
    const hasExplicitStateSuffix = /,\s*[A-Z]{2}(?:-[A-Z]{2})*$/.test(baseName);
    const aliases = [
        record.name,
        baseName,
        record.shortName,
        record.metroType === 'csa' ? `${baseName} CSA` : null,
        record.metroType === 'metropolitanDivision' ? `${baseName} metro division` : null,
        record.stateAbbrev && !hasExplicitStateSuffix ? `${baseName}, ${record.stateAbbrev}` : null,
        record.metroType === 'cbsa' ? `${baseName} metro` : null,
        ...derivePrincipalCityAliases(record.name),
    ];
    return uniq(aliases);
}

function parseMetroComponentList(row) {
    const componentFields = [
        'County', 'County Name', 'COUNTY', 'County/County Equivalent',
        'Metropolitan Division', 'MSA', 'CSA', 'Place', 'Principal City',
    ];
    const values = componentFields
        .map(field => getField(row, [field]))
        .filter(Boolean);
    return uniq(values);
}

function inferStateAbbrev(name) {
    const match = String(name ?? '').match(/,\s*([A-Z]{2}(?:-[A-Z]{2})*)\s*$/);
    return match?.[1] ?? '';
}

function deriveStateParentIds(name) {
    const stateSuffix = inferStateAbbrev(name);
    if (!stateSuffix)
        return [];
    return uniq(stateSuffix
        .split('-')
        .map(value => value.trim().toLowerCase())
        .filter(Boolean)
        .map(value => `us-${value}`));
}

function normalizeMetroRecord(row, options = {}) {
    const metroType = normalizeMetroType(getField(row, [
        'LSAD', 'Lsad', 'Area Type', 'Area Type Description', 'Geography Type',
        'CBSA Type', 'Classification', 'Statistical Area Type',
    ]));
    const code = getField(row, [
        'GEOID', 'GEOID_CBSA_23', 'GEOID_CBSA', 'CBSA Code', 'CBSA', 'CSA Code',
        'Metropolitan Division Code', 'Code',
    ]);
    const rawName = getField(row, [
        'CBSA Title', 'CSA Title', 'Name', 'NAMELSAD', 'NAMELSAD_CBSA_23',
        'Metropolitan Division Title',
    ]);
    const name = compactWhitespace(rawName);
    const shortName = stripMetroSuffix(name);
    const aliases = buildMetroAliases({
        name,
        shortName,
        metroType,
        stateAbbrev: inferStateAbbrev(name),
    });
    const bounds = {
        minLat: getNumericField(row, ['minLat', 'MIN_LAT', 'Min Latitude', 'South']),
        maxLat: getNumericField(row, ['maxLat', 'MAX_LAT', 'Max Latitude', 'North']),
        minLon: getNumericField(row, ['minLon', 'MIN_LON', 'Min Longitude', 'West']),
        maxLon: getNumericField(row, ['maxLon', 'MAX_LON', 'Max Longitude', 'East']),
    };
    const hasBounds = Object.values(bounds).every(value => typeof value === 'number');
    return {
        id: buildMetroId(metroType, code || normalizeText(name).replace(/\s+/g, '-')),
        kind: 'metro',
        metroType,
        code,
        name,
        shortName,
        aliases,
        parentIds: uniq([
            options.countryId ?? 'country-us',
            options.stateId,
            ...deriveStateParentIds(name),
        ]),
        components: parseMetroComponentList(row),
        census: {
            year: options.year ?? null,
            source: options.source ?? 'census',
            code,
            metroType,
            label: name,
        },
        source: {
            dataset: options.dataset ?? 'metro-delineation',
            revision: options.revision ?? null,
        },
        bounds: hasBounds ? bounds : null,
        centroid: {
            lat: getNumericField(row, ['centroidLat', 'CENTROID_LAT', 'Latitude']),
            lon: getNumericField(row, ['centroidLon', 'CENTROID_LON', 'Longitude']),
        },
        raw: row,
    };
}

function hasCoordinate(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function createWorkbookMetroRecord(entry, boundsRow, options = {}) {
    const shortName = stripMetroSuffix(entry.name);
    return {
        id: buildMetroId(entry.metroType, entry.code || normalizeText(entry.name).replace(/\s+/g, '-')),
        kind: 'metro',
        metroType: entry.metroType,
        code: entry.code,
        name: entry.name,
        shortName,
        aliases: buildMetroAliases({
            name: entry.name,
            shortName,
            metroType: entry.metroType,
            stateAbbrev: inferStateAbbrev(entry.name),
        }),
        parentIds: uniq([
            options.countryId ?? 'country-us',
            ...deriveStateParentIds(entry.name),
        ]),
        components: uniq([...entry.components]),
        census: {
            year: options.year ?? 2023,
            source: options.source ?? 'census',
            code: entry.code,
            metroType: entry.metroType,
            label: entry.name,
        },
        source: {
            dataset: options.dataset ?? 'census-delineation-workbook',
            revision: options.revision ?? null,
        },
        bounds: boundsRow?.bounds ?? null,
        centroid: boundsRow?.centroid ?? null,
        raw: entry.rows,
    };
}

function mergeMetroRecords(records) {
    const merged = new Map();
    for (const record of records) {
        const existing = merged.get(record.id);
        if (!existing) {
            merged.set(record.id, {
                ...record,
                aliases: uniq(record.aliases),
                parentIds: uniq(record.parentIds),
                components: uniq(record.components),
                raw: [record.raw],
            });
            continue;
        }
        existing.aliases = uniq([...existing.aliases, ...record.aliases]);
        existing.parentIds = uniq([...existing.parentIds, ...record.parentIds]);
        existing.components = uniq([...existing.components, ...record.components]);
        if (!existing.bounds && record.bounds) {
            existing.bounds = record.bounds;
        }
        if ((!hasCoordinate(existing.centroid?.lat) || !hasCoordinate(existing.centroid?.lon))
            && hasCoordinate(record.centroid?.lat) && hasCoordinate(record.centroid?.lon)) {
            existing.centroid = record.centroid;
        }
        existing.raw.push(record.raw);
    }
    return [...merged.values()];
}

export function parseCensusMetroRows(rows, options = {}) {
    return mergeMetroRecords(rows.map(row => normalizeMetroRecord(row, options)));
}

export function parseCensusMetroText(text, options = {}) {
    return parseCensusMetroRows(parseDelimitedText(text), options);
}

export async function parseCensusMetroWorkbook(filePath, options = {}) {
    const rows = await readXlsxSheetObjects(filePath, {
        headerRow: options.headerRow ?? 3,
        dataRowStart: options.dataRowStart ?? 4,
        dataRowEnd: options.dataRowEnd ?? 1918,
        sharedStringsPath: options.sharedStringsPath,
        sheetPath: options.sheetPath,
    });
    const boundsByCode = options.cbsaBoundsPath
        ? await loadTigerCbsaBounds(options.cbsaBoundsPath)
        : new Map();
    const grouped = new Map();
    for (const row of rows) {
        const code = getField(row, ['CBSA Code']);
        const name = getField(row, ['CBSA Title']);
        const metroType = normalizeMetroType(getField(row, ['Metropolitan/Micropolitan Statistical Area']));
        if (!code || !name)
            continue;
        const key = `${metroType}:${code}`;
        const entry = grouped.get(key) ?? {
            code,
            name,
            metroType,
            components: new Set(),
            rows: [],
        };
        const county = getField(row, ['County/County Equivalent']);
        if (county)
            entry.components.add(county);
        entry.rows.push(row);
        grouped.set(key, entry);
    }
    return [...grouped.values()]
        .map(entry => createWorkbookMetroRecord(entry, boundsByCode.get(entry.code), options))
        .filter(record => record.bounds);
}

export function metroRecordToGeoIndexRegion(record) {
    return {
        id: record.id,
        kind: 'metro',
        name: record.name,
        aliases: record.aliases,
        parentIds: record.parentIds,
        bounds: record.bounds,
        centroid: record.centroid,
        source: record.source,
        census: record.census,
        metroType: record.metroType,
        components: record.components,
    };
}

export function buildMetroIndexPayload(records) {
    return {
        regions: records.map(metroRecordToGeoIndexRegion),
        aliases: records.flatMap(record => record.aliases.map(alias => ({
            alias,
            regionId: record.id,
        }))),
        metros: records,
    };
}
