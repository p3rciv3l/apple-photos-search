import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
/**
 * require('../package.json')
 */
export function getPackageJson() {
    return JSON.parse(String(readFileSync(`${import.meta.dirname}/../package.json`)));
}
/**
 * Return the user's cache directory.
 */
export function getCacheDir() {
    const { env, platform } = process;
    if (env.XDG_CACHE_HOME)
        return `${env.XDG_CACHE_HOME}/sisi`;
    if (platform == 'darwin')
        return `${os.homedir()}/Library/Caches/sisi`;
    if (platform != 'win32')
        return `${os.homedir()}/.cache/sisi`;
    if (env.LOCALAPPDATA)
        return `${env.LOCALAPPDATA}/sisi-cache`;
    return `${os.homedir()}/.sisi-cache`;
}
/**
 * Return the user's app data directory.
 */
export function getConfigDir() {
    const { env, platform } = process;
    if (env.XDG_CONFIG_HOME)
        return `${env.XDG_CONFIG_HOME}/sisi`;
    if (platform == 'darwin')
        return `${os.homedir()}/Library/Application Support/sisi`;
    if (platform != 'win32')
        return `${os.homedir()}/.config/sisi`;
    if (env.APPDATA)
        return `${env.APPDATA}/sisi`;
    return `${os.homedir()}/AppData/Roaming/sisi`;
}
/**
 * Replace the home dir in path with ~ when possible.
 */
export function shortPath(longPath) {
    const homeDir = `${os.homedir()}/`;
    if (longPath.startsWith(homeDir))
        return '~/' + longPath.substr(homeDir.length);
    else
        return longPath;
}
/**
 * Get all files under the directory.
 * @param dir - The target directory to search for files.
 * @param info - Record the size and count of found files.
 * @param index - Used for marking if an item needs update.
 */
export async function listImageFiles(dir, info, index) {
    const dirEntry = index?.get(dir);
    // Read stats of all files under the dir in parallel.
    const fileNames = await fs.readdir(dir);
    const stats = await Promise.all(fileNames.map(n => fs.stat(`${dir}/${n}`)));
    let items = [];
    // Iterate all files in parallel.
    await Promise.all(fileNames.map(async (name, i) => {
        const stat = stats[i];
        const item = {
            name,
            size: stat.size,
            mtimeMs: stat.mtimeMs,
            needsUpdate: true,
        };
        if (stat.isDirectory()) {
            const children = await listImageFiles(`${dir}/${name}`, info, index);
            if (children.length > 0)
                items.push({ children, ...item });
        }
        else if (stat.isFile() && isFileNameImage(name)) {
            // Find out if the file has been modified since last indexing.
            if (dirEntry?.files?.find(i => i.name == name)?.mtimeMs >= stat.mtimeMs)
                item.needsUpdate = false;
            if (item.needsUpdate) {
                info.size += stat.size;
                info.count += 1;
            }
            items.push(item);
        }
    }));
    return items;
}
// The file extensions we consider as images.
const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'];
// Determine if a fileName is image.
function isFileNameImage(fileName) {
    return imageExtensions.includes(path.extname(fileName).substr(1)
        .toLowerCase());
}
