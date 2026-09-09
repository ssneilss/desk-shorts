import { z } from 'zod';
import { cfg } from '../config';
import { extractTickers } from '../util';
import type { SourceItem } from './index';
import { s3Latest, s3Text } from './s3';

const story = z
  .object({
    kicker: z.string().optional(),
    headline: z.string(),
    standfirst: z.string().optional(),
    summary: z.string().optional(),
    figures: z.string().optional(),
    href: z.string(),
    image: z.string().optional(),
    badges: z.array(z.string()).optional(),
  })
  .loose();

const wire = z
  .object({ title: z.string(), href: z.string(), meta: z.string().optional() })
  .loose();

const deskDoc = z
  .object({
    date: z.string().optional(),
    front: z
      .object({
        lead: story.optional(),
        left: z.object({ lead: story.optional(), card: story.optional() }).loose().optional(),
      })
      .loose()
      .optional(),
    topicBand: z
      .object({ cover: story.optional(), rest: z.array(story).optional() })
      .loose()
      .optional(),
    storyBand: z.object({ stories: z.array(story).optional() }).loose().optional(),
    insights: z.array(wire).optional(),
  })
  .loose();

type Story = z.infer<typeof story>;

const httpsOnly = (url?: string) => (url?.startsWith('https://') ? url : undefined);

function fromStory(s: Story, publishedAt?: string): SourceItem {
  const body = [s.standfirst, s.summary, s.figures].filter(Boolean).join('\n\n');
  return {
    kind: 'desk',
    title: s.headline,
    body,
    href: s.href,
    image: httpsOnly(s.image),
    tickers: extractTickers(`${s.headline} ${body}`, s.badges),
    publishedAt,
  };
}

const DESK_PREFIX = () => `projects/${cfg.deskProjectId}/explore/daily/`;

export async function loadDesk(date: string): Promise<SourceItem[]> {
  const name = await s3Latest(DESK_PREFIX(), date);
  if (!name?.endsWith('.json')) return [];

  const parsed = deskDoc.safeParse(JSON.parse(await s3Text(DESK_PREFIX() + name)));
  if (!parsed.success) throw new Error(`morning desk ${name}: ${parsed.error.issues[0]?.message}`);
  const doc = parsed.data;
  const at = doc.date ?? name.replace(/\.json$/, '');

  const stories = [
    doc.front?.lead,
    doc.front?.left?.lead,
    doc.front?.left?.card,
    doc.topicBand?.cover,
    ...(doc.topicBand?.rest ?? []),
    ...(doc.storyBand?.stories ?? []),
  ].filter((s): s is Story => Boolean(s));

  const insights = (doc.insights ?? []).map<SourceItem>((w) => ({
    kind: 'report',
    title: w.title,
    body: w.meta ?? '',
    href: w.href,
    tickers: extractTickers(`${w.title} ${w.meta ?? ''}`),
    publishedAt: at,
  }));

  return [...stories.map((s) => fromStory(s, at)), ...insights];
}
