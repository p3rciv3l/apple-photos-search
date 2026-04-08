import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
    parseSharedStringsXml,
    parseWorksheetRowsXml,
    readXlsxSheetObjects,
    sheetRowsToObjects,
} from '../scripts/lib/xlsx-table.mjs';

test('parseSharedStringsXml joins rich text nodes', () => {
    const values = parseSharedStringsXml(`
        <sst>
            <si><t>CBSA Code</t></si>
            <si><r><t>Sacramento</t></r><r><t xml:space="preserve">-Roseville</t></r></si>
        </sst>
    `);
    assert.deepEqual(values, ['CBSA Code', 'Sacramento-Roseville']);
});

test('parseWorksheetRowsXml resolves shared strings into sparse rows', () => {
    const rows = parseWorksheetRowsXml(`
        <worksheet>
            <sheetData>
                <row r="3">
                    <c r="A3" t="s"><v>0</v></c>
                    <c r="B3" t="s"><v>1</v></c>
                </row>
                <row r="4">
                    <c r="A4" t="s"><v>2</v></c>
                    <c r="B4"><v>40900</v></c>
                </row>
            </sheetData>
        </worksheet>
    `, {
        sharedStrings: ['CBSA Title', 'CBSA Code', 'Sacramento-Roseville-Folsom, CA'],
    });
    assert.equal(rows[0].rowNumber, 3);
    assert.deepEqual(rows[0].cells.slice(0, 2), ['CBSA Title', 'CBSA Code']);
    assert.deepEqual(rows[1].cells.slice(0, 2), ['Sacramento-Roseville-Folsom, CA', '40900']);
});

test('sheetRowsToObjects maps worksheet rows onto header columns', () => {
    const objects = sheetRowsToObjects([
        { rowNumber: 3, cells: ['CBSA Code', 'CBSA Title', 'State Name'] },
        { rowNumber: 4, cells: ['40900', 'Sacramento-Roseville-Folsom, CA', 'California'] },
    ], {
        headerRow: 3,
        dataRowStart: 4,
    });
    assert.deepEqual(objects, [{
        'CBSA Code': '40900',
        'CBSA Title': 'Sacramento-Roseville-Folsom, CA',
        'State Name': 'California',
    }]);
});

test('readXlsxSheetObjects reads the official Census workbook when present', async (t) => {
    const workbookPath = path.resolve('tmp/geo/us/list1_2023.xlsx');
    try {
        await fs.access(workbookPath);
    }
    catch {
        t.skip(`Workbook not available at ${workbookPath}`);
        return;
    }

    const rows = await readXlsxSheetObjects(workbookPath, {
        headerRow: 3,
        dataRowStart: 4,
        dataRowEnd: 1918,
    });
    assert.ok(rows.length > 1500);
    assert.deepEqual(Object.keys(rows[0]), [
        'CBSA Code',
        'Metropolitan Division Code',
        'CSA Code',
        'CBSA Title',
        'Metropolitan/Micropolitan Statistical Area',
        'Metropolitan Division Title',
        'CSA Title',
        'County/County Equivalent',
        'State Name',
        'FIPS State Code',
        'FIPS County Code',
        'Central/Outlying County',
    ]);
    assert.ok(rows.some(row => row['CBSA Code'] === '40900' && row['CBSA Title'] === 'Sacramento-Roseville-Folsom, CA'));
    assert.ok(rows.some(row => row['CBSA Code'] === '16740' && row['CBSA Title'] === 'Charlotte-Concord-Gastonia, NC-SC'));
});
