import { describe, expect, test } from 'bun:test';
import { registry } from '../src/plugin';
import { pickSources } from '../src/pipeline/sources';
import { documentItem, documentDoc } from '../src/plugins/sources/documents';
import { signalDayDoc, signalDeskItem } from '../src/plugins/sources/signal-desk';

const day = signalDayDoc.parse(await Bun.file('tests/fixtures/sd-daily.json').json());
const lead = day.items[0];
if (!lead) throw new Error('fixture has no items');

describe('registry sources', () => {
  test('lists the four shipped sources', () => {
    expect(registry.sources.map((s) => s.id).sort()).toEqual([
      'desk',
      'documents',
      'inbox',
      'signal-desk',
    ]);
  });

  test('every source id resolves back to itself', () => {
    for (const source of registry.sources) expect(registry.source(source.id).id).toBe(source.id);
  });
});

describe('--sources', () => {
  test('defaults to every registered source', () => {
    expect(pickSources().map((s) => s.id)).toEqual(registry.sources.map((s) => s.id));
    expect(pickSources('').map((s) => s.id)).toEqual(registry.sources.map((s) => s.id));
  });

  test('keeps the order the caller asked for', () => {
    expect(pickSources('inbox, signal-desk').map((s) => s.id)).toEqual(['inbox', 'signal-desk']);
  });

  test('rejects a name the registry does not have', () => {
    expect(() => pickSources('inbox,daily-updates')).toThrow(/unknown source\(s\): daily-updates/);
  });
});

describe('signal-desk mapping', () => {
  test('maps a daily item to a meeting SourceItem', () => {
    const item = signalDeskItem(lead);
    expect(item.kind).toBe('meeting');
    expect(item.title).toBe(lead.headline ?? '');
    expect(item.href).toBe('https://signal-desk.triatasolution.com/articles/jI2y2N8.html');
    expect(item.publishedAt).toBe('2026-09-09');
    expect(item.tickers).toContain('2359.HK');
    expect(item.images).toEqual([]);
    expect(item.body).toContain(lead.standfirst ?? '');
    expect(item.body).toContain(lead.top_takeaway ?? '');
    expect(item.body).toContain(lead.key_figures[0]?.value ?? '');
  });

  test('falls back to source_url when the item has no url_id', () => {
    const item = signalDeskItem({ ...lead, url_id: '', source_url: 'https://example.com/x' });
    expect(item.href).toBe('https://example.com/x');
  });

  test('appends the call sections and quotes, capped', () => {
    const item = signalDeskItem(lead, {
      sections: [{ subhead: 'CRO/CDMO', paragraphs: ['Backlog grew 25%.', 'x'.repeat(9000)] }],
      notable_quotes: [{ quote: 'Visibility into 2027 is the swing factor', attribution: 'CFO' }],
    });
    expect(item.body).toContain('CRO/CDMO');
    expect(item.body).toContain('Backlog grew 25%.');
    expect(item.body.length).toBeLessThanOrEqual(8001);
  });

  test('keeps only usable items', () => {
    expect(day.items.filter((i) => i.usable !== false).map((i) => i.url_id)).toEqual(['jI2y2N8']);
  });
});

describe('documents mapping', () => {
  const hit = documentDoc.parse({
    type: 'sell_side_report',
    title: 'Kuaishou (1024.HK): take-rate inflects',
    created_at: '2026-09-09',
    url: '/preview/abc123',
    tickers: ['1024.HK'],
    authors: [{ name: 'Jane Doe' }],
    contents: [
      {
        type: 'text',
        content: 'Ad load is the swing factor.',
        tickers: ['3690.HK'],
        companies: ['Meituan'],
      },
      { type: 'text', content: 'Margins hold.', companies: [{ name: 'Kuaishou Technology' }] },
    ],
  });

  test('joins the contents, appends companies and unions the tickers', () => {
    const item = documentItem(hit);
    expect(item.kind).toBe('report');
    expect(item.href).toBe('https://alpha-v2.triatasolution.com/preview/abc123');
    expect(item.publishedAt).toBe('2026-09-09');
    expect(item.body).toContain('Ad load is the swing factor.');
    expect(item.body).toContain('Margins hold.');
    expect(item.body).toContain('Meituan, Kuaishou Technology');
    expect(item.tickers).toEqual(expect.arrayContaining(['1024.HK', '3690.HK']));
    expect(item.images).toEqual([]);
  });

  test('maps the document type onto a clip kind', () => {
    expect(documentItem(documentDoc.parse({ type: 'expert_call' })).kind).toBe('meeting');
    expect(documentItem(documentDoc.parse({ type: 'mackey_note' })).kind).toBe('other');
    expect(documentItem(documentDoc.parse({ type: 'sell_side_comments' })).kind).toBe('report');
  });

  test('leaves href off a document with no url', () => {
    expect(documentItem(documentDoc.parse({ type: 'fund_letter' })).href).toBeUndefined();
  });
});
