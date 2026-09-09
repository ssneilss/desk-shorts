import { cfg } from '../../config';
import { stripTags } from '../../pipeline/captions';
import type { Persona, VoiceProvider } from '../../plugin';
import { hasOpenRouter, speech, transcribe } from '../../providers/openrouter';
import { log } from '../../util';

/** The emotions `minimax/speech-2.8-*` accepts; `whisper` is 2.6 only. */
export const MINIMAX_EMOTIONS = [
  'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'calm', 'fluent',
] as const;

const STOCK_VOICE = {
  zh: 'Chinese (Mandarin)_Male_Announcer',
  en: 'English_expressive_narrator',
} as const;

const isZh = (lang: string) => lang.startsWith('zh');

const voiceFor = (persona: Persona, lang: string) =>
  persona.voice.provider === 'openrouter'
    ? persona.voice.voiceId
    : STOCK_VOICE[isZh(lang) ? 'zh' : 'en'];

/** MiniMax reads emotion and language_boost from `provider.options.minimax`; other slugs get nothing. */
export function minimaxOptions(model: string, persona: Persona, lang: string) {
  if (!model.startsWith('minimax/')) return undefined;
  const minimax: Record<string, string> = {
    ...(persona.voice.emotion ? { emotion: persona.voice.emotion } : {}),
    ...(isZh(lang) ? { language_boost: 'Chinese' } : {}),
  };
  return Object.keys(minimax).length ? { options: { minimax } } : undefined;
}

export const openrouterVoice: VoiceProvider = {
  id: 'openrouter',
  available: hasOpenRouter,
  async synthesize({ text, lang, persona }) {
    const model = cfg.openrouterTtsModel;
    const provider = minimaxOptions(model, persona, lang);
    const audio = await speech({
      model,
      input: stripTags(text),
      voice: voiceFor(persona, lang),
      ...(provider ? { provider } : {}),
    });

    try {
      const words = await transcribe(audio, lang);
      if (words.length) return { audio, words };
      log(`voice: ${cfg.alignModel} returned no word timings, timing from the duration`);
    } catch (err) {
      log(`voice: ${cfg.alignModel} alignment failed (${(err as Error).message.split('\n')[0]})`);
    }
    return { audio };
  },
};
