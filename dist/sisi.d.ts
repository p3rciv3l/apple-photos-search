import { SearchResult } from './search.js';
/**
 * Build or update index for the dir.
 */
export declare function index(targetDir: string): Promise<void>;
/**
 * Search the query string from index.
 */
interface SearchOptions {
    maxResults: number;
    targetDir?: string;
}
export declare function search(query: string, { maxResults, targetDir }: SearchOptions): Promise<SearchResult[] | undefined>;
export declare function getIndexedImages(targetDir?: string): Promise<{
    filePath: string;
    embedding: any;
}[]>;
/**
 * Return the items in the index.
 */
export declare function listIndex(): Promise<string[]>;
/**
 * Remove items under the directory in index.
 */
export declare function removeIndex(targetDir: string): Promise<string[]>;
export {};
