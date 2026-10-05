// Bündelt src/ zu EINER offline-fähigen Datei dist/SkinEditor.html (three.js eingebettet).
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const out = await build({
  entryPoints: [new URL('src/main.js', root).pathname.replace(/^\/(\w:)/, '$1')],
  bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', legalComments: 'none',
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\/script');
const css = await readFile(new URL('src/style.css', root), 'utf8');
let html = await readFile(new URL('src/index.html', root), 'utf8');
html = html.replace('<!--STYLE-->', () => `<style>${css}</style>`)
           .replace('<!--SCRIPT-->', () => `<script>${js}</script>`);
await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/SkinEditor.html', root), html);
console.log(`dist/SkinEditor.html  ${(html.length / 1024).toFixed(0)} KB`);
