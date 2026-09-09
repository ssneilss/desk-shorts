import { bookScore, matchBook, type BookIndex } from '../book';
import { cfg } from '../config';
import type { SourceItem } from '../plugin';
import type { ShortsSourceKind } from '../schema';
import { clamp, clipId, log } from '../util';

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
  (item.images.length ? 2 : 0) +
  (item.tickers.length ? 2 : 0) +
  clamp(item.body.length / 400, 0, 2);

const coverage = (item: SourceItem, book: BookIndex | null) =>
  book ? bookScore(matchBook(book, { tickers: item.tickers, texts: [item.title, item.body] })) : 0;

/** Rank, dedupe by href/title, and cap. Names the firm holds or watches win. */
export function select(
  items: SourceItem[],
  date: string,
  limit = 6,
  book: BookIndex | null = null,
): Selected[] {
  const seen = new Set<string>();
  const picked: Selected[] = [];

  const scored = items
    .filter((item) => item.title.trim().length > 8 && item.body.trim().length >= 40)
    .map((item, index) => {
      const inBook = coverage(item, book);
      return { item, index, inBook, score: score(item) + inBook * 3 };
    });

  const covered = scored.filter((s) => s.inBook).length;
  if (book) log(`book: ${covered} of ${scored.length} item(s) in coverage`);

  const ranked = (book && cfg.coverageOnly ? scored.filter((s) => s.inBook) : scored).sort(
    (a, b) => b.score - a.score || a.index - b.index,
  );

  for (const { item } of ranked) {
    const keys = [key(item.title), item.href ? key(item.href) : ''].filter(Boolean);
    if (keys.some((k) => seen.has(k))) continue;
    for (const k of keys) seen.add(k);
    picked.push({ ...item, id: clipId(item.href ?? item.title, date) });
    if (picked.length >= limit) break;
  }

  return picked;
}
