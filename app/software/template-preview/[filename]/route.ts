import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { HTML_TEMPLATE_FILES } from '../../src/data/htmlTemplateFiles';

const TEMPLATE_FILES = new Set<string>(HTML_TEMPLATE_FILES);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  if (!TEMPLATE_FILES.has(filename)) {
    return new Response('Template not found.', { status: 404 });
  }

  const filePath = path.join(process.cwd(), 'app', 'software', 'src', 'html', filename);
  const html = await readFile(filePath, 'utf8');

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
