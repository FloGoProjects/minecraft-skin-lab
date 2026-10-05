// Minimaler statischer Server für dist/ (nur zum Testen im Browser).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const port = Number(process.env.PORT) || 5178;
createServer(async (req, res) => {
  try {
    const body = await readFile(new URL('../dist/SkinEditor.html', import.meta.url));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('Erst "npm run build" ausführen.');
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
