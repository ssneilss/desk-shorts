import { z } from 'zod';
import { cfg } from '../../config';
import type { Source, SourceItem } from '../../plugin';
import { hasOpenSearch, search } from '../../providers/opensearch';
import type { ShortsSourceKind } from '../../schema';
import { capText, extractTickers, log, shiftDate } from '../../util';

const INDEX = 'internal_documents';
const APP = 'https://alpha-v2.triatasolution.com';
const SIZE = 40;
const BODY_LIMIT = 8000;

const company = z.union([
  z.string(),
  z.object({ name: z.string().optional() }).loose(),
]);

const content = z
  .object({
    content: z.string().optional(),
    tickers: z.array(z.string()).default([]),
    companies: z.array(company).default([]),
  })
  .loose();

export const documentDoc = z
  .object({
    type: z.string().optional(),
    title: z.string().optional(),
    created_at: z.string().optional(),
    url: z.string().optional(),
    tickers: z.array(z.string()).default([]),
    contents: z.array(content).default([]),
  })
  .loose();

export type DocumentHit = z.infer<typeof documentDoc>;

const companyName = (c: z.infer<typeof company>) => (typeof c === 'string' ? c : (c.name ?? ''));

function kindOf(type = ''): ShortsSourceKind {
  if (type.startsWith('sell_side_')) return 'report';
  if (type.endsWith('_call')) return 'meeting';
  return 'other';
}

export function documentItem(doc: DocumentHit): SourceItem {
  const title = doc.title ?? '';
  const companies = [
    ...new Set(doc.contents.flatMap((c) => c.companies.map(companyName)).filter(Boolean)),
  ];
  const text = doc.contents
    .map((c) => c.content)
    .filter(Boolean)
    .join('\n\n');
  const body = [capText(text, BODY_LIMIT), companies.length ? companies.join(', ') : '']
    .filter(Boolean)
    .join('\n\n');

  return {
    kind: kindOf(doc.type),
    title,
    body,
    href: doc.url ? `${APP}${doc.url}` : undefined,
    images: [],
    tickers: [
      ...new Set([
        ...doc.tickers,
        ...doc.contents.flatMap((c) => c.tickers),
        ...extractTickers(title),
      ]),
    ],
    publishedAt: doc.created_at,
  };
}

export async function loadDocuments(date: string): Promise<SourceItem[]> {
  if (!hasOpenSearch()) {
    log('documents: OPENSEARCH_URL is not set, skipping');
    return [];
  }

  const types = cfg.docTypes.split(',').map((t) => t.trim()).filter(Boolean);
  const hits = await search(INDEX, {
    size: SIZE,
    sort: [{ created_at: 'desc' }],
    query: {
      bool: {
        filter: [
          { range: { created_at: { gte: shiftDate(date, -1), lte: date } } },
          { terms: { type: types } },
        ],
      },
    },
  });

  return hits.map((hit) => documentItem(documentDoc.parse(hit)));
}

export const documentsSource: Source = { id: 'documents', load: loadDocuments };
