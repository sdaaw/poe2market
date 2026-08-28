/**
 * Local preview server for the static site in public/.
 *
 * The site itself is fully static — this exists so you can look at it over http
 * rather than file://, and it is not what runs in production. Deliberately
 * dependency-free so CI can build the site with no install step.
 *
 *   node server/index.js        (or: npm start)
 */
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.env.PORT || 3000);

/** Kept in step with the meta tag in public/index.html. */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: https://web.poecdn.com",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'"
].join('; ');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

async function resolve(urlPath) {
  // Strip the query, decode, and refuse anything that climbs out of public/.
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const target = path.join(ROOT, clean);
  if (!target.startsWith(ROOT)) return null;

  try {
    const info = await stat(target);
    if (info.isDirectory()) return resolve(path.posix.join(clean, 'index.html'));
    return target;
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const file = (await resolve(req.url)) ?? (await resolve('/index.html'));

  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    // Always revalidate locally so edits show up on refresh.
    'Cache-Control': 'no-cache',
    // Mirrors the meta tag in index.html so local development behaves like the
    // deployed site. frame-ancestors and X-Frame-Options are header-only, so they
    // can be set here but not on GitHub Pages.
    'Content-Security-Policy': `${CSP}; frame-ancestors 'none'`,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`\n  PoE2 Market  ->  http://localhost:${PORT}`);
  console.log(`  serving ${path.relative(process.cwd(), ROOT)}  ·  refresh data with: npm run refresh\n`);
});
