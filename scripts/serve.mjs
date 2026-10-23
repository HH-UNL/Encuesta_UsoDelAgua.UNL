#!/usr/bin/env node
/**
 * Servidor estático mínimo para previsualizar site/ y dashboard/
 * Uso: node scripts/serve.mjs [puerto]
 *   /            → site/index.html
 *   /site/*      → site/* (alias, igual que en Pages)
 *   /dashboard/  → dashboard/index.html
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

if (!fs.existsSync(SITE)) {
  console.error('No existe site/. Ejecuta antes: npm run build');
  process.exit(1);
}

http
  .createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const isDash = url === '/dashboard' || url.startsWith('/dashboard/');
    const isSite = url === '/site' || url.startsWith('/site/');
    const base = isDash ? path.join(ROOT, 'dashboard') : SITE;
    const rel = isDash
      ? url.slice('/dashboard'.length)
      : isSite
        ? url.slice('/site'.length)
        : url;
    let file = path.join(base, rel === '/' || rel === '' ? 'index.html' : rel);
    if (!file.startsWith(base)) {
      res.writeHead(403).end('Prohibido');
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, 'index.html');
    }
    if (!fs.existsSync(file)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 — no encontrado');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => {
    console.log(`Servidor en http://localhost:${PORT}`);
  });
