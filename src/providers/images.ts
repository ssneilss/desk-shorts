import { cfg } from '../config';
import { image as openaiImage } from './openai';
import { hasOpenRouter, image as openrouterImage } from './openrouter';

const DEFAULT_MODEL = {
  openrouter: 'google/gemini-2.5-flash-image',
  openai: 'gpt-image-1',
} as const;

/** `SHORTS_IMAGE_MODEL` wins; each route otherwise keeps its own default slug. */
export const imageModel = (route: keyof typeof DEFAULT_MODEL) =>
  cfg.imageModel || DEFAULT_MODEL[route];

/** One 9:16 PNG: OpenRouter when it has a key, else OpenAI. */
export const generateImage = (prompt: string): Promise<Uint8Array> =>
  hasOpenRouter()
    ? openrouterImage(prompt, imageModel('openrouter'))
    : openaiImage(prompt, imageModel('openai'));
