import http from 'http';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

// In the packaged app we serve the renderer over http://localhost instead of
// file:// so it has a real web origin. Without this, YouTube (and other embeds)
// refuse to load from a file:// origin (Error 153). In dev we already use Vite's
// http server, so this only kicks in when packaged.

// A FIXED port so the renderer's origin (http://localhost:PORT) is stable
// across launches. localStorage — where Supabase stores the auth session — is
// keyed by origin, so a changing port would silently log the user out every run.
const FIXED_PORT = 41847;

let baseUrl = '';

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

export function startRendererServer(rendererDir: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const root = path.normalize(rendererDir);
    const server = http.createServer((req, res) => {
      try {
        const reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
        const rel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
        const filePath = path.normalize(path.join(root, rel));
        if (!filePath.startsWith(root)) {
          res.writeHead(403);
          res.end();
          return;
        }
        const data = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.on('error', () => {
      // Port already in use (e.g. a second instance). Reuse the same stable
      // origin so the app still loads and auth persistence isn't broken.
      baseUrl = `http://localhost:${FIXED_PORT}`;
      resolve(baseUrl);
    });
    server.listen(FIXED_PORT, '127.0.0.1', () => {
      baseUrl = `http://localhost:${FIXED_PORT}`;
      resolve(baseUrl);
    });
  });
}

// URL for a renderer page — Vite in dev, our static server when packaged.
export function rendererUrl(page: string): string {
  if (!app.isPackaged) return `http://localhost:5173/${page}`;
  return `${baseUrl}/${page}`;
}
