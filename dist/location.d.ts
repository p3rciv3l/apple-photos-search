import { SearchResult } from './search.js';
export declare function normalizeText(value?: string | null): string;
export declare function escapeSqlString(value: string): string;
export declare function parseLocationIntent(query: string, findLocationMatches: (locationQuery: string) => Promise<Set<string>>): Promise<{
    semanticQuery: string;
    locationQuery?: string;
    locationUuids?: Set<string>;
}>;
export declare function getResultUuid(result: SearchResult): string | undefined;
export declare function filterResultsByLocation(results: SearchResult[], locationUuids?: Set<string>): SearchResult[];
