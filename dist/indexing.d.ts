import { Model } from './model.js';
import { FSItem, TotalFilesInfo } from './fs.js';
export type IndexMap = Map<string, IndexDirEntry>;
interface IndexDirEntry {
    files: IndexFileEntry[];
}
interface IndexFileEntry {
    name: string;
    mtimeMs: number;
    embedding?: number[];
}
/**
 * Create index for the target directory.
 * @param model - The CLIP model.
 * @param target - Target directory which contains images.
 * @param items - The items under the target directory.
 * @param index - When specified, the passed index will be updated.
 * @param report - Callback for receiving the indexing progress.
 */
export declare function buildIndex(model: Model, target: string, items: FSItem[], index?: IndexMap, report?: (progress: TotalFilesInfo) => void): Promise<IndexMap>;
/**
 * Remove non-exist directories from index.
 */
export declare function removeInvalidIndex(index: IndexMap): Promise<void>;
/**
 * Return the path to the index file.
 */
export declare function getIndexPath(): string;
/**
 * Write the index to a BSER file on disk.
 * @param index
 * @param indexPath - The BSER file to write to.
 */
export declare function writeIndexToDisk(index: IndexMap, indexPath?: string): Promise<void>;
/**
 * Read the index from BSER file on disk.
 * @param indexPath - The BSER file to read from.
 */
export declare function readIndexFromDisk(indexPath?: string): Promise<IndexMap>;
export {};
