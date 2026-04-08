import { normalizeText } from './location.js';

export function pointInBounds(lat, lon, bounds) {
    return lat >= bounds.minLat
        && lat <= bounds.maxLat
        && lon >= bounds.minLon
        && lon <= bounds.maxLon;
}

function collectDescendantIds(regionId, geoIndex, seen = new Set()) {
    const children = geoIndex.childrenById.get(regionId) ?? [];
    const descendantIds = [];
    for (const childId of children) {
        if (seen.has(childId))
            continue;
        seen.add(childId);
        descendantIds.push(childId);
        descendantIds.push(...collectDescendantIds(childId, geoIndex, seen));
    }
    return descendantIds;
}

export function findMatchingRegions(locationQuery, geoIndex) {
    const normalized = normalizeText(locationQuery);
    if (!normalized)
        return [];
    const ids = geoIndex.aliasMap.get(normalized) ?? [];
    return ids
        .map(id => geoIndex.regionById.get(id))
        .filter(Boolean);
}

export function expandRegionsWithDescendants(regions, geoIndex) {
    const expanded = [];
    const seen = new Set();
    for (const region of regions ?? []) {
        if (!region?.id || seen.has(region.id))
            continue;
        seen.add(region.id);
        expanded.push(region);
        for (const descendantId of collectDescendantIds(region.id, geoIndex, seen)) {
            const descendant = geoIndex.regionById.get(descendantId);
            if (!descendant?.id || seen.has(descendant.id))
                continue;
            seen.add(descendant.id);
            expanded.push(descendant);
        }
    }
    return expanded;
}
