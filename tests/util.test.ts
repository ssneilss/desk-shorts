import { describe, expect, test } from 'bun:test';
import { parseFrontMatter } from '../src/plugins/sources/inbox';
import { capText, clipId, extractTickers, httpsUrls, shiftDate, stripHtml } from '../src/util';

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

describe('httpsUrls', () => {
  test('keeps https urls and drops everything else', () => {
    expect(httpsUrls(['https://a/x.png', 'http://b', '', undefined, null])).toEqual([
      'https://a/x.png',
    ]);
  });
});

describe('capText', () => {
  test('passes short text through and trims long text on a word boundary', () => {
    expect(capText('short', 40)).toBe('short');
    const capped = capText(`${'word '.repeat(400)}tail`, 100);
    expect(capped.length).toBeLessThanOrEqual(101);
    expect(capped.endsWith('…')).toBe(true);
  });
});

describe('shiftDate', () => {
  test('walks days across month boundaries', () => {
    expect(shiftDate('2026-09-09', -1)).toBe('2026-09-08');
    expect(shiftDate('2026-09-01', -5)).toBe('2026-08-27');
    expect(shiftDate('2026-09-09', 0)).toBe('2026-09-09');
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
