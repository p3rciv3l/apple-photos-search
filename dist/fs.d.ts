import type { IndexMap } from './indexing.js';
/**
 * require('../package.json')
 */
export declare function getPackageJson(): {
    version: string;
};
/**
 * Return the user's cache directory.
 */
export declare function getCacheDir(): string;
/**
 * Return the user's app data directory.
 */
export declare function getConfigDir(): string;
/**
 * Replace the home dir in path with ~ when possible.
 */
export declare function shortPath(longPath: string): string;
/**
 * Record total file sizes and numbers.
 */
export interface TotalFilesInfo {
    size: number;
    count: number;
}
/**
 * A simple representation of filesystem.
 */
export interface FSItem {
    name: string;
    size: number;
    mtimeMs: number;
    needsUpdate: boolean;
    children?: FSItem[];
}
/**
 * Get all files under the directory.
 * @param dir - The target directory to search for files.
 * @param info - Record the size and count of found files.
 * @param index - Used for marking if an item needs update.
 */
export declare function listImageFiles(dir: string, info: TotalFilesInfo, index?: IndexMap): Promise<FSItem[]>;
