import fs from 'node:fs/promises';
import path from 'node:path';
import bser from 'bser';
import { getConfigDir } from './fs.js';
/**
 * Create index for the target directory.
 * @param model - The CLIP model.
 * @param target - Target directory which contains images.
 * @param items - The items under the target directory.
 * @param index - When specified, the passed index will be updated.
 * @param report - Callback for receiving the indexing progress.
 */
export async function buildIndex(model, target, items, index = new Map(), report) {
    // Record progress.
    const progress = { size: 0, count: 0 };
    // Handle files in dir recursively.
    const buildIndexForDir = async (dir, items) => {
        // Get old entry from index and prepare for new.
        const existingEntry = index.get(dir);
        let files = [];
        // Iterate all files.
        await Promise.all(items.map(async ({ name, size, mtimeMs, needsUpdate, children }) => {
            // Handle directories recursively.
            if (children) {
                await buildIndexForDir(`${dir}/${name}`, children);
                return;
            }
            // Reuse the existing entry if it is not out-dated.
            if (!needsUpdate) {
                files.push(existingEntry.files.find(i => i.name == name));
                return;
            }
            // Compute image's embedding and save it.
            let embedding;
            try {
                embedding = await model.computeImageEmbeddings(`${dir}/${name}`);
            }
            catch {
                // Failed to process image, should probably log error somewhere.
            }
            files.push({ name, mtimeMs, embedding });
            if (report) {
                progress.size += size;
                progress.count += 1;
                report(progress);
            }
        }));
        // Add dir to index if it contains image files.
        if (files.length > 0) {
            index.set(dir, { files });
            return true;
        }
        else {
            index.delete(dir);
            return false;
        }
    };
    await buildIndexForDir(path.resolve(target), items);
    return index;
}
/**
 * Remove non-exist directories from index.
 */
export async function removeInvalidIndex(index) {
    const invalidKeys = [];
    await Promise.all(Array.from(index.keys()).map(async (dir) => {
        try {
            await fs.access(dir, fs.constants.R_OK | fs.constants.X_OK);
        }
        catch (error) {
            invalidKeys.push(dir);
        }
    }));
    for (const key of invalidKeys) {
        index.delete(key);
    }
}
/**
 * Return the path to the index file.
 */
export function getIndexPath() {
    return `${getConfigDir()}/index.bser`;
}
/**
 * Write the index to a BSER file on disk.
 * @param index
 * @param indexPath - The BSER file to write to.
 */
export async function writeIndexToDisk(index, indexPath = getIndexPath()) {
    await fs.mkdir(path.dirname(indexPath), { recursive: true });
    const buffer = bser.dumpToBuffer({
        version: 1,
        index: Array.from(index.entries()),
    });
    await fs.writeFile(indexPath, buffer);
}
/**
 * Read the index from BSER file on disk.
 * @param indexPath - The BSER file to read from.
 */
export async function readIndexFromDisk(indexPath = getIndexPath()) {
    try {
        const buffer = await fs.readFile(indexPath);
        const json = bser.loadFromBuffer(buffer);
        return new Map(json.index);
    }
    catch {
        return new Map();
    }
}
