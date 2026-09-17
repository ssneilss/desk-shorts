import type { z } from 'zod';
import { cfg } from './config';
import type { ClipScript } from './pipeline/script';
import type { Selected } from './pipeline/select';
import { plugins } from './plugins';
import type { ShortsSourceKind } from './schema';
import { log } from './util';

export interface Persona {
  id: string;
  name: string;
  lang: 'zh' | 'en';
  /** One paragraph injected into the script system prompt. */
  tone: string;
  /** `emotion` is the MiniMax enum: happy, sad, angry, fearful, disgusted, surprised, calm, fluent. */
  voice: { provider: string; voiceId: string; instruction?: string; emotion?: string };
  /** Beat-level delivery tags the script LLM may use; the provider strips or honours them. */
  tags?: string[];
  /** Generates `assets/personas/<id>.png` on first use. */
  portraitPrompt: string;
}

export interface Style {
  id: string;
  name: string;
  /** The beat-by-beat shape a clip in this style follows. */
  arc: string;
  /** Line-craft rules layered on the base ones for this shape. */
  lines: string;
}

export interface Word {
  text: string;
  start: number;
  end: number;
}

export interface Speech {
  audio: Uint8Array;
  /** Per-character alignment for the exact input text. */
  charTimes?: { starts: number[]; ends: number[] };
  words?: Word[];
}

export interface VoiceProvider {
  id: string;
  available(): boolean;
  synthesize(req: { text: string; lang: string; persona: Persona }): Promise<Speech>;
}

export interface SceneCtx {
  dir: string;
  item: Selected;
  script: ClipScript;
  persona: Persona;
  /** Beat start/end seconds. */
  window: [number, number];
  /** Whole-narration presenter.mp4 when the recipe has one. */
  presenter?: string;
}

export interface SceneRenderer<S extends z.ZodTypeAny = z.ZodTypeAny> {
  kind: string;
  /** Zod object with a literal `kind`; the fields the script LLM must fill. */
  schema: S;
  /** One line telling the LLM when to pick this scene and what to fill. */
  hint: string;
  /** Produce a silent 1080x1920 H.264 segment exactly `window` long at `out`. */
  render(ctx: SceneCtx, scene: z.infer<S>, index: number, out: string): Promise<void>;
}

export interface AvatarProvider {
  id: string;
  available(): boolean;
  /** Longest audio one call accepts. */
  maxSeconds: number;
  /** Animate `portrait` (png) speaking `audio` (mp3); returns 9:16 mp4 bytes. */
  animate(req: {
    portrait: string;
    audio: string;
    seconds: number;
    prompt?: string;
  }): Promise<Uint8Array>;
}

export interface SourceItem {
  kind: ShortsSourceKind;
  title: string;
  body: string;
  href?: string;
  /** Usable https artwork shipped with the source, best first. */
  images: string[];
  tickers: string[];
  publishedAt?: string;
  /** Local inbox file, archived once the clip is published. */
  file?: string;
}

export interface Source {
  id: string;
  /** Everything the source has for `date`; an unreachable source throws. */
  load(date: string): Promise<SourceItem[]>;
}

export interface Recipe {
  id: string;
  /** Persona ids; a clip picks by hash unless overridden. */
  personas: string[];
  /** Allowed scene kinds, first is the default. */
  scenes: string[];
  /** Script shapes a clip may take; a clip picks by hash unless overridden. */
  styles?: string[];
  /** AvatarProvider id — enables the presenter stage. */
  avatar?: string;
  /** `pip` overlays the presenter bottom-right on non-presenter beats. */
  layout: 'scenes' | 'pip';
}

export interface Plugin {
  id: string;
  voices?: VoiceProvider[];
  scenes?: SceneRenderer[];
  avatars?: AvatarProvider[];
  personas?: Persona[];
  styles?: Style[];
  recipes?: Recipe[];
  sources?: Source[];
}

export interface Registry {
  voice(id: string): VoiceProvider;
  scene(kind: string): SceneRenderer;
  avatar(id: string): AvatarProvider;
  persona(id: string): Persona;
  style(id: string): Style;
  recipe(id: string): Recipe;
  source(id: string): Source;
  voices: VoiceProvider[];
  avatars: AvatarProvider[];
  personas: Persona[];
  styles: Style[];
  sources: Source[];
}

function index<T>(
  list: Plugin[],
  what: string,
  pick: (p: Plugin) => T[] | undefined,
  id: (v: T) => string,
) {
  const map = new Map<string, T>();
  for (const plugin of list) {
    for (const value of pick(plugin) ?? []) {
      const key = id(value);
      if (map.has(key)) throw new Error(`duplicate ${what} "${key}" in plugin "${plugin.id}"`);
      map.set(key, value);
    }
  }
  return map;
}

const lookup =
  <T>(map: Map<string, T>, what: string) =>
  (id: string): T => {
    const hit = map.get(id);
    if (!hit) throw new Error(`unknown ${what} "${id}" (have: ${[...map.keys()].join(', ')})`);
    return hit;
  };

export function buildRegistry(list: Plugin[]): Registry {
  const voices = index(list, 'voice', (p) => p.voices, (v) => v.id);
  const avatars = index(list, 'avatar', (p) => p.avatars, (v) => v.id);
  const personas = index(list, 'persona', (p) => p.personas, (v) => v.id);
  const styles = index(list, 'style', (p) => p.styles, (v) => v.id);
  const sources = index(list, 'source', (p) => p.sources, (v) => v.id);
  return {
    voice: lookup(voices, 'voice'),
    scene: lookup(index(list, 'scene', (p) => p.scenes, (v) => v.kind), 'scene'),
    avatar: lookup(avatars, 'avatar'),
    persona: lookup(personas, 'persona'),
    style: lookup(styles, 'style'),
    recipe: lookup(index(list, 'recipe', (p) => p.recipes, (v) => v.id), 'recipe'),
    source: lookup(sources, 'source'),
    voices: [...voices.values()],
    avatars: [...avatars.values()],
    personas: [...personas.values()],
    styles: [...styles.values()],
    sources: [...sources.values()],
  };
}

export const registry = buildRegistry(plugins);

export interface Resolved {
  recipe: Recipe;
  persona: Persona;
  style?: Style;
  voice: VoiceProvider;
  avatar?: AvatarProvider;
  scenes: SceneRenderer[];
}

export interface Overrides {
  lang?: string;
  persona?: string;
  style?: string;
  voice?: string;
  avatar?: string;
}

const hash = (value: string) =>
  [...value].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);

function pickPersona(recipe: Recipe, clipId: string, over: Overrides, reg: Registry): Persona {
  const wanted =
    over.persona || recipe.personas[hash(clipId) % Math.max(recipe.personas.length, 1)];
  if (!wanted) throw new Error(`recipe "${recipe.id}" lists no personas`);
  const persona = reg.persona(wanted);
  const lang = (over.lang ?? cfg.lang).slice(0, 2);
  if (persona.lang === lang) return persona;
  return reg.personas.find((p) => p.id === `${wanted}-${lang}`) ?? persona;
}

function pickVoice(persona: Persona, over: Overrides, reg: Registry): VoiceProvider {
  if (over.voice) return reg.voice(over.voice);
  const wanted = persona.voice.provider;
  const chosen = reg.voices.find((v) => v.id === wanted);
  if (chosen?.available()) return chosen;
  const fallback = reg.voices.find((v) => v.available());
  if (fallback) {
    log(`voice: ${wanted} unavailable, using ${fallback.id}`);
    return fallback;
  }
  const first = chosen ?? reg.voices[0];
  if (!first) throw new Error('no voice providers registered');
  return first;
}

function pickStyle(
  recipe: Recipe,
  clipId: string,
  over: Overrides,
  reg: Registry,
): Style | undefined {
  if (over.style) return reg.style(over.style);
  const allowed = recipe.styles ?? [];
  if (!allowed.length) return undefined;
  const wanted = allowed[hash(`${clipId} style`) % allowed.length];
  return wanted ? reg.style(wanted) : undefined;
}

function pickAvatar(recipe: Recipe, over: Overrides, reg: Registry): AvatarProvider | undefined {
  const wanted = over.avatar || recipe.avatar;
  if (!wanted) return undefined;
  const avatar = over.avatar ? reg.avatar(over.avatar) : reg.avatars.find((a) => a.id === wanted);
  if (avatar?.available()) return avatar;
  log(`avatar: ${wanted} ${avatar ? 'unavailable' : 'not installed'}, rendering without a presenter`);
  return undefined;
}

/** The plugins one clip runs with, after recipe defaults and env overrides. */
export function resolve(
  recipeId: string,
  clipId: string,
  over: Overrides = cfg,
  reg: Registry = registry,
): Resolved {
  const recipe = reg.recipe(recipeId);
  const avatar = pickAvatar(recipe, over, reg);
  const persona = pickPersona(recipe, clipId, over, reg);
  const style = pickStyle(recipe, clipId, over, reg);
  return {
    recipe,
    persona,
    ...(style ? { style } : {}),
    voice: pickVoice(persona, over, reg),
    ...(avatar ? { avatar } : {}),
    scenes: recipe.scenes
      .filter((kind) => kind !== 'presenter' || avatar)
      .map((kind) => reg.scene(kind)),
  };
}
