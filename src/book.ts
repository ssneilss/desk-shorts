import { z } from 'zod';
import { paths } from './config';
import { s3Text } from './providers/s3';
import { cached, log } from './util';

export type BookSide = 'Long' | 'Short' | 'Watch';

export interface BookHit {
  side: BookSide;
  /** Display ticker as the book writes it, e.g. `3690 HK`. */
  ticker: string;
  name: string;
  analyst?: string;
}

export interface Book {
  positions: { ticker: string; name: string; side: 'Long' | 'Short'; analyst?: string }[];
  watchlist: { analyst: string; names: string[] }[];
}

interface NameEntry {
  phrase: string;
  hit: BookHit;
}

export interface BookIndex {
  byTicker: Map<string, BookHit>;
  byName: NameEntry[];
  size: number;
}

const portfolioDoc = z
  .object({
    positions: z
      .array(
        z
          .object({
            Ticker: z.string(),
            SymbolLongName: z.string().default(''),
            'Long/Short': z.enum(['Long', 'Short']).default('Long'),
            'Analyst 1': z.string().optional(),
          })
          .loose(),
      )
      .default([]),
  })
  .loose();

const watchlistDoc = z.array(
  z.object({ Analyst: z.string().default(''), Watchlist: z.array(z.string()).default([]) }).loose(),
);

/** Words that carry no identifying power in a company name. */
const STOPWORDS = new Set(
  `THE AND GROUP HOLDINGS HOLDING TECHNOLOGY TECHNOLOGIES CORP CORPORATION INC
   LTD LIMITED CO COMPANY PLC INTERNATIONAL SECURITIES INDUSTRIAL INDUSTRIES
   INDUSTRY SCIENCE SCIENCES PRODUCTS SERVICES SOLUTIONS SYSTEMS COMMON STOCK
   SPONSORED ADS ADR CL CLASS JOINT`
    .split(/\s+/)
    .filter(Boolean),
);

/**
 * `1288.HK` → `1288`, `1024 HK` → `1024`, `1810_HK` → `1810`. Exchange suffixes
 * differ between the book, the Signal Desk and the document store, so
 * everything collapses to the root symbol.
 */
export function normalizeTicker(raw: string | undefined): string {
  if (!raw) return '';
  return raw.trim().toUpperCase().split(/[._\s/]/)[0] ?? '';
}

function nameTokens(name: string): string[] {
  return name
    .replace(/\([^)]*\)/g, ' ')
    .toUpperCase()
    .split(/[^A-Z0-9'&-]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * Precision over recall: only a ticker match or an exact multi-word company
 * phrase counts. Single-token name matching was tried and rejected upstream —
 * "growth strategy untouched" matched the position STRATEGY INC — and a false
 * match promotes the wrong clip.
 */
export function buildBookIndex(book: Book | null | undefined): BookIndex {
  const byTicker = new Map<string, BookHit>();
  const byName: NameEntry[] = [];

  const addName = (name: string, hit: BookHit) => {
    const tokens = nameTokens(name);
    if (tokens.length < 2) return;
    byName.push({ phrase: tokens.join(' '), hit });
  };

  for (const p of book?.positions ?? []) {
    const key = normalizeTicker(p.ticker);
    const hit: BookHit = { side: p.side, ticker: p.ticker, name: p.name, analyst: p.analyst };
    if (key) byTicker.set(key, hit);
    addName(p.name, hit);
  }

  for (const entry of book?.watchlist ?? []) {
    for (const raw of entry.names) {
      const paren = /\(([^)]+)\)\s*$/.exec(raw)?.[1];
      const key = normalizeTicker(paren ?? raw);
      const hit: BookHit = {
        side: 'Watch',
        ticker: (paren ?? raw).trim(),
        name: raw.replace(/\s*\([^)]*\)\s*$/, '').trim() || raw,
        analyst: entry.analyst,
      };
      if (key && !byTicker.has(key)) byTicker.set(key, hit);
      addName(hit.name, hit);
    }
  }

  return { byTicker, byName, size: byTicker.size };
}

/** Tickers an item claims, from its own field and from `(NNNN.XX)` in text. */
export function tickerCandidates(
  tickers: string[] | undefined,
  ...texts: (string | undefined)[]
): string[] {
  const out = new Set<string>();
  for (const t of tickers ?? []) {
    const n = normalizeTicker(t);
    if (n) out.add(n);
  }
  for (const text of texts) {
    for (const m of (text ?? '').matchAll(/\(([A-Z0-9]{2,6}(?:\.[A-Z]{1,3})?)\)/g)) {
      const n = normalizeTicker(m[1]);
      if (n) out.add(n);
    }
  }
  return [...out];
}

const haystack = (texts: (string | undefined)[]) =>
  ` ${texts
    .filter(Boolean)
    .join(' ')
    .toUpperCase()
    .split(/[^A-Z0-9'&-]+/)
    .filter(Boolean)
    .join(' ')} `;

const sideRank = (side: BookSide) => (side === 'Watch' ? 1 : 0);

/** Every distinct book hit for one item, positions before watchlist. */
export function matchBook(
  index: BookIndex,
  input: { tickers?: string[]; texts: (string | undefined)[] },
): BookHit[] {
  const found = new Map<string, BookHit>();

  for (const key of tickerCandidates(input.tickers, ...input.texts)) {
    const hit = index.byTicker.get(key);
    if (hit) found.set(`${hit.side}:${hit.ticker}`, hit);
  }

  if (index.byName.length) {
    const hay = haystack(input.texts);
    for (const { phrase, hit } of index.byName) {
      if (hay.includes(` ${phrase} `)) found.set(`${hit.side}:${hit.ticker}`, hit);
    }
  }

  return [...found.values()].sort((a, b) => sideRank(a.side) - sideRank(b.side));
}

/** Held beats watched beats everything else. */
export function bookScore(hits: BookHit[]): number {
  if (!hits.length) return 0;
  return hits.some((h) => h.side !== 'Watch') ? 2 : 1;
}

async function fetchBook(): Promise<Book> {
  const [portfolio, watchlists] = await Promise.all([
    s3Text('daily-updates/live-portfolio.json'),
    s3Text('daily-updates/watchlist.json'),
  ]);
  return {
    positions: portfolioDoc.parse(JSON.parse(portfolio)).positions.map((p) => ({
      ticker: p.Ticker,
      name: p.SymbolLongName,
      side: p['Long/Short'],
      analyst: p['Analyst 1'],
    })),
    watchlist: watchlistDoc
      .parse(JSON.parse(watchlists))
      .map((w) => ({ analyst: w.Analyst, names: w.Watchlist })),
  };
}

/** The firm's live positions and analyst watchlists; `null` when unreachable. */
export async function loadBook(date: string): Promise<BookIndex | null> {
  try {
    const book = await cached(paths.book(date), fetchBook);
    const index = buildBookIndex(book);
    log(`book: ${book.positions.length} position(s), ${index.size} symbol(s)`);
    return index;
  } catch (err) {
    log(`book: unavailable — ${(err as Error).message}`);
    return null;
  }
}
