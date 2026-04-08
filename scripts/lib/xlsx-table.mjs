import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function decodeXmlEntities(value) {
    return String(value ?? '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, '\'')
        .replace(/&amp;/g, '&');
}

function stripTags(value) {
    return decodeXmlEntities(String(value ?? '').replace(/<[^>]+>/g, ''));
}

function readRichText(nodeXml) {
    const values = [...String(nodeXml ?? '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
        .map(match => stripTags(match[1]));
    return values.join('');
}

function getColumnIndex(cellRef) {
    const letters = String(cellRef ?? '').match(/^[A-Z]+/)?.[0] ?? '';
    let value = 0;
    for (const letter of letters) {
        value = (value * 26) + (letter.charCodeAt(0) - 64);
    }
    return Math.max(0, value - 1);
}

export function parseSharedStringsXml(xml) {
    return [...String(xml ?? '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)]
        .map(match => readRichText(match[1]));
}

export function parseWorksheetRowsXml(xml, { sharedStrings = [] } = {}) {
    const rows = [];
    for (const rowMatch of String(xml ?? '').matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
        const rowAttrs = rowMatch[1] ?? '';
        const rowXml = rowMatch[2] ?? '';
        const rowNumber = Number(rowAttrs.match(/\br="(\d+)"/)?.[1] ?? '0');
        const cells = [];
        for (const cellMatch of rowXml.matchAll(/<c\b([^>]*?)(?:>([\s\S]*?)<\/c>|\/>)/g)) {
            const cellAttrs = cellMatch[1] ?? '';
            const cellBody = cellMatch[2] ?? '';
            const cellRef = cellAttrs.match(/\br="([A-Z]+\d+)"/)?.[1] ?? '';
            const cellType = cellAttrs.match(/\bt="([^"]+)"/)?.[1] ?? '';
            const columnIndex = getColumnIndex(cellRef);
            let value = '';
            if (cellType === 's') {
                const sharedIndex = Number(cellBody.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '-1');
                value = sharedStrings[sharedIndex] ?? '';
            }
            else if (cellType === 'inlineStr') {
                value = readRichText(cellBody);
            }
            else {
                value = stripTags(cellBody.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '');
            }
            cells[columnIndex] = value;
        }
        rows.push({ rowNumber, cells });
    }
    return rows;
}

export function sheetRowsToObjects(rows, {
    headerRow = 1,
    dataRowStart = headerRow + 1,
    dataRowEnd = Number.POSITIVE_INFINITY,
} = {}) {
    const header = rows.find(row => row.rowNumber === headerRow);
    if (!header)
        throw new Error(`Worksheet is missing header row ${headerRow}.`);
    const headers = header.cells.map(value => String(value ?? '').trim());
    return rows
        .filter(row => row.rowNumber >= dataRowStart && row.rowNumber <= dataRowEnd)
        .map(row => Object.fromEntries(headers.map((key, index) => [key, row.cells[index] ?? ''])))
        .filter(row => Object.values(row).some(value => String(value ?? '').trim() !== ''));
}

async function unzipEntry(filePath, entryPath) {
    const { stdout } = await execFileAsync('unzip', ['-p', filePath, entryPath], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
}

export async function readXlsxSheetObjects(filePath, options = {}) {
    const {
        sharedStringsPath = 'xl/sharedStrings.xml',
        sheetPath = 'xl/worksheets/sheet1.xml',
        headerRow = 1,
        dataRowStart = headerRow + 1,
        dataRowEnd,
    } = options;
    const [sharedStringsXml, worksheetXml] = await Promise.all([
        unzipEntry(filePath, sharedStringsPath),
        unzipEntry(filePath, sheetPath),
    ]);
    const sharedStrings = parseSharedStringsXml(sharedStringsXml);
    const rows = parseWorksheetRowsXml(worksheetXml, { sharedStrings });
    return sheetRowsToObjects(rows, { headerRow, dataRowStart, dataRowEnd });
}
