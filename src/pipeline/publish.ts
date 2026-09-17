import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import { paths } from '../config';
import { shortsDocSchema, urlProblem, type ShortsClip, type ShortsDoc } from '../schema';
import { ensureDir, readJson, writeJson } from '../util';
import type { RenderResult } from './render';
import type { ClipScript } from './script';
import type { Selected } from './select';
import type { VoiceResult } from './voice';

export interface Publishable {
  item: Selected;
  script: ClipScript;
  voice: VoiceResult;
  rendered: RenderResult;
}

const round = (n: number) => Math.round(n * 100) / 100;
const safeHref = (href?: string) => (href && urlProblem(href) === null ? href : undefined);

function toClip(date: string, { item, script, voice, rendered }: Publishable): ShortsClip {
  return {
    id: item.id,
    title: script.title,
    caption: script.caption,
    video: paths.mediaRef(date, item.id, 'mp4'),
    poster: paths.mediaRef(date, item.id, 'jpg'),
    ...(rendered.posterBlur ? { posterBlur: rendered.posterBlur } : {}),
    durationSec: round(rendered.durationSec),
    captions: voice.captions.map((c) => ({
      start: round(c.start),
      end: round(c.end),
      text: c.text,
    })),
    source: {
      kind: item.kind,
      title: item.title,
      ...(safeHref(item.href) ? { href: safeHref(item.href) } : {}),
      ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
    },
    tickers: script.tickers,
    tags: script.tags,
    createdAt: new Date().toISOString(),
  };
}

export async function publish(date: string, entries: Publishable[]): Promise<ShortsDoc> {
  const dir = paths.mediaDir(date);
  ensureDir(dir);

  const fresh: ShortsClip[] = [];
  for (const entry of entries) {
    await copyFile(entry.rendered.video, path.join(dir, `${entry.item.id}.mp4`));
    await copyFile(entry.rendered.poster, path.join(dir, `${entry.item.id}.jpg`));
    fresh.push(toClip(date, entry));
  }

  const existing = (await readJson<ShortsDoc>(paths.daily(date)))?.clips ?? [];
  const byId = new Map(existing.map((clip) => [clip.id, clip]));
  for (const clip of fresh) byId.set(clip.id, clip);

  const parsed = shortsDocSchema.safeParse({ v: 1, date, clips: [...byId.values()] });
  if (!parsed.success) {
    throw new Error(
      `daily doc failed validation:\n${parsed.error.issues
        .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('\n')}`,
    );
  }

  await writeJson(paths.daily(date), parsed.data);
  return parsed.data;
}
