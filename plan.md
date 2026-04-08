# Location Database Plan

## Goal

Build a comprehensive offline location database for `sisi` with:

- worldwide administrative coverage
- official U.S. metro support using Census / OMB-style metro definitions
- query expansion for countries, states, metros, cities, and nearby places
- live tests that assert returned photo UUIDs are geographically valid for the query

## Status

- [x] Initial location query parsing added
- [x] Unit tests for basic location parsing/filtering added
- [x] Broad nearby matching for exact place-name seeds added
- [x] Initial state/country region support added
- [x] Design final data model for comprehensive offline geodata
- [x] Choose and document authoritative source datasets
- [x] Build import/preprocess pipeline
- [ ] Add U.S. MSA / CBSA / CSA ingestion
- [ ] Add worldwide admin/place ingestion
- [x] Wire compiled geodata index into query resolution
- [ ] Add integration/live tests for metros, states, countries
- [ ] Document update workflow and data provenance

## Workstreams

### Main Thread

- [x] Finalize architecture for offline geodata index
- [x] Coordinate agent findings into implementation plan
- [x] Integrate code changes and verification
- Notes:
  - Added test-first scaffolding for location parsing, region matching, and opt-in live UUID validation.
  - Added initial local resolver modules: `dist/location.js`, `dist/location-db.js`, `dist/location-index.js`, and `dist/location-resolver.js`.
  - Added a compiled seed geo index at `data/geo/index.json`.
  - Added an initial preprocessing scaffold at `scripts/build-geo-index.mjs`.
  - Current implementation is still transitional: the compiled geo index is seeded and not yet sourced from official/global raw datasets.
  - Concrete architecture decision:
    - preprocess external geographic sources into a compiled offline index instead of doing runtime web geocoding
    - keep runtime lookup thin: `dist/location-db.js` should resolve queries against compiled aliases/regions/metros, then intersect with Photos metadata UUIDs
    - keep preprocessing separate from runtime via a small script pipeline and a committed compact artifact only if size stays reasonable
  - Concrete source direction from shared research:
    - worldwide layer: `geoBoundaries + GeoNames`
    - U.S. metro layer: official Census / OMB metro datasets
    - `Natural Earth` is acceptable only as a coarse fallback/bootstrap layer
  - Concrete next implementation step:
    - add compiled geo index support (`location-index` / `location-resolver`) and replace the current hand-authored region table
  - Ralph loop iteration:
    - Iteration 1: seed compiled index + runtime loader/resolver + tests
    - Iteration 2: replace seed metro/world data with importer-backed compiled data
    - Iteration 3: consume the official Census workbook from `tmp/geo/us/list1_2023.xlsx` and rebuild metro aliases from authoritative input

### Agent A: Worldwide Data

Owner: dataset/source research for global administrative and place coverage

- [x] Identify candidate worldwide datasets
- [x] Compare licensing, coverage, formats, and practicality
- [x] Recommend primary worldwide source mix
- Notes:
  - Final candidate set reviewed:
    - `geoBoundaries`: strongest fit for comprehensive offline administrative boundaries worldwide.
    - `GeoNames`: strongest fit for place-name aliases, alternate spellings, and multilingual lookup.
    - `Natural Earth`: useful low-weight fallback for coarse global admin coverage.
    - `GADM`: broad coverage but less attractive for simple redistribution/bundling here.
    - Full offline geocoder stacks like `Nominatim`: too heavy for this CLI/repo shape.
  - Concrete findings:
    - `geoBoundaries`
      - Best use: authoritative-enough worldwide admin boundary backbone.
      - Practical use in `sisi`: preprocess polygons into compact bounding boxes / simplified geometry / alias-to-region rows.
      - Why selected: comprehensive ADM coverage and better fit than shipping a full geocoder.
    - `GeoNames`
      - Best use: worldwide place alias dictionary and normalization layer.
      - Practical use in `sisi`: compile aliases, alternate names, country/state names, and likely major populated places into a local lookup index.
      - Why selected: solves text lookup/alias coverage that boundary datasets do not.
    - `Natural Earth`
      - Best use: fallback/bootstrap for ADM0/ADM1 if artifact-size constraints require a lighter initial worldwide layer.
      - Why not primary: not rich enough alone for comprehensive place matching.
  - Final recommendation:
    - Primary worldwide source mix should be `geoBoundaries + GeoNames`.
    - `geoBoundaries` should provide region geometry/bounds.
    - `GeoNames` should provide alias expansion and place-name normalization.
    - `Natural Earth` should remain optional fallback/bootstrap only.
  - Implementation implication for main thread:
    - Do not query raw worldwide datasets at runtime.
    - Build a compiled offline index containing:
      - canonical region ids
      - aliases / alternate names
      - compact bounds / simplified region geometry
      - parent-child containment links where available

### Agent B: U.S. Metro Data

Owner: official U.S. metropolitan / micropolitan / combined statistical area data

- [ ] Identify official Census / OMB data files
- [ ] Recommend exact boundary + delineation inputs
- [ ] Define how metro aliases should map to regions
- Notes:
  - Pending direct write-up. Main-thread source direction is already recorded above:
    - official U.S. metro support should come from Census / OMB datasets
    - initial compiled seed data currently uses placeholder metro bounds for Sacramento and Charlotte
    - next implementation step is to replace those placeholders with imported CBSA/CSA/MSA data
  - Local raw-input convention for this repo:
    - keep authoritative U.S. inputs under `tmp/geo/us/`
    - first target file is the Census delineation workbook `tmp/geo/us/list1_2023.xlsx`

### Agent 1: Census URLs

Owner: exact official Census / OMB source URLs and field mapping

- [x] Confirm exact official inputs for CBSA/CSA/MSA boundaries and delineations
- [x] Record field names/IDs needed for importer
- [x] Add notes for implementation handoff
- Notes:
  - Final official source handoff:
    - Delineations:
      - Census metro/micro delineation files page:
        - https://www.census.gov/geographies/reference-files/time-series/demo/metro-micro/delineation-files.html
      - This is the practical machine-readable source for:
        - CBSA code/title
        - CSA code/title
        - county-to-CBSA / county-to-CSA membership
        - metro vs micro classification
    - Boundaries:
      - Census TIGER/Line / TIGER GeoPackage products page:
        - https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html
        - https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-geopackage-file.html
      - Use CBSA boundary products as the primary geometry/bounds source.
    - Authority:
      - OMB bulletins remain the policy authority for metro definitions.
      - Census delineation + TIGER products should be the importer inputs.
  - Final field handoff for importer normalization:
    - Canonical metro identifiers:
      - `CBSAFP` from TIGER boundary files
      - `CBSA Code` from delineation files
    - Canonical CSA identifiers:
      - `CSAFP` from TIGER products when present
      - `CSA Code` from delineation files
    - Canonical names:
      - `NAME` or `NAMELSAD` / `NAMELSAD20` from TIGER products
      - `CBSA Title`
      - `CSA Title`
    - Type/classification:
      - `LSAD` / `LSAD20`
      - delineation classification columns indicating metropolitan vs micropolitan
    - County membership:
      - `State Code (FIPS)`
      - `County Code (FIPS)`
      - county name / county-equivalent columns
    - Useful join/normalization rule:
      - join TIGER and delineation inputs on normalized CBSA/CSA code strings, never on names
  - Final implementation note:
    - Importer should treat delineation files as the source of hierarchy and aliases, and TIGER as the source of spatial bounds.
    - Titles should be preserved canonically, with derived aliases generated in preprocessing.

### Agent 2: U.S. Importer

Owner: `scripts/lib/us-metro-source.mjs` and related parsing utilities

- [x] Implement initial Census metro source parser scaffolding
- [x] Define normalized metro output shape
- [x] Add/update notes in this section
- Notes:
  - Added fixture-friendly text parsing helpers in `scripts/lib/tabular-text.mjs` so Census source files can be parsed from checked-in fixtures or local downloads without runtime network access.
  - Added `scripts/lib/us-metro-source.mjs` with a normalized metro record shape:
    - `id`, `kind`, `metroType`, `code`
    - `name`, `shortName`, `aliases`
    - `parentIds`, `components`
    - `census`, `source`
    - optional `bounds`, `centroid`
    - raw source row preserved for importer debugging
  - Added conversion helpers to turn normalized metro records into compiled geo-index regions and alias rows.
  - Current scaffold supports delimited Census-style inputs and tolerates multiple field-name variants so it can absorb delineation/reference files without hard-coding one exact layout too early.
  - Next step for handoff:
    - wire real Census/OMB metro fixtures into this parser and use the normalized records in the geo index builder.

### Agent 3: Geo Builder

Owner: `scripts/build-geo-index.mjs` and `scripts/lib/geo-index-builder.mjs`

- [x] Refactor build script into real builder flow
- [x] Wire U.S. metro normalized rows into compiled geo artifact
- [x] Add/update notes in this section
- Notes:
  - `scripts/lib/geo-index-builder.mjs` now owns the normalized compiled index shape and merge logic.
  - `scripts/build-geo-index.mjs` now reads a seed artifact plus optional normalized metro rows and emits a compiled `data/geo/index.json`.
  - The builder accepts metro rows as either an array or an object with `metros` / `metroRows`, so importer code can stay thin.
  - The current artifact contract is still the existing seed shape: `version`, `regions`, `aliases`, and `sources`.
  - Next pass should connect the real Census/OMB importer output into `--metros` and replace the placeholder metro seed rows with authoritative data.

### Agent 4: Runtime Resolver

Owner: `dist/location-index.js`, `dist/location-resolver.js`, `dist/location-db.js`

- [x] Improve runtime support for imported metro/admin hierarchy
- [x] Preserve fallback behavior against Photos metadata
- [x] Add/update notes in this section
- Notes:
  - Runtime now reads the compiled geo index as the first-class source of location truth.
  - Alias matches stay exact in the resolver, while `location-db` expands matched regions through the compiled parent/child hierarchy for query resolution.
  - Region lookups still fall back to Photos moment titles/subtitles when the compiled index does not resolve a place.
  - `location-index` now loads child relationships from the compiled artifact, which is the runtime hook needed for imported metro/admin trees.

### Agent 5: Tests

Owner: `tests/location-index.test.js`, `tests/location-db.test.js`, `tests/live-location.test.js`

- [x] Add fixture/unit coverage for imported metro/admin hierarchy
- [x] Add/update notes in this section
- Notes:
  - Added fixture-backed coverage for hierarchical geo index loading and alias resolution.
  - Verified the compiled index shape supports parent chains like metro -> state -> country.
  - Current test focus is on the imported hierarchy shape, not the final Census/GeoNames data files themselves.

### Agent 6: Worldwide Shape

Owner: worldwide source selection details and compiled shape notes only

- [x] Turn worldwide research into concrete artifact-field requirements
- [x] Add/update notes in this section
- Notes:
  - Concrete compiled-artifact requirements for `geoBoundaries + GeoNames`:
    - canonical region rows:
      - `id`
      - `kind` such as `country`, `admin1`, `admin2`, `metro`, `place`
      - `name`
      - `parentIds`
      - `bounds`
      - optional `centroid`
      - optional `source`
    - alias rows:
      - `alias`
      - `regionId`
      - optional `lang`
      - optional `priority`
      - optional `isPreferred`
    - optional place rows folded into `regions` for major populated places if we want city-level query support without a second runtime table
  - `geoBoundaries` contribution to compiled artifact:
    - canonical admin hierarchy backbone
    - stable region ids generated during preprocessing
    - bounding boxes and simplified containment data
    - parent-child relationships across ADM levels where available
  - `GeoNames` contribution to compiled artifact:
    - alternate names / aliases / ASCII names / common spellings
    - populated-place names that can map to admin containers or direct place rows
    - country/admin code crosswalk material for normalization
  - Minimum viable worldwide artifact for early shipping:
    - ADM0 countries
    - ADM1 first-level admin areas
    - major populated places / aliases
    - parent containment links
    - compact bounds, not full polygons at runtime
  - Later expansion path:
    - add ADM2 where useful
    - add multilingual alias priority rules
    - add optional simplified polygons if bounds prove too broad in dense regions

### Agent C: Repo Integration

Owner: implementation strategy inside this codebase

- [x] Design on-disk compiled index format
- [x] Propose import scripts/modules/tests layout
- [x] Identify smallest viable path to ship in this repo
- Notes:
  - Current repo ships built JS directly in `dist/` and has no `src/` tree, so the least disruptive path is to add a small `scripts/` preprocessing pipeline plus a compiled artifact under a new data directory rather than introducing a larger build system change.
  - Recommended compiled artifact shape:
    - `data/geo/regions.json.zst` or `data/geo/regions.json`
    - top-level arrays/maps for `aliases`, `regions`, and `metros`
    - regions store compact bounding boxes plus optional centroid/radius for broad matching
    - large polygons should not be loaded at runtime for every query; preprocess them into simplified bounds/tiles first
  - Runtime module layout recommendation:
    - `dist/location-db.js`: high-level query resolution against compiled data + Photos metadata
    - `dist/location-index.js`: load/cache compiled geodata artifact
    - `dist/location-resolver.js`: alias expansion + region/metro matching logic
    - keep CLI glue in `dist/cli.js` thin
  - Preprocess/build layout recommendation:
    - `scripts/build-geo-index.mjs`: reads raw source files and emits compact compiled index
    - `scripts/lib/*.mjs`: parsers for source datasets (Census, worldwide source, aliases)
    - raw downloaded source files should stay out of git or live under `tmp/` / ignored cache dir; commit only the compiled minimal artifact if size stays reasonable
  - Test layout recommendation:
    - unit tests for alias normalization, region containment, metro membership
    - fixture-driven integration tests against compiled geo index without touching live Photos DB
    - existing live tests remain opt-in and verify returned UUIDs belong to resolved location sets
  - Smallest viable shipping path:
    - Phase 1: compile a compact U.S. country/state + CBSA/CSA/MSA index plus a lightweight worldwide country/admin1/place alias layer
    - Phase 2: wire resolver to prefer compiled offline index and fall back to Photos moment labels / nearby lat-lon expansion
    - Phase 3: add broader worldwide admin/place density as artifact size allows
  - Important repo constraint:
    - because `sisi` currently runs fully locally, adding live geocoding/network lookup in runtime is the wrong long-term direction; offline compiled data should replace ad hoc network geocoding.

## Decisions

- Repo integration should use an offline precompiled geodata index, not runtime network geocoding.
- Add a preprocessing script pipeline instead of hand-maintaining aliases in runtime code.
- Keep raw source datasets out of normal runtime paths; runtime should load one compact compiled artifact.
- Current committed `data/geo/index.json` is a seed artifact only, not the final authoritative dataset.

## Risks

- Large raw datasets may be too big to commit directly
- Worldwide polygon handling may need preprocessing/compression
- Live tests depend on local Photos DB coverage and local runtime behavior

## Verification Targets

- `beer in sacramento` returns only Sacramento-linked UUIDs
- `beer in charlotte` returns only Charlotte-metro-linked UUIDs
- `beer in massachusetts` returns only Massachusetts-linked UUIDs
- `beer in usa` returns only U.S.-linked UUIDs

## Ralph Loop: Authoritative Census XLSX Ingestion

Owner: shared scratchpad for this iteration

- [x] Confirm local official Census workbook exists at `tmp/geo/us/list1_2023.xlsx`
- [x] Add importer coverage for workbook-driven metro parsing
- [x] Add narrow XLSX reader support for shared strings + sheet rows
- [x] Accept `.xlsx` inputs in `scripts/build-geo-index.mjs`
- [x] Download official TIGER CBSA bounds zip at `tmp/geo/us/tl_2024_us_cbsa.zip`
- [x] Join workbook CBSA codes to TIGER bounds by official CBSA code
- [x] Rebuild geo artifact from the official workbook and verify Sacramento/Roseville share the same metro
- Notes:
  - The U.S. metro importer now reads the official `list1_2023.xlsx` workbook, aggregates county rows into metro rows, and joins them to `tl_2024_us_cbsa.zip` bounds.
  - `data/geo/index.json` has been regenerated from those official U.S. sources and now contains 935 authoritative CBSA metro rows with bounds and aliases.
  - Sacramento and Roseville now resolve to the same authoritative `us-cbsa-40900` region through the compiled index, with Charlotte likewise resolving through `us-cbsa-16740`.
  - Remaining major geo-data task is still the worldwide layer: `geoBoundaries + GeoNames` ingestion and compilation into the same artifact format.

## Ralph Loop: Nationwide U.S. Place-to-Metro Aliases

Owner: shared scratchpad for this iteration

- [x] Download official Census place gazetteer files under `tmp/geo/us/places/`
- [x] Add TIGER CBSA polygon loading / point-in-polygon support for place centroid assignment
- [x] Map nationwide U.S. place names into containing CBSAs and emit alias rows
- [x] Keep semantic-only searches unchanged unless the query contains an explicit location clause
- [x] Rebuild `data/geo/index.json` from workbook + TIGER CBSA + place gazetteer
- Notes:
  - The compiled U.S. geo artifact now includes nationwide place aliases from the Census gazetteer files under `tmp/geo/us/places/`, mapped onto official CBSA polygons.
  - This closes the main MSA gap: non-title cities like `Davis, CA` and `Rock Hill, SC` now resolve to Sacramento’s and Charlotte’s metros even though they are not in the CBSA title.
  - Bare city names can still be ambiguous nationwide; the compiled index now also includes state-qualified aliases like `davis, ca` and `rock hill, sc` to disambiguate those cases.
