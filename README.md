# Search Apple Photos Using OpenAI's CLIP Model

Local Apple Photo semantic image search using [CLIP](https://github.com/openai/CLIP) embeddings. Also allows for date search and album creation. This is heavily modified fork of [@frost-beta/sisi](https://github.com/nickochar/sisi).

This will require a Mac with Apple Silicon (GPU) or x64 Mac/Linux.

## Install

```
git clone https://github.com/p3rciv3l/sisi.git
cd sisi
npm install
```

Then symlink the binary:

```
ln -sf "$(pwd)/dist/cli.js" /opt/homebrew/bin/sisi
```

## Usage

```
sisi index <dir>                          # Build/update CLIP index for a directory
sisi search "<query>"                     # Search and view results in browser
sisi search "<query>" --print             # Print results to stdout
sisi search "cat in boston"               # Combine semantic search with Photos location metadata
sisi search "<query>" --date 6/24,8/24    # Filter to a date range (M/YY or M/D/YY)
sisi search "<query>" --date 1/25         # From a date to present
sisi search "<query>" --in ~/Pictures/    # Search within a specific directory
sisi search "<query>" --max 50            # Limit number of results (default 20)
sisi album "<query>"                      # Create an Apple Photos album from results
sisi album "<query>" --date 6/24,8/24     # Album with date filter
sisi list-index                           # Show indexed directories
sisi remove-index <dir>                   # Remove index for a directory
```

Clicking a result in the browser opens that photo in Apple Photos.

## How it works

`sisi index` computes CLIP embeddings for every image in a directory and stores them in a binary index file. `sisi search` computes cosine similarity between your query and all stored embeddings. The CLIP model is downloaded automatically on first run and you can re-index your photos by deletingthe embeddings; each indexing takes ~2 hours assuming you have 80k photos.

## Location Data

Location-aware search now has an offline geodata path in addition to Photos moment metadata.

- Runtime lookup uses the compiled artifact at `data/geo/index.json`.
- The long-term source direction is:
  - worldwide admin/place coverage from `geoBoundaries + GeoNames`
  - U.S. metro coverage from official Census / OMB datasets
- The committed U.S. metro layer is now built from the official Census delineation workbook plus TIGER CBSA bounds.
- Worldwide admin/place coverage is still pending; the current artifact is not yet the final global dataset.
- Local raw U.S. source files should live under `tmp/geo/us/` and stay out of runtime paths and git history.

To rebuild the compiled geo index from the current fixture input:

```bash
npm run build:geo-index -- --seed data/geo/seed.json --metros tests/fixtures/us-census-metros.tsv --output /tmp/sisi-geo-index.json
```

To rebuild it from the official Census delineation workbook plus TIGER CBSA bounds:

```bash
npm run build:geo-index -- --seed data/geo/seed.json --metros tmp/geo/us/list1_2023.xlsx --cbsa-bounds tmp/geo/us/tl_2024_us_cbsa.zip --output /tmp/sisi-geo-index.json
```

To add nationwide U.S. place-to-metro aliases from the Census place gazetteer:

```bash
npm run build:geo-index -- --seed data/geo/seed.json --metros tmp/geo/us/list1_2023.xlsx --cbsa-bounds tmp/geo/us/tl_2024_us_cbsa.zip --places tmp/geo/us/places --output /tmp/sisi-geo-index.json
```

The intended update workflow is:

1. Download authoritative raw source files outside normal runtime paths.
2. Parse them with the importer/build scripts under `scripts/`.
3. Emit a compact compiled artifact for runtime lookup.
4. Verify with `npm test` and optional live UUID checks via `npm run test:live-location`.

## License
MIT
