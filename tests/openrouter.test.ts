import { describe, expect, test } from 'bun:test';
import type { Persona } from '../src/plugin';
import { personas } from '../src/plugins/personas';
import { MINIMAX_EMOTIONS, minimaxOptions } from '../src/plugins/voices/openrouter';
import { wordsFrom } from '../src/providers/openrouter';

const zh = personas.filter((p) => p.lang === 'zh');

const persona = (over: Partial<Persona['voice']> = {}): Persona => ({
  id: 'anchor',
  name: 'anchor',
  lang: 'zh',
  tone: 'tone',
  voice: { provider: 'openrouter', voiceId: 'Chinese (Mandarin)_Male_Announcer', ...over },
  portraitPrompt: 'portrait',
});

describe('mandarin personas', () => {
  test('all five speak through openrouter with a MiniMax voice and emotion', () => {
    expect(zh).toHaveLength(5);
    for (const p of zh) {
      expect(p.voice.provider).toBe('openrouter');
      expect(p.voice.voiceId).toStartWith('Chinese (Mandarin)_');
      expect(MINIMAX_EMOTIONS).toContain(p.voice.emotion as (typeof MINIMAX_EMOTIONS)[number]);
    }
  });

  test('carry no delivery tags, which MiniMax cannot honour', () => {
    for (const p of zh) expect(p.tags).toBeUndefined();
  });
});

describe('minimaxOptions', () => {
  test('sends emotion and a Chinese language boost for a Mandarin clip', () => {
    expect(minimaxOptions('minimax/speech-2.8-turbo', persona({ emotion: 'calm' }), 'zh')).toEqual({
      options: { minimax: { emotion: 'calm', language_boost: 'Chinese' } },
    });
  });

  test('drops the language boost outside Mandarin', () => {
    expect(minimaxOptions('minimax/speech-2.8-hd', persona({ emotion: 'happy' }), 'en')).toEqual({
      options: { minimax: { emotion: 'happy' } },
    });
  });

  test('sends nothing for a non-MiniMax model or an emotionless persona', () => {
    expect(minimaxOptions('qwen/qwen-audio-3.0-tts-flash', persona({ emotion: 'calm' }), 'zh'))
      .toBeUndefined();
    expect(minimaxOptions('minimax/speech-2.8-turbo', persona(), 'en')).toBeUndefined();
  });
});

describe('wordsFrom', () => {
  test('maps a verbose_json payload onto Word', () => {
    expect(
      wordsFrom({
        text: 'Hello there.',
        words: [
          { word: 'Hello', start: 0, end: 0.4 },
          { word: 'there.', start: 0.4, end: 1.2 },
        ],
      }),
    ).toEqual([
      { text: 'Hello', start: 0, end: 0.4 },
      { text: 'there.', start: 0.4, end: 1.2 },
    ]);
  });

  test('is empty when the model returned no timings', () => {
    expect(wordsFrom({ text: 'Hello there.' })).toEqual([]);
  });
});
