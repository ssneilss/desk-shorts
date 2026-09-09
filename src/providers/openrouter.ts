import { cfg } from '../config';
import type { Word } from '../plugin';
import { httpBytes, httpJson } from '../util';

const BASE = 'https://openrouter.ai/api/v1';

export const hasOpenRouter = () => Boolean(process.env.OPENROUTER_API_KEY?.trim());

const auth = () => {
  const value = process.env.OPENROUTER_API_KEY?.trim();
  if (!value) throw new Error('OPENROUTER_API_KEY is required for OpenRouter audio/image calls');
  return { authorization: `Bearer ${value}` };
};

export interface SpeechRequest {
  model: string;
  input: string;
  voice: string;
  speed?: number;
  /** Passthrough keyed by provider slug, e.g. `{ options: { minimax: { emotion } } }`. */
  provider?: { options: Record<string, Record<string, unknown>> };
}

/** `POST /audio/speech` — raw mp3 bytes, no timings. */
export const speech = (req: SpeechRequest): Promise<Uint8Array> =>
  httpBytes(`${BASE}/audio/speech`, {
    headers: auth(),
    json: { ...req, response_format: 'mp3' },
  });

export interface Transcript {
  text: string;
  words?: { word: string; start: number; end: number }[];
}

export const wordsFrom = (res: Transcript): Word[] =>
  (res.words ?? []).map((w) => ({ text: w.word, start: w.start, end: w.end }));

/** `POST /audio/transcriptions` — `verbose_json` word timings for mp3 bytes we already hold. */
export async function transcribe(audio: Uint8Array, lang: string): Promise<Word[]> {
  const res = await httpJson<Transcript>(`${BASE}/audio/transcriptions`, {
    headers: auth(),
    json: {
      model: cfg.alignModel,
      input_audio: { data: Buffer.from(audio).toString('base64'), format: 'mp3' },
      language: lang.slice(0, 2),
      response_format: 'verbose_json',
      timestamp_granularities: ['word'],
    },
  });
  return wordsFrom(res);
}

/** `POST /images` — one 9:16 PNG. */
export async function image(prompt: string, model: string): Promise<Uint8Array> {
  const res = await httpJson<{ data?: { b64_json?: string }[] }>(`${BASE}/images`, {
    headers: auth(),
    json: { model, prompt, aspect_ratio: '9:16', output_format: 'png', n: 1 },
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error('image response carried no b64_json');
  return Buffer.from(b64, 'base64');
}
