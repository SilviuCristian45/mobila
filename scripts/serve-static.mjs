// Server de fișiere statice „strict” care EMULEAZĂ o gazdă simplă: fără rescrieri SPA, redirect director→director/ (308, păstrează query), 404.html la lipsă.
// NU este un test pe o gazdă reală (GitHub Pages/Cloudflare/Netlify); este un model al comportamentului minim comun.
// Utilizare: node scripts/serve-static.mjs <dir> <port> [prefix]  (PRETTY=1 pentru „pretty URLs”)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const [dir = 'out', port = '4173', prefixArg = ''] = process.argv.slice(2);
const prefix = prefixArg.replace(/\/$/, '');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};
const log = [];

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  const send = async (file, status = 200) => {
    const body = await readFile(file);
    res.writeHead(status, {
      'content-type': types[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  };
  const notFound = async () => {
    log.push(`404 ${req.url}`);
    try {
      await send(join(dir, '404.html'), 404);
    } catch {
      res.writeHead(404);
      res.end('404');
    }
  };
  if (prefix) {
    if (p !== prefix && !p.startsWith(prefix + '/')) return notFound();
    p = p.slice(prefix.length) || '/';
  }
  const fs = normalize(join(dir, p));
  if (!fs.startsWith(normalize(dir))) return notFound();
  try {
    if (process.env.PRETTY === '1' && !extname(fs)) {
      try {
        await stat(fs + '.html');
        return await send(fs + '.html');
      } catch {}
    }
    const s = await stat(fs);
    if (s.isDirectory()) {
      if (!p.endsWith('/')) {
        res.writeHead(308, { location: `${prefix}${p}/${url.search}` });
        return res.end();
      }
      return await send(join(fs, 'index.html'));
    }
    return await send(fs);
  } catch {
    return notFound();
  }
}).listen(Number(port), () => console.log(`serving ${dir} on :${port} prefix='${prefix}'`));
