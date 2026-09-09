import { createOpenAI } from '@ai-sdk/openai';
import { cfg } from '../config';
import { httpBytes, httpJson } from '../util';

const OPENAI_BASE = process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

const key = () => {
  const value = process.env.OPENAI_API_KEY?.trim();
  if (!value) throw new Error('OPENAI_API_KEY is required for OpenAI audio/image calls');
  return value;
};

const auth = () => ({ authorization: `Bearer ${key()}` });

/** Text model for `generateObject`; falls back to OpenRouter when OpenAI is absent. */
export function textModel() {
  if (process.env.OPENAI_API_KEY?.trim()) {
    return createOpenAI({ apiKey: key(), baseURL: OPENAI_BASE })(cfg.textModel);
  }
  const openrouter = process.env.OPENROUTER_API_KEY?.trim();
  if (!openrouter) throw new Error('set OPENAI_API_KEY or OPENROUTER_API_KEY');
  return createOpenAI({ apiKey: openrouter, baseURL: OPENROUTER_BASE })(
    cfg.textModel.includes('/') ? cfg.textModel : `openai/${cfg.textModel}`,
  );
}

/** `POST /audio/speech` — mp3 bytes, no timings. */
export const speech = (input: string, voice = 'alloy') =>
  httpBytes(`${OPENAI_BASE}/audio/speech`, {
    headers: auth(),
    json: { model: cfg.ttsModel, voice, input, response_format: 'mp3' },
  });

/** `POST /images/generations` — one portrait PNG. */
export async function image(prompt: string, size = '1024x1536'): Promise<Uint8Array> {
  const res = await httpJson<{ data?: { b64_json?: string; url?: string }[] }>(
    `${OPENAI_BASE}/images/generations`,
    { headers: auth(), json: { model: cfg.imageModel, prompt, size, n: 1 } },
  );
  const first = res.data?.[0];
  if (first?.b64_json) return Buffer.from(first.b64_json, 'base64');
  if (first?.url) return httpBytes(first.url);
  throw new Error('image response carried neither b64_json nor url');
}
