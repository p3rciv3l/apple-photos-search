export function normalizeText(value) {
    return value
        ?.replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase() ?? '';
}

export function escapeSqlString(value) {
    return value.replace(/'/g, "''");
}

export async function parseLocationIntent(query, findLocationMatches) {
    const patterns = [
        /^(?<semantic>.+?)\s+\b(?:in|at|near|from)\b\s+(?<location>.+?)\s*$/i,
        /^(?<semantic>.+?)\s*,\s*(?<location>.+?)\s*$/i,
    ];
    for (const pattern of patterns) {
        const match = query.match(pattern);
        const semanticQuery = match?.groups?.semantic?.trim();
        const locationQuery = match?.groups?.location?.trim();
        if (!semanticQuery || !locationQuery)
            continue;
        const matches = await findLocationMatches(locationQuery);
        if (matches.size === 0)
            continue;
        return { semanticQuery, locationQuery, locationUuids: matches };
    }
    return { semanticQuery: query.trim() };
}

export function getResultUuid(result) {
    return result.filePath.match(/([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})/i)?.[1];
}

export function filterResultsByLocation(results, locationUuids) {
    if (!locationUuids?.size)
        return results;
    return results.filter((result) => {
        const uuid = getResultUuid(result);
        return uuid ? locationUuids.has(uuid) : false;
    });
}
