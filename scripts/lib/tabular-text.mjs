function parseDelimitedLine(line, delimiter) {
    const cells = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; ++i) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                cell += '"';
                ++i;
            }
            else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (!inQuotes && ch === delimiter) {
            cells.push(cell);
            cell = '';
            continue;
        }
        cell += ch;
    }
    cells.push(cell);
    return cells.map(value => value.trim());
}

export function detectDelimiter(headerLine) {
    const tabCount = (headerLine.match(/\t/g) ?? []).length;
    const commaCount = (headerLine.match(/,/g) ?? []).length;
    return tabCount >= commaCount ? '\t' : ',';
}

export function parseDelimitedText(text, { delimiter } = {}) {
    const lines = String(text)
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map(line => line.trimEnd())
        .filter(line => line.trim().length > 0 && !line.trimStart().startsWith('#'));
    if (lines.length === 0)
        return [];
    const actualDelimiter = delimiter ?? detectDelimiter(lines[0]);
    const headers = parseDelimitedLine(lines[0], actualDelimiter);
    const rows = [];
    for (const line of lines.slice(1)) {
        const values = parseDelimitedLine(line, actualDelimiter);
        const row = {};
        for (let i = 0; i < headers.length; ++i) {
            row[headers[i]] = values[i] ?? '';
        }
        rows.push(row);
    }
    return rows;
}

export function normalizeHeaderName(name) {
    return String(name)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
