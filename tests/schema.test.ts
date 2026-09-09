import { describe, expect, test } from 'bun:test';
import { parseShortsDoc, shortsDocSchema } from '../src/schema';

const clip = {
  id: 'abc123XY_-z',
  title: 'PDD margins hold up',
  caption: 'Take-rate expansion offsets subsidy spend.',
  video: 'shorts/media/2026-09-09/abc123XY_-z.mp4',
  poster: 'shorts/media/2026-09-09/abc123XY_-z.jpg',
  posterBlur: `data:image/jpeg;base64,${'A'.repeat(200)}`,
  durationSec: 42.5,
  captions: [{ start: 0, end: 1.4, text: 'PDD margins hold' }],
  source: { kind: 'desk', title: 'PDD 2Q review', href: 'https://example.com/pdd' },
  tickers: ['PDD'],
  tags: ['china', 'ecommerce'],
  createdAt: '2026-09-09T01:02:03.000Z',
};

const doc = { v: 1, date: '2026-09-09', clips: [clip] };

describe('shorts schema', () => {
  test('round-trips a valid document', () => {
    const parsed = parseShortsDoc(JSON.stringify(doc));
    expect(parsed.errors).toBeUndefined();
    expect(JSON.parse(JSON.stringify(parsed.doc))).toEqual(doc);
  });

  test('applies array defaults', () => {
    const bare = { ...clip, captions: undefined, tags: undefined, tickers: undefined };
    const result = shortsDocSchema.parse({ v: 1, date: '2026-09-09', clips: [bare] });
    expect(result.clips[0]?.tags).toEqual([]);
    expect(result.clips[0]?.captions).toEqual([]);
  });

  test.each([
    ['bad media ref', { ...clip, video: 'media/x.mp4' }],
    ['http poster', { ...clip, poster: 'http://example.com/a.jpg' }],
    ['bad id', { ...clip, id: 'no spaces here!' }],
    ['zero duration', { ...clip, durationSec: 0 }],
    ['oversized blur', { ...clip, posterBlur: `data:image/jpeg;base64,${'A'.repeat(5000)}` }],
    ['unknown kind', { ...clip, source: { kind: 'podcast', title: 'x' } }],
  ])('rejects %s', (_name, broken) => {
    const parsed = parseShortsDoc(JSON.stringify({ ...doc, clips: [broken] }));
    expect(parsed.errors?.length).toBeGreaterThan(0);
  });

  test('rejects an empty day and malformed JSON', () => {
    expect(parseShortsDoc(JSON.stringify({ v: 1, date: '2026-09-09', clips: [] })).errors).toBeDefined();
    expect(parseShortsDoc('{').errors?.[0]).toContain('not valid JSON');
  });
});
