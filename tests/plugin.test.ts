import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import {
  buildRegistry,
  registry,
  resolve,
  type AvatarProvider,
  type Persona,
  type Plugin,
  type SceneRenderer,
  type VoiceProvider,
} from '../src/plugin';
import { recipes } from '../src/plugins/recipes';

const voice = (id: string, available: boolean): VoiceProvider => ({
  id,
  available: () => available,
  synthesize: async () => ({ audio: new Uint8Array() }),
});

const persona = (id: string, provider: string, lang: 'zh' | 'en' = 'zh'): Persona => ({
  id,
  name: id,
  lang,
  tone: 'tone',
  voice: { provider, voiceId: 'v' },
  portraitPrompt: 'portrait',
});

const scene = (kind: string): SceneRenderer => ({
  kind,
  schema: z.object({ kind: z.literal(kind) }),
  hint: `${kind} hint`,
  render: async () => {},
});

const avatar = (id: string, available: boolean): AvatarProvider => ({
  id,
  available: () => available,
  maxSeconds: 15,
  animate: async () => new Uint8Array(),
});

const fake = (over: Partial<Plugin> = {}): Plugin[] => [
  {
    id: 'test',
    voices: [voice('qwen-tts', false), voice('openai', true)],
    scenes: [scene('concept'), scene('presenter')],
    avatars: [avatar('studio', true), avatar('offline', false)],
    personas: [persona('anchor', 'qwen-tts'), persona('anchor-en', 'openai', 'en')],
    recipes: [
      { id: 'plain', personas: ['anchor'], scenes: ['concept'], layout: 'scenes' },
      {
        id: 'show',
        personas: ['anchor'],
        scenes: ['presenter', 'concept'],
        avatar: 'studio',
        layout: 'pip',
      },
    ],
    ...over,
  },
];

const reg = () => buildRegistry(fake());

describe('registry', () => {
  test('rejects duplicate ids at build time', () => {
    expect(() => buildRegistry([...fake(), ...fake()])).toThrow(/duplicate voice "qwen-tts"/);
  });

  test('names the alternatives when a lookup misses', () => {
    expect(() => reg().scene('chart')).toThrow('unknown scene "chart" (have: concept, presenter)');
  });
});

describe('resolve', () => {
  test('picks the recipe persona and its scenes', () => {
    const resolved = resolve('plain', 'clip-1', { lang: 'zh' }, reg());
    expect(resolved.persona.id).toBe('anchor');
    expect(resolved.scenes.map((s) => s.kind)).toEqual(['concept']);
    expect(resolved.avatar).toBeUndefined();
  });

  test('swaps in the language twin', () => {
    expect(resolve('plain', 'clip-1', { lang: 'en' }, reg()).persona.id).toBe('anchor-en');
  });

  test('falls back to an available voice provider', () => {
    expect(resolve('plain', 'clip-1', { lang: 'zh' }, reg()).voice.id).toBe('openai');
  });

  test('honours persona, voice and avatar overrides', () => {
    const resolved = resolve(
      'plain',
      'clip-1',
      { lang: 'en', persona: 'anchor-en', voice: 'qwen-tts', avatar: 'studio' },
      reg(),
    );
    expect(resolved.persona.id).toBe('anchor-en');
    expect(resolved.voice.id).toBe('qwen-tts');
    expect(resolved.avatar?.id).toBe('studio');
  });

  test('drops the presenter scene when the avatar is unavailable', () => {
    const resolved = resolve('show', 'clip-1', { lang: 'zh', avatar: 'offline' }, reg());
    expect(resolved.avatar).toBeUndefined();
    expect(resolved.scenes.map((s) => s.kind)).toEqual(['concept']);
  });

  test('tolerates a recipe naming an avatar plugin that is not installed', () => {
    const list = fake();
    const recipe = list[0]?.recipes?.[1];
    if (recipe) recipe.avatar = 'later';
    const resolved = resolve('show', 'clip-1', { lang: 'zh' }, buildRegistry(list));
    expect(resolved.avatar).toBeUndefined();
    expect(resolved.scenes.map((s) => s.kind)).toEqual(['concept']);
  });

  test('is stable for a clip id', () => {
    const once = resolve('show', 'clip-9', { lang: 'zh' }, reg());
    expect(resolve('show', 'clip-9', { lang: 'zh' }, reg()).persona.id).toBe(once.persona.id);
  });
});

describe('shipped plugins', () => {
  test('every recipe names known personas, scenes and avatars', () => {
    for (const recipe of recipes) {
      for (const id of recipe.personas) expect(registry.persona(id).id).toBe(id);
      for (const kind of recipe.scenes) expect(registry.scene(kind).kind).toBe(kind);
      if (recipe.avatar) expect(registry.avatar(recipe.avatar).id).toBe(recipe.avatar);
    }
  });

  test('every persona has an English twin and a portrait prompt', () => {
    for (const p of registry.personas) {
      expect(p.portraitPrompt.length).toBeGreaterThan(20);
      if (p.lang === 'zh') expect(registry.persona(`${p.id}-en`).lang).toBe('en');
    }
  });

  test('classic reproduces the single-scene pipeline', () => {
    const resolved = resolve('classic', 'clip-1', { lang: 'en' }, registry);
    expect(resolved.persona.id).toBe('analyst-en');
    expect(resolved.recipe.layout).toBe('scenes');
    expect(resolved.scenes.map((s) => s.kind)).toEqual(['concept']);
  });
});
