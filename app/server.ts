import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT || 3000);
const distDirectory = resolve(dirname(fileURLToPath(import.meta.url)), 'dist');
const indexFile = resolve(distDirectory, 'index.html');

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

if (!existsSync(indexFile)) {
  throw new Error(`Production build not found at ${indexFile}. Run the app build before starting the server.`);
}

app.use(express.static(distDirectory, { index: false }));
app.get('*', (_request, response) => {
  response.sendFile(indexFile);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`One Fin Software is listening on port ${port}.`);
});
