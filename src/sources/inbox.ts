import { readdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { paths } from '../config';
import { SHORTS_SOURCE_KINDS, type ShortsSourceKind } from '../schema';
import { ensureDir, extractTickers, log } from '../util';
import type { SourceItem } from './index';

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseFrontMatter(text: string): {
  meta: Record<string, string>;
  body: string;
} {
  const match = FRONT_MATTER.exec(text);
  if (!match?.[1]) return { meta: {}, body: text.trim() };
  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const at = line.indexOf(':');
    if (at < 1) continue;
    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim().replace(/^["']|["']$/g, '');
    if (key && value) meta[key] = value;
  }
  return { meta, body: text.slice(match[0].length).trim() };
}

const asKind = (value?: string): ShortsSourceKind =>
  (SHORTS_SOURCE_KINDS as readonly string[]).includes(value ?? '')
    ? (value as ShortsSourceKind)
    : 'meeting';

export async function loadInbox(date: string): Promise<SourceItem[]> {
  let names: string[];
  try {
    names = await readdir(paths.inbox);
  } catch {
    return [];
  }

  const items: SourceItem[] = [];
  for (const name of names.filter((n) => n.endsWith('.md')).sort()) {
    const file = path.join(paths.inbox, name);
    const { meta, body } = parseFrontMatter(await Bun.file(file).text());
    const title =
      meta.title ??
      /^#\s+(.+)$/m.exec(body)?.[1]?.trim() ??
      name.replace(/\.md$/, '').replace(/[-_]/g, ' ');
    items.push({
      kind: asKind(meta.kind),
      title,
      body: body.replace(/^#\s+.+$/m, '').trim(),
      href: meta.href?.startsWith('https://') ? meta.href : undefined,
      tickers: extractTickers(`${title} ${body.slice(0, 600)}`),
      publishedAt: meta.date ?? date,
      file,
    });
  }
  return items;
}

export async function archiveInbox(items: SourceItem[]) {
  const files = [...new Set(items.map((i) => i.file).filter((f): f is string => Boolean(f)))];
  if (!files.length) return;
  ensureDir(paths.inboxDone);
  for (const file of files) {
    await rename(file, path.join(paths.inboxDone, path.basename(file)));
  }
  log(`archived ${files.length} inbox file(s) to inbox/done/`);
}
