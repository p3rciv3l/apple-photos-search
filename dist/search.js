import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { open } from 'openurl2';
/**
 * Compute the embedding for text or image depending on the query.
 */
export async function computeEmbeddingForQuery(clip, query) {
    const input = {};
    try {
        // If the query is an URL, treat it as image.
        const url = new URL(query);
        let image;
        if (url.protocol == 'file:') {
            image = fileURLToPath(url);
        }
        else {
            const response = await fetch(url);
            image = await response.arrayBuffer();
        }
        input.images = await clip.processImages([image]);
    }
    catch (error) {
        if (error instanceof TypeError && error.message == 'Invalid URL') {
            // Expected error when query is not an URL.
        }
        else {
            throw new Error(`Can not get image from the query URL: ${error.message}`);
        }
    }
    if (!input.images)
        input.labels = [query];
    const output = clip.computeEmbeddings(input);
    return {
        isTextQuery: !input.images,
        queryEmbeddings: input.images ? output.imageEmbeddings
            : output.labelEmbeddings,
    };
}
/**
 * Print the results in HTML served from a local server,
 * with click-to-open-in-Photos support.
 */
export function presentResults(query, results) {
    const uuidRegex = /([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})/i;

    // Map index -> filePath for serving images
    const filePaths = results.map(r => r.filePath);

    const imgs = results.map((r, i) => {
        const uuid = r.filePath.match(uuidRegex)?.[1];
        const openAttr = uuid
            ? `onclick="openInPhotos('${uuid}', this); return false;" href="#"`
            : `target="_blank" href="${pathToFileURL(r.filePath)}"`;
        return `
<div>
  <a ${openAttr}>
    <img src="/img/${i}">
  </a>
  <span class="score">Score: ${r.score.toFixed(2)}</span>
  <span class="status" id="status-${i}"></span>
</div>`;
    });

    const html = `<!DOCTYPE html>
<head>
<title>sisi search "${query}"</title>
<style>
  body {
    column-count: ${Math.min(results.length, 5)};
    column-gap: 1em;
    margin: 1em;
    background: #1a1a1a;
    color: #ccc;
  }
  div {
    box-shadow: 0px 1px 8px 0px rgba(0,0,0,0.3);
    display: inline-block;
    width: 100%;
    margin-bottom: 1em;
    background: #222;
    border-radius: 6px;
    overflow: hidden;
  }
  a { cursor: pointer; }
  img {
    display: block;
    width: 100%;
    transition: opacity 0.2s;
  }
  a:hover img { opacity: 0.8; }
  span {
    line-height: 1.5em;
    font-family: system-ui;
    display: flex;
    justify-content: center;
  }
  .status {
    font-size: 0.85em;
    color: #7c7;
    min-height: 1.5em;
  }
</style>
</head>
<body>
${imgs.join('')}
<script>
async function openInPhotos(uuid, el) {
  const idx = el.closest('div').querySelector('[id^=status-]').id.split('-')[1];
  const statusEl = document.getElementById('status-' + idx);
  statusEl.textContent = 'Opening in Photos...';
  try {
    const res = await fetch('/open/' + uuid);
    if (res.ok) {
      statusEl.textContent = 'Opened in Photos';
    } else {
      const text = await res.text();
      statusEl.textContent = text || 'Failed to open';
      statusEl.style.color = '#c77';
    }
  } catch(e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.style.color = '#c77';
  }
  setTimeout(() => { statusEl.textContent = ''; statusEl.style.color = '#7c7'; }, 3000);
}
</script>
</body>`;

    return new Promise((_resolve) => {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`);

        // Serve an image by index
        const imgMatch = url.pathname.match(/^\/img\/(\d+)$/);
        if (imgMatch) {
            const idx = parseInt(imgMatch[1]);
            if (idx >= 0 && idx < filePaths.length) {
                const filePath = filePaths[idx];
                const ext = filePath.split('.').pop().toLowerCase();
                const mimeTypes = {
                    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
                    gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
                };
                res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
                fs.createReadStream(filePath).pipe(res);
                return;
            }
        }

        // Open a photo in Apple Photos by UUID
        const openMatch = url.pathname.match(/^\/open\/([0-9A-Fa-f-]+)$/);
        if (openMatch) {
            const uuid = openMatch[1];
            const script = `tell application "Photos"
    activate
    set thePhoto to media item id "${uuid}/L0/001"
    spotlight thePhoto
end tell`;
            execFile('osascript', ['-e', script], (error, stdout, stderr) => {
                if (error) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end(stderr || error.message);
                } else {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('ok');
                }
            });
            return;
        }

        // Serve the main page
        if (url.pathname === '/' || url.pathname === '') {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
            return;
        }

        res.writeHead(404);
        res.end('Not found');
    });

    server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        const url = `http://127.0.0.1:${port}/`;
        console.log(`Results server running at ${url}`);
        console.log('Press Ctrl+C to stop.');
        open(url);
    });
    }); // promise never resolves — server runs until Ctrl+C
}
