import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const root = new URL('../', import.meta.url);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
    const file = new URL(path, root);
    if (!file.href.startsWith(root.href) || !types[extname(file.pathname)]) throw new Error('Unknown asset');
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file.pathname)] });
    response.end(data);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}).listen(process.env.EXILE_PORT || 4173, '127.0.0.1', () => console.log(`Exile Loadouts running at http://127.0.0.1:${process.env.EXILE_PORT || 4173}`));
