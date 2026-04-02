import { Clip } from '@frost-beta/clip';
/**
 * Compute the embedding for text or image depending on the query.
 */
export declare function computeEmbeddingForQuery(clip: Clip, query: string): Promise<{
    isTextQuery: boolean;
    queryEmbeddings: import("@frost-beta/mlx").core.array;
}>;
/**
 * The search result.
 */
export interface SearchResult {
    filePath: string;
    score: number;
}
/**
 * Print the results in HTML and show it in a browser.
 */
export declare function presentResults(query: string, results: SearchResult[]): void;
