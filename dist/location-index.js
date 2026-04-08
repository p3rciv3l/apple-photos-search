import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeText } from './location.js';

let cachedIndex;

function buildAliasMap(aliases) {
    const map = new Map();
    for (const entry of aliases ?? []) {
        const alias = normalizeText(entry.alias);
        if (!alias)
            continue;
        const existing = map.get(alias) ?? new Set();
        const regionIds = Array.isArray(entry.regionIds)
            ? entry.regionIds
            : (entry.regionId ? [entry.regionId] : []);
        for (const regionId of regionIds) {
            if (regionId)
                existing.add(regionId);
        }
        map.set(alias, [...existing]);
    }
    return map;
}

function buildAliasesByRegionMap(regions, aliases) {
    const map = new Map();
    const addAlias = (regionId, alias) => {
        const normalizedAlias = normalizeText(alias);
        if (!regionId || !normalizedAlias)
            return;
        const existing = map.get(regionId) ?? new Set();
        existing.add(normalizedAlias);
        map.set(regionId, existing);
    };
    for (const region of regions ?? []) {
        addAlias(region.id, region.name);
    }
    for (const entry of aliases ?? []) {
        const normalizedAlias = normalizeText(entry.alias);
        if (!normalizedAlias)
            continue;
        const regionIds = Array.isArray(entry.regionIds)
            ? entry.regionIds
            : (entry.regionId ? [entry.regionId] : []);
        for (const regionId of regionIds) {
            addAlias(regionId, normalizedAlias);
        }
    }
    return new Map([...map.entries()].map(([regionId, values]) => [regionId, [...values].sort()]));
}

function buildChildrenMap(regions) {
    const map = new Map();
    for (const region of regions ?? []) {
        for (const parentId of region.parentIds ?? []) {
            const children = map.get(parentId) ?? [];
            children.push(region.id);
            map.set(parentId, children);
        }
    }
    return map;
}

export async function loadGeoIndex(indexPath = path.resolve('data/geo/index.json')) {
    if (cachedIndex?.path === indexPath)
        return cachedIndex.value;
    const raw = JSON.parse(await fs.readFile(indexPath, 'utf8'));
    const value = {
        ...raw,
        regionById: new Map((raw.regions ?? []).map(region => [region.id, region])),
        aliasMap: buildAliasMap(raw.aliases ?? []),
        aliasesByRegionId: buildAliasesByRegionMap(raw.regions ?? [], raw.aliases ?? []),
        childrenById: buildChildrenMap(raw.regions ?? []),
    };
    cachedIndex = { path: indexPath, value };
    return value;
}

export function clearGeoIndexCache() {
    cachedIndex = undefined;
}
