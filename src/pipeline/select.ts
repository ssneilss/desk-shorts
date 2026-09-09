import type { ShortsSourceKind } from '../schema';
import type { SourceItem } from '../sources';
import { clamp, clipId } from '../util';

export interface Selected extends SourceItem {
  id: string;
}

const KIND_WEIGHT: Record<ShortsSourceKind, number> = {
  meeting: 4,
  desk: 3,
  report: 2,
  'daily-update': 2,
  news: 1,
  other: 0,
};

const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const score = (item: SourceItem) =>
  KIND_WEIGHT[item.kind] +
  (item.image ? 2 : 0) +
  (item.tickers.length ? 2 : 0) +
  clamp(item.body.length / 400, 0, 2);

/** Rank, dedupe by href/title, and cap. Items with art and tickers win ties. */
export function select(items: SourceItem[], date: string, limit = 6): Selected[] {
  const seen = new Set<string>();
  const picked: Selected[] = [];

  const ranked = items
    .filter((item) => item.title.trim().length > 8 && item.body.trim().length >= 40)
    .map((item, index) => ({ item, index, score: score(item) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  for (const { item } of ranked) {
    const keys = [key(item.title), item.href ? key(item.href) : ''].filter(Boolean);
    if (keys.some((k) => seen.has(k))) continue;
    for (const k of keys) seen.add(k);
    picked.push({ ...item, id: clipId(item.href ?? item.title, date) });
    if (picked.length >= limit) break;
  }

  return picked;
}
