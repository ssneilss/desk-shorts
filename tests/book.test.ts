import { describe, expect, test } from 'bun:test';
import {
  bookScore,
  buildBookIndex,
  matchBook,
  normalizeTicker,
  type Book,
  type BookIndex,
} from '../src/book';

const book: Book = {
  positions: [
    { ticker: '1024 HK', name: 'KUAISHOU TECHNOLOGY', side: 'Long', analyst: 'Kevin Sun' },
    { ticker: '2020 HK', name: 'ANTA SPORTS PRODUCTS', side: 'Long', analyst: 'Kevin Sun' },
    { ticker: '3690 HK', name: 'MEITUAN', side: 'Short', analyst: 'Kevin Sun' },
  ],
  watchlist: [
    { analyst: 'Joseph She', names: ['Nanya Technology Corp. (2408)', 'Prosus NV (PRX)'] },
  ],
};

const index: BookIndex = buildBookIndex(book);

const hits = (tickers: string[], ...texts: string[]) =>
  matchBook(index, { tickers, texts });

describe('normalizeTicker', () => {
  test('collapses every exchange suffix to the root symbol', () => {
    expect(normalizeTicker('1024 HK')).toBe('1024');
    expect(normalizeTicker('1024.HK')).toBe('1024');
    expect(normalizeTicker('1810_HK')).toBe('1810');
    expect(normalizeTicker('002466.SZ')).toBe('002466');
    expect(normalizeTicker(undefined)).toBe('');
  });
});

describe('matchBook', () => {
  test('matches a position by every ticker form', () => {
    for (const form of ['1024 HK', '1024.HK', '1024_HK']) {
      expect(hits([form], 'Some headline')[0]?.ticker).toBe('1024 HK');
    }
  });

  test('reads a ticker out of a parenthetical in the text', () => {
    expect(hits([], 'Nanya Technology Corp. (2408) guides up')[0]?.side).toBe('Watch');
  });

  test('matches an exact multi-word company phrase', () => {
    expect(hits([], 'Anta Sports Products lifts FY guidance')[0]?.ticker).toBe('2020 HK');
  });

  test('never matches a single token of a name', () => {
    expect(hits([], 'Anta beat on margin')).toEqual([]);
    expect(hits([], 'Kuaishou lifts ad take-rate')).toEqual([]);
    expect(hits([], 'Meituan is not in the phrase index')).toEqual([]);
    expect(hits([], 'Nanya beat')).toEqual([]);
  });

  test('ranks positions before watchlist entries', () => {
    const found = hits(['2408'], 'Anta Sports Products and Nanya both moved');
    expect(found.map((h) => h.side)).toEqual(['Long', 'Watch']);
  });
});

describe('bookScore', () => {
  test('is 2 for held, 1 for watched, 0 for neither', () => {
    expect(bookScore(hits(['1024.HK']))).toBe(2);
    expect(bookScore(hits(['2408']))).toBe(1);
    expect(bookScore(hits(['NVDA']))).toBe(0);
  });

  test('a held name outranks a watched one in the same item', () => {
    expect(bookScore(hits(['2408', '3690.HK']))).toBe(2);
  });
});
