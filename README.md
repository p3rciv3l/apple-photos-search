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

## License
MIT
