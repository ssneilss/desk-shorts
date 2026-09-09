import { z } from 'zod';
import { cfg } from '../../config';
import type { Source, SourceItem } from '../../plugin';
import { workspaceFile } from '../../providers/s3';
import { capText, httpsUrls, log, shiftDate } from '../../util';

const SITE = 'https://signal-desk.triatasolution.com';
/** Signal Desk runs three times a day; a quiet day still has last week's calls. */
const FALLBACK_DAYS = 5;
const BODY_LIMIT = 8000;

const keyFigure = z
  .object({
    metric: z.string().optional(),
    value: z.string().optional(),
    context: z.string().optional(),
  })
  .loose();

const exhibit = z
  .object({
    type: z.string().optional(),
    url: z.string().optional(),
    src: z.string().optional(),
    image: z.string().optional(),
  })
  .loose();

export const signalItemDoc = z
  .object({
    url_id: z.string(),
    date: z.string().optional(),
    headline: z.string().optional(),
    title: z.string().optional(),
    standfirst: z.string().optional(),
    takeaway: z.string().optional(),
    top_takeaway: z.string().optional(),
    key_figures: z.array(keyFigure).default([]),
    exhibits: z.array(exhibit).default([]),
    tickers: z.array(z.string()).default([]),
    usable: z.boolean().optional(),
    source_url: z.string().optional(),
  })
  .loose();

export const signalDayDoc = z
  .object({ date: z.string().optional(), items: z.array(signalItemDoc).default([]) })
  .loose();

export const signalCallDoc = z
  .object({
    sections: z
      .array(
        z
          .object({ subhead: z.string().optional(), paragraphs: z.array(z.string()).default([]) })
          .loose(),
      )
      .default([]),
    notable_quotes: z
      .array(
        z.union([
          z.string(),
          z.object({ quote: z.string().optional(), attribution: z.string().optional() }).loose(),
        ]),
      )
      .default([]),
  })
  .loose();

export type SignalItem = z.infer<typeof signalItemDoc>;
export type SignalCall = z.infer<typeof signalCallDoc>;

const figureLine = (f: z.infer<typeof keyFigure>) =>
  [[f.metric, f.value].filter(Boolean).join(': '), f.context && `(${f.context})`]
    .filter(Boolean)
    .join(' ');

const quoteLine = (q: SignalCall['notable_quotes'][number]) =>
  typeof q === 'string'
    ? q
    : [q.quote, q.attribution && `— ${q.attribution}`].filter(Boolean).join(' ');

function callText(call: SignalCall): string[] {
  const sections = call.sections.map((s) =>
    [s.subhead, ...s.paragraphs].filter(Boolean).join('\n'),
  );
  const quotes = call.notable_quotes.map(quoteLine).filter(Boolean);
  return [...sections, ...quotes];
}

export function signalDeskItem(raw: SignalItem, call?: SignalCall | null): SourceItem {
  const body = [
    raw.standfirst,
    raw.takeaway,
    raw.top_takeaway,
    raw.key_figures.map(figureLine).filter(Boolean).join('\n'),
    ...(call ? callText(call) : []),
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    kind: 'meeting',
    title: raw.headline || raw.title || '',
    body: capText(body, BODY_LIMIT),
    href: raw.url_id ? `${SITE}/articles/${raw.url_id}.html` : raw.source_url,
    images: httpsUrls(raw.exhibits.map((e) => e.url ?? e.src ?? e.image)),
    tickers: raw.tickers,
    publishedAt: raw.date,
  };
}

/** The newest daily file at or before `date`, within `FALLBACK_DAYS`. */
async function readDay(date: string) {
  for (let back = 0; back <= FALLBACK_DAYS; back += 1) {
    const day = shiftDate(date, -back);
    let text: string;
    try {
      text = await workspaceFile(cfg.signalProjectId, `content/daily/${day}.json`);
    } catch {
      continue;
    }
    const parsed = signalDayDoc.safeParse(JSON.parse(text));
    if (!parsed.success) throw new Error(`signal desk ${day}: ${parsed.error.issues[0]?.message}`);
    return { day, doc: parsed.data };
  }
  return null;
}

async function readCall(urlId: string): Promise<SignalCall | null> {
  try {
    const text = await workspaceFile(cfg.signalProjectId, `content/calls/${urlId}.json`);
    return signalCallDoc.parse(JSON.parse(text));
  } catch {
    return null;
  }
}

export async function loadSignalDesk(date: string): Promise<SourceItem[]> {
  const found = await readDay(date);
  if (!found) {
    log(`signal-desk: no daily file within ${FALLBACK_DAYS} days of ${date}`);
    return [];
  }
  log(`signal-desk: using ${found.day}`);

  const usable = found.doc.items.filter((item) => item.usable !== false);
  const calls = await Promise.all(usable.map((item) => readCall(item.url_id)));
  return usable.map((item, i) => signalDeskItem(item, calls[i]));
}

export const signalDeskSource: Source = { id: 'signal-desk', load: loadSignalDesk };
