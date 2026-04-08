function normalizeText(value) {
    return String(value ?? '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function uniq(values) {
    return [...new Set(values.filter(Boolean))];
}

function sortByAlias(a, b) {
    const left = a.regionIds?.[0] ?? a.regionId ?? '';
    const right = b.regionIds?.[0] ?? b.regionId ?? '';
    return a.alias.localeCompare(b.alias) || left.localeCompare(right);
}

function sortByRegionId(a, b) {
    return a.id.localeCompare(b.id);
}

export function normalizeBounds(bounds) {
    if (!bounds || typeof bounds !== 'object') {
        throw new Error('Region bounds are required.');
    }
    const minLat = Number(bounds.minLat);
    const maxLat = Number(bounds.maxLat);
    const minLon = Number(bounds.minLon);
    const maxLon = Number(bounds.maxLon);
    for (const [name, value] of Object.entries({ minLat, maxLat, minLon, maxLon })) {
        if (!Number.isFinite(value)) {
            throw new Error(`Invalid ${name} bound: ${bounds[name]}`);
        }
    }
    if (minLat > maxLat) throw new Error('minLat must be <= maxLat.');
    if (minLon > maxLon) throw new Error('minLon must be <= maxLon.');
    return { minLat, maxLat, minLon, maxLon };
}

export function normalizeRegion(row, defaultKind = 'region') {
    if (!row || typeof row !== 'object') {
        throw new Error('Region row must be an object.');
    }
    if (!row.id) throw new Error('Region row is missing an id.');
    if (!row.name) throw new Error(`Region row ${row.id} is missing a name.`);
    const region = {
        id: String(row.id),
        kind: String(row.kind ?? defaultKind),
        name: String(row.name),
    };
    if (row.bounds != null) {
        region.bounds = normalizeBounds(row.bounds);
    }
    const parentIds = uniq((row.parentIds ?? []).map(value => String(value)));
    if (parentIds.length > 0) {
        region.parentIds = parentIds;
    }
    return region;
}

export function normalizeAlias(row) {
    if (!row || typeof row !== 'object') {
        throw new Error('Alias row must be an object.');
    }
    if (!row.alias) throw new Error('Alias row is missing an alias.');
    const regionIds = Array.isArray(row.regionIds)
        ? row.regionIds.map(value => String(value)).filter(Boolean)
        : (row.regionId ? [String(row.regionId)] : []);
    if (regionIds.length === 0) {
        throw new Error(`Alias row "${row.alias}" is missing regionId.`);
    }
    return {
        alias: normalizeText(row.alias),
        regionId: regionIds[0],
        regionIds,
    };
}

function addAlias(map, alias, regionId) {
    const normalizedAlias = normalizeText(alias);
    if (!normalizedAlias)
        return;
    const existing = map.get(normalizedAlias) ?? new Set();
    existing.add(regionId);
    map.set(normalizedAlias, existing);
}

function addCanonicalAliases(map, region) {
    addAlias(map, region.id, region.id);
    addAlias(map, region.name, region.id);
}

export function normalizeCompiledGeoIndex(index) {
    const regions = new Map();
    const aliasMap = new Map();
    const sources = new Map();
    for (const source of index.sources ?? []) {
        if (!source?.name) continue;
        sources.set(source.name, { ...source });
    }
    for (const region of index.regions ?? []) {
        const normalized = normalizeRegion(region, region.kind ?? 'region');
        regions.set(normalized.id, normalized);
        addCanonicalAliases(aliasMap, normalized);
    }
    for (const alias of index.aliases ?? []) {
        const normalized = normalizeAlias(alias);
        for (const regionId of normalized.regionIds) {
            addAlias(aliasMap, normalized.alias, regionId);
        }
    }
    return {
        version: Number(index.version ?? 1),
        regions: [...regions.values()].sort(sortByRegionId),
        aliases: [...aliasMap.entries()]
            .map(([alias, regionIds]) => ({ alias, regionIds: [...regionIds].sort() }))
            .sort(sortByAlias),
        sources: [...sources.values()],
    };
}

export function buildCompiledGeoIndex({ seedIndex = {}, metroRows = [], regionRows = [], aliasRows = [], sources = [] } = {}) {
    const mergedRegions = new Map();
    const mergedAliases = new Map();
    const mergedSources = new Map();

    const addRegion = (row) => {
        const normalized = normalizeRegion(row, row.kind ?? 'region');
        const existing = mergedRegions.get(normalized.id);
        if (existing) {
            if (!normalized.bounds && existing.bounds) {
                normalized.bounds = existing.bounds;
            }
            normalized.parentIds = uniq([
                ...(existing.parentIds ?? []),
                ...(normalized.parentIds ?? []),
            ]);
        }
        mergedRegions.set(normalized.id, normalized);
        addCanonicalAliases(mergedAliases, normalized);
        for (const alias of row.aliases ?? []) {
            addAlias(mergedAliases, alias, normalized.id);
        }
    };
    const addAliasRow = (row) => {
        const normalized = normalizeAlias(row);
        for (const regionId of normalized.regionIds ?? [normalized.regionId]) {
            addAlias(mergedAliases, normalized.alias, regionId);
        }
    };
    const addSource = (source) => {
        if (!source?.name) return;
        mergedSources.set(source.name, { ...source });
    };

    for (const source of seedIndex.sources ?? []) addSource(source);
    for (const source of sources) addSource(source);

    for (const region of seedIndex.regions ?? []) addRegion(region);
    for (const region of regionRows) addRegion(region);
    for (const metro of metroRows) addRegion({ ...metro, kind: metro.kind ?? 'metro' });

    for (const alias of seedIndex.aliases ?? []) addAliasRow(alias);
    for (const alias of aliasRows) addAliasRow(alias);

    return normalizeCompiledGeoIndex({
        version: seedIndex.version ?? 1,
        regions: [...mergedRegions.values()],
        aliases: [...mergedAliases.entries()].flatMap(([alias, regionIds]) =>
            [...regionIds].map(regionId => ({ alias, regionId }))),
        sources: [...mergedSources.values()],
    });
}

export function loadNormalizedMetroRows(payload) {
    if (Array.isArray(payload)) {
        return payload;
    }
    if (payload && typeof payload === 'object') {
        return payload.metros ?? payload.metroRows ?? [];
    }
    throw new Error('Metro payload must be an array or object.');
}
