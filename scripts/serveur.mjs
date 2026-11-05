// Serveur local : npm start puis http://localhost:8080
// Par défaut, la page lit les données publiées par NeoScribVisu (https://bibliogironde.github.io/NeoScribVisu/data/).
// Pour tester avec un import local de NeoScribVisu : npm start -- ../NeoScribVisu/public/data
// puis ouvrir http://localhost:8080/?donnees=donnees/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(RACINE, 'public');
const DONNEES = process.argv[2] ? path.resolve(process.argv[2]) : null;
const PORT = Number(process.env.PORT ?? 8080);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const [dossier, relatif] = DONNEES && url.startsWith('/donnees/') ? [DONNEES, url.slice('/donnees'.length)] : [PUBLIC, url];
  const fichier = path.join(dossier, relatif.endsWith('/') ? `${relatif}index.html` : relatif);
  if (!fichier.startsWith(dossier) || !fs.existsSync(fichier)) { res.writeHead(404); res.end('Introuvable'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(fichier)] ?? 'application/octet-stream' });
  fs.createReadStream(fichier).pipe(res);
}).listen(PORT, () => console.log(`http://localhost:${PORT}${DONNEES ? '/?donnees=donnees/' : ''}`));
