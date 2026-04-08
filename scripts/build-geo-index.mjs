#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildCompiledGeoIndex, loadNormalizedMetroRows } from './lib/geo-index-builder.mjs';
import { parseCensusMetroText, parseCensusMetroWorkbook } from './lib/us-metro-source.mjs';
import { loadUsPlaceMetroAliases } from './lib/us-place-source.mjs';

function parseArgs(argv) {
    const result = {
        seedPath: path.resolve('data/geo/seed.json'),
        outputPath: path.resolve('data/geo/index.json'),
        metrosPath: null,
        cbsaBoundsPath: null,
        placesPath: null,
    };
    for (let i = 2; i < argv.length; ++i) {
        const arg = argv[i];
        if (arg === '--seed') {
            result.seedPath = path.resolve(argv[++i]);
        }
        else if (arg === '--metros' || arg === '--input') {
            result.metrosPath = path.resolve(argv[++i]);
        }
        else if (arg === '--output') {
            result.outputPath = path.resolve(argv[++i]);
        }
        else if (arg === '--cbsa-bounds') {
            result.cbsaBoundsPath = path.resolve(argv[++i]);
        }
        else if (arg === '--places') {
            result.placesPath = path.resolve(argv[++i]);
        }
        else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }
    return result;
}

async function readJsonFile(filePath) {
    const text = await fs.readFile(filePath, 'utf8');
    return JSON.parse(text);
}

async function loadMetroRows(filePath, options = {}) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.json')
        return loadNormalizedMetroRows(await readJsonFile(filePath));
    if (ext === '.xlsx') {
        if (!options.cbsaBoundsPath) {
            throw new Error('Official Census workbook input requires --cbsa-bounds with a TIGER CBSA zip.');
        }
        return parseCensusMetroWorkbook(filePath, {
            dataset: 'census-delineation-workbook',
            revision: path.basename(filePath),
            cbsaBoundsPath: options.cbsaBoundsPath,
        });
    }
    const text = await fs.readFile(filePath, 'utf8');
    return parseCensusMetroText(text, {
        dataset: 'census-delineation',
    });
}

async function main() {
    const { seedPath, outputPath, metrosPath, cbsaBoundsPath, placesPath } = parseArgs(process.argv);
    if (placesPath && !cbsaBoundsPath) {
        throw new Error('Place alias input requires --cbsa-bounds with a TIGER CBSA zip.');
    }
    const seedIndex = await readJsonFile(seedPath);
    const metroRows = metrosPath ? await loadMetroRows(metrosPath, { cbsaBoundsPath }) : [];
    const aliasRows = placesPath
        ? await loadUsPlaceMetroAliases(placesPath, cbsaBoundsPath)
        : [];
    const compiled = buildCompiledGeoIndex({
        seedIndex,
        metroRows,
        aliasRows,
        sources: metrosPath
            ? [{
                name: 'metro-input',
                description: cbsaBoundsPath
                    ? `Normalized metro rows from ${path.basename(metrosPath)} joined to ${path.basename(cbsaBoundsPath)}`
                    : `Normalized metro rows from ${path.basename(metrosPath)}`,
            }]
            : [],
    });
    if (placesPath) {
        compiled.sources.push({
            name: 'place-input',
            description: `Place aliases from ${path.basename(placesPath)} mapped onto ${path.basename(cbsaBoundsPath)}`,
        });
    }
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(compiled, null, 2)}\n`);
    console.log(`Geo index written to ${path.relative(process.cwd(), outputPath)}`);
    if (metroRows.length > 0) {
        console.log(`Merged ${metroRows.length} normalized metro row(s).`);
    }
    if (aliasRows.length > 0) {
        console.log(`Merged ${aliasRows.length} place alias row(s).`);
    }
}

main().catch(error => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
});
