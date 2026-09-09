import path from 'node:path';
import { generateObject } from 'ai';
import { z } from 'zod';
import { cfg } from '../config';
import { textModel } from '../providers/openai';
import { cached } from '../util';
import type { Selected } from './select';

export const clipScriptSchema = z.object({
  title: z.string(),
  caption: z.string(),
  tags: z.array(z.string()),
  tickers: z.array(z.string()),
  beats: z
    .array(
      z.object({
        narration: z.string(),
        onScreen: z.string(),
        visualPrompt: z.string(),
      }),
    )
    .min(4)
    .max(6),
});

export type ClipScript = z.infer<typeof clipScriptSchema>;

const LANGS: Record<string, string> = { en: 'English', zh: 'Simplified Chinese' };

const SYSTEM = `You write 9:16 vertical short-video scripts for a buy-side investment desk.
Voice: a senior analyst briefing colleagues — calm, specific, no hype, no clickbait, no emoji, no "in this video".
Quote every number exactly as given; never invent figures, dates or quotes. If a fact is absent, leave it out.
Structure: 4-6 beats reading aloud in 35-55 seconds total (about 2.6 words per second), beat 1 is the hook.
onScreen is a headline fragment of at most 8 words. visualPrompt describes one still image, no text or logos in frame.`;

const cap = (text: string, max: number) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return (cut.slice(0, cut.lastIndexOf(' ')) || cut).trim();
};

const words = (text: string, max: number) => text.replace(/\s+/g, ' ').trim().split(' ').slice(0, max).join(' ');

const uniq = (values: string[], max: number) =>
  [...new Set(values.map((v) => v.trim()).filter(Boolean))].slice(0, max);

function normalise(script: ClipScript, item: Selected): ClipScript {
  return {
    title: cap(script.title || item.title, 60),
    caption: cap(script.caption, 220),
    tags: uniq(script.tags, 6),
    tickers: uniq([...item.tickers, ...script.tickers.map((t) => t.toUpperCase())], 6),
    beats: script.beats.slice(0, 6).map((beat) => ({
      narration: beat.narration.replace(/\s+/g, ' ').trim(),
      onScreen: words(beat.onScreen, 8),
      visualPrompt: beat.visualPrompt.replace(/\s+/g, ' ').trim(),
    })),
  };
}

export function scriptFor(dir: string, item: Selected): Promise<ClipScript> {
  return cached(path.join(dir, 'script.json'), async () => {
    const { object } = await generateObject({
      model: textModel(),
      schema: clipScriptSchema,
      system: SYSTEM,
      prompt: [
        `Write the script in ${LANGS[cfg.lang] ?? cfg.lang}.`,
        `Source kind: ${item.kind}`,
        item.tickers.length ? `Tickers: ${item.tickers.join(', ')}` : '',
        `Headline: ${item.title}`,
        '',
        item.body.slice(0, 6000),
      ]
        .filter(Boolean)
        .join('\n'),
    });
    return normalise(object, item);
  });
}
