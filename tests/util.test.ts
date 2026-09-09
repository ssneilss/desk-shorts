import { describe, expect, test } from 'bun:test';
import { parseFrontMatter } from '../src/sources/inbox';
import { clipId, extractTickers, stripHtml } from '../src/util';

describe('clip ids', () => {
  const href = 'https://example.com/pdd-2q';

  test('are stable, url-safe and schema-shaped', () => {
    const id = clipId(href, '2026-09-09');
    expect(id).toBe(clipId(href, '2026-09-09'));
    expect(id).toMatch(/^[A-Za-z0-9_-]{4,64}$/);
    expect(id).toHaveLength(12);
  });

  test('differ per date and per source', () => {
    expect(clipId(href, '2026-09-09')).not.toBe(clipId(href, '2026-09-10'));
    expect(clipId(href, '2026-09-09')).not.toBe(clipId('https://example.com/x', '2026-09-09'));
  });
});

describe('stripHtml', () => {
  test('unwraps markup, entities and block breaks', () => {
    const html = '<p>Take-rate <b>rose</b> 4%</p><p>Guide &amp; risk &lt;flat&gt;</p>';
    expect(stripHtml(html)).toBe('Take-rate rose 4%\nGuide & risk <flat>');
  });

  test('drops scripts entirely', () => {
    expect(stripHtml('<script>alert(1)</script>hi')).toBe('hi');
  });
});

describe('extractTickers', () => {
  test('keeps explicit tickers and HK codes, drops common acronyms', () => {
    const found = extractTickers('PDD and BABA beat; CEO cites GDP', ['9618.HK']);
    expect(found).toContain('9618.HK');
    expect(found).toContain('PDD');
    expect(found).toContain('BABA');
    expect(found).not.toContain('CEO');
    expect(found).not.toContain('GDP');
  });
});

describe('front matter', () => {
  test('parses keys and returns the body', () => {
    const { meta, body } = parseFrontMatter('---\ntitle: "Notes"\nkind: meeting\n---\n# Notes\nbody');
    expect(meta).toEqual({ title: 'Notes', kind: 'meeting' });
    expect(body).toBe('# Notes\nbody');
  });

  test('passes plain markdown through untouched', () => {
    expect(parseFrontMatter('# Just notes')).toEqual({ meta: {}, body: '# Just notes' });
  });
});
