import path from 'node:path';
import { generateObject } from 'ai';
import { z } from 'zod';
import { cfg } from '../config';
import type { Persona, Resolved, SceneRenderer, Style } from '../plugin';
import { textModel } from '../providers/openai';
import { isTicker, log, readJson, writeJson } from '../util';
import type { Selected } from './select';

export type SceneSpec = { kind: string } & Record<string, unknown>;

export interface ClipScript {
  title: string;
  caption: string;
  tags: string[];
  tickers: string[];
  beats: { narration: string; onScreen: string; scene: SceneSpec }[];
}

type SceneUnion = [z.ZodObject<{ kind: z.ZodLiteral<string> }>];

/**
 * Clip schema whose beat `scene` is the union of the allowed scene schemas.
 * A plain union, not `discriminatedUnion`: the latter emits `oneOf`, which
 * OpenAI structured outputs rejects.
 */
export function clipScriptSchema(scenes: SceneRenderer[]) {
  const options = scenes.map((scene) => scene.schema) as unknown as SceneUnion;
  if (!options.length) throw new Error('a recipe needs at least one scene');
  return z.object({
    title: z.string(),
    caption: z.string(),
    tags: z.array(z.string()),
    tickers: z.array(z.string()),
    beats: z
      .array(
        z.object({
          narration: z.string(),
          onScreen: z.string(),
          scene: options.length === 1 ? (options[0] as SceneUnion[0]) : z.union(options),
        }),
      )
      .min(4)
      .max(6),
  });
}

const LANGS: Record<string, string> = { en: 'English', zh: 'Simplified Chinese' };

const BASE = `You write 9:16 vertical short-video scripts for a buy-side investment desk.
Viewers scroll past anything that sounds like a press release, so the writing has to earn every second — and the facts stay exactly as given.

Facts: quote every number, date, name and quote exactly as the source gives it. Never invent, round or extrapolate, and never make a recommendation the source does not make. If a fact is absent, leave it out.

Structure: 4-6 beats reading aloud in 35-55 seconds total (about 2.6 English words or 4.5 Chinese characters per second, so at most 250 characters of Chinese narration in all). Beat 1 is the hook and the last beat lands the payoff. One idea per beat, and each beat answers the question the beat before it raises.

Lines:
- Open on the sharpest concrete thing you hold — a figure, a reversal, a contradiction — inside the first eight words. Never open with background, a date, or a legal company name.
- Vary the rhythm: put a long sentence next to a short one, and keep at least one beat under eight words.
- Cut throat-clearing ("today we look at", "let us dive in", "as you know") and padding ("significant", "robust", "notable", "arguably", "it is worth noting").
- Concrete verbs and plain words over desk jargon; if a term is unavoidable, define it in three words and move on.
- Close on a kicker — what to watch, what breaks it, what it costs — not a summary of what was just said.
- No clickbait, no manufactured suspense, no emoji, no hashtags, no "in this video".

onScreen is a headline fragment of at most 8 words that adds to the narration instead of repeating it: the number, the name, or the stake.
tickers holds exchange symbols only (0700.HK, NVDA), never sector or accounting acronyms; leave it empty if unsure.`;

export const system = (persona: Persona, scenes: SceneRenderer[], style?: Style) =>
  [
    BASE,
    `Delivery — ${persona.name}: ${persona.tone}`,
    style ? `Shape — ${style.name}: ${style.arc}` : '',
    style ? style.lines : '',
    'Every beat also picks one scene; the first listed is the default:',
    ...scenes.map((scene) => `- ${scene.hint}`),
    persona.tags?.length
      ? `You may open a beat's narration with at most one delivery tag from: ${persona.tags.join(' ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

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
    tickers: uniq([...item.tickers, ...script.tickers.map((t) => t.toUpperCase()).filter(isTicker)], 6),
    beats: script.beats.slice(0, 6).map((beat) => ({
      narration: beat.narration.replace(/\s+/g, ' ').trim(),
      onScreen: words(beat.onScreen, 8),
      scene: beat.scene,
    })),
  };
}

export async function scriptFor(
  dir: string,
  item: Selected,
  resolved: Resolved,
): Promise<ClipScript> {
  const file = path.join(dir, 'script.json');
  const schema = clipScriptSchema(resolved.scenes);
  const styleId = resolved.style?.id ?? '';
  const hit = await readJson<{ style?: string }>(file);
  if (hit) {
    const parsed = schema.safeParse(hit);
    if (parsed.success && (hit.style ?? '') === styleId) return parsed.data as ClipScript;
    const why = parsed.success
      ? `was written in style "${hit.style ?? 'none'}", not "${styleId || 'none'}"`
      : `does not fit recipe ${resolved.recipe.id}`;
    log(`script: cached script ${why}, regenerating`);
  }

  const { object } = await generateObject({
    model: textModel(),
    schema,
    system: system(resolved.persona, resolved.scenes, resolved.style),
    prompt: [
      `Write the script in ${LANGS[cfg.lang] ?? cfg.lang}.`,
      `Source kind: ${item.kind}`,
      item.tickers.length ? `Tickers: ${item.tickers.join(', ')}` : '',
      item.images.length
        ? `Source images: ${item.images.length} (index 0-${item.images.length - 1})`
        : 'Source images: none',
      `Headline: ${item.title}`,
      '',
      item.body.slice(0, 6000),
    ]
      .filter(Boolean)
      .join('\n'),
  });

  const script = normalise(object as ClipScript, item);
  await writeJson(file, { ...script, ...(styleId ? { style: styleId } : {}) });
  return script;
}
