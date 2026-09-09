import { describe, expect, test } from 'bun:test';
import { clipScriptSchema } from '../src/pipeline/script';
import { registry } from '../src/plugin';

const beat = (scene: unknown) => ({ narration: 'n', onScreen: 'on screen', scene });

const script = (scene: unknown) => ({
  title: 't',
  caption: 'c',
  tags: [],
  tickers: [],
  beats: [beat(scene), beat(scene), beat(scene), beat(scene)],
});

const scenes = ['concept', 'image'].map((kind) => registry.scene(kind));

describe('clip script schema', () => {
  test('accepts every allowed scene kind', () => {
    expect(clipScriptSchema(scenes).safeParse(script({ kind: 'concept', visualPrompt: 'p' })).success).toBe(true);
    expect(clipScriptSchema(scenes).safeParse(script({ kind: 'image', index: 1 })).success).toBe(true);
  });

  test('rejects a scene kind the recipe does not allow', () => {
    const concept = clipScriptSchema([registry.scene('concept')]);
    expect(concept.safeParse(script({ kind: 'image', index: 0 })).success).toBe(false);
    expect(concept.safeParse(script({ kind: 'concept' })).success).toBe(false);
  });

  test('still enforces four to six beats', () => {
    const schema = clipScriptSchema(scenes);
    const valid = script({ kind: 'concept', visualPrompt: 'p' });
    expect(schema.safeParse({ ...valid, beats: valid.beats.slice(0, 3) }).success).toBe(false);
    expect(schema.safeParse({ ...valid, beats: [...valid.beats, ...valid.beats] }).success).toBe(false);
  });
});
