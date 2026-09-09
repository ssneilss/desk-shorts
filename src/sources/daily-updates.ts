import { z } from 'zod';
import { extractTickers, stripHtml } from '../util';
import type { SourceItem } from './index';
import { s3Latest, s3Text } from './s3';

const media = z.union([
  z.string(),
  z
    .object({
      url: z.string().optional(),
      src: z.string().optional(),
      href: z.string().optional(),
    })
    .loose(),
]);

const item = z
  .object({
    name: z.string(),
    ticker: z.string().nullish(),
    sentiment: z.string().optional(),
    headline: z.string().optional(),
    summary: z.string().default(''),
    priceMove: z
      .object({ pct1d: z.number().nullish(), pct5d: z.number().nullish() })
      .loose()
      .optional(),
    catalysts: z.array(z.string()).optional(),
    images: z.array(media).optional(),
    sources: z.array(z.string()).optional(),
  })
  .loose();

const doc = z
  .object({
    date: z.string().optional(),
    sectorUpdates: z.array(item).default([]),
    stockUpdates: z.array(item).default([]),
  })
  .loose();

type Update = z.infer<typeof item>;

const firstHttps = (values: (string | undefined)[]) =>
  values.find((v) => v?.startsWith('https://'));

const mediaUrl = (m: z.infer<typeof media>) =>
  typeof m === 'string' ? m : (m.url ?? m.src ?? m.href);

const pct = (label: string, value?: number | null) =>
  typeof value === 'number' ? `${label} ${value > 0 ? '+' : ''}${value.toFixed(1)}%` : null;

function toItem(u: Update, at?: string): SourceItem {
  const body = [
    stripHtml(u.summary),
    [pct('1d', u.priceMove?.pct1d), pct('5d', u.priceMove?.pct5d)].filter(Boolean).join(', '),
    u.catalysts?.length ? `Catalysts: ${u.catalysts.join('; ')}` : '',
    u.sentiment ? `Sentiment: ${u.sentiment}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    kind: 'daily-update',
    title: u.headline?.trim() || u.name,
    body,
    href: firstHttps(u.sources ?? []),
    image: firstHttps((u.images ?? []).map(mediaUrl)),
    tickers: extractTickers(u.name, [u.ticker]),
    publishedAt: at,
  };
}

export async function loadDailyUpdates(date: string): Promise<SourceItem[]> {
  const year = date.slice(0, 4);
  const folder = await s3Latest(`daily-updates/${year}/`);
  if (!folder) return [];

  const key = `daily-updates/${year}/${folder}/data/all-updates.json`;
  const parsed = doc.safeParse(JSON.parse(await s3Text(key)));
  if (!parsed.success) throw new Error(`${key}: ${parsed.error.issues[0]?.message}`);

  const at = parsed.data.date ?? date;
  return [...parsed.data.stockUpdates, ...parsed.data.sectorUpdates].map((u) => toItem(u, at));
}
