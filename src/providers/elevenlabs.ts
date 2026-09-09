import { httpJson } from '../util';

const BASE = 'https://api.elevenlabs.io/v1';

export const hasElevenLabs = () => Boolean(process.env.ELEVENLABS_API_KEY?.trim());

export interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

interface TimestampResponse {
  audio_base64: string;
  alignment?: Alignment | null;
  normalized_alignment?: Alignment | null;
}

/**
 * `POST /v1/text-to-speech/{voiceId}/with-timestamps` — base64 mp3 plus
 * per-character alignment, which we fold into word and beat windows.
 */
export async function ttsWithTimestamps(
  text: string,
  voiceId: string,
  modelId = 'eleven_multilingual_v2',
): Promise<{ audio: Uint8Array; alignment: Alignment | null }> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set');

  const res = await httpJson<TimestampResponse>(
    `${BASE}/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`,
    {
      headers: { 'xi-api-key': apiKey, accept: 'application/json' },
      json: { text, model_id: modelId, output_format: 'mp3_44100_128' },
    },
  );

  return {
    audio: Buffer.from(res.audio_base64, 'base64'),
    alignment: res.alignment ?? res.normalized_alignment ?? null,
  };
}
