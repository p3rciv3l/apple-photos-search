import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

export async function readZipEntry(zipPath, entryPath, options = {}) {
    const { maxBuffer = 256 * 1024 * 1024 } = options;
    const { stdout } = await execFile('unzip', ['-p', zipPath, entryPath], {
        encoding: 'buffer',
        maxBuffer,
    });
    return stdout;
}

export async function readZipEntryText(zipPath, entryPath, options = {}) {
    const buffer = await readZipEntry(zipPath, entryPath, options);
    return buffer.toString(options.encoding ?? 'utf8');
}
