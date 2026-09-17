import { cfg } from '../config';
import type { Persona } from '../plugin';

interface Def {
  id: string;
  name: string;
  enName: string;
  /** MiniMax system voice id, spoken through `minimax/speech-2.8-turbo` on OpenRouter. */
  voice: string;
  /** MiniMax emotion for the Mandarin twin. */
  emotion: string;
  instruction?: string;
  tone: string;
  enTone: string;
  look: string;
}

const DEFS: Def[] = [
  {
    id: 'anchor',
    name: '主播',
    enName: 'The Anchor',
    voice: 'Chinese (Mandarin)_Male_Announcer',
    emotion: 'calm',
    tone: '新闻主播腔：字正腔圆、干净利落，先给结论再给证据，不用语气词，不铺垫，不煽情。',
    enTone:
      'A news anchor: precise and authoritative, conclusion first then the evidence, no filler, no warm-up.',
    look: 'a composed male news anchor in a dark suit',
  },
  {
    id: 'analyst',
    name: '冷静分析师',
    enName: 'The Analyst',
    voice: 'Chinese (Mandarin)_Wise_Women',
    emotion: 'calm',
    instruction: '用冷静、克制、专业的语气',
    tone: '冷静分析师：像给同事做晨会简报，克制、具体，只讲能被数据支撑的判断，不吹不黑。',
    enTone:
      'A senior analyst briefing colleagues: calm, specific, no hype, no clickbait, every claim tied to a figure in the source.',
    look: 'a calm female equity analyst in a navy blazer',
  },
  {
    id: 'hype',
    name: '高能带货主播',
    enName: 'The Hype',
    voice: 'Chinese (Mandarin)_Unrestrained_Young_Man',
    emotion: 'happy',
    instruction: '用高能、兴奋、带货主播的语气',
    tone: '高能带货风：短句、快节奏、可以用感叹句制造张力，但数字必须原样引用，绝不编造。',
    enTone:
      'High-energy livestream host: short punchy sentences, exclamations allowed, but every number is quoted exactly and nothing is invented.',
    look: 'an energetic young male host in a bright studio',
  },
  {
    id: 'gentle',
    name: '温柔讲解员',
    enName: 'The Explainer',
    voice: 'Chinese (Mandarin)_Warm_Girl',
    emotion: 'calm',
    instruction: '用温柔、耐心讲解的语气',
    tone: '温柔讲解：像给新人耐心解释，先讲清概念再给数字，句子舒缓，不用行话轰炸。',
    enTone:
      'A patient explainer: define the idea before the number, unhurried sentences, no jargon dumps.',
    look: 'a warm female teacher in soft light',
  },
  {
    id: 'skeptic',
    name: '吐槽段子手',
    enName: 'The Skeptic',
    voice: 'Chinese (Mandarin)_Humorous_Elder',
    emotion: 'happy',
    instruction: '用北京腔、吐槽、幽默的语气',
    tone: '吐槽段子手：北京腔、干冷幽默，每个 beat 最多一个包袱，抖完立刻回到事实。',
    enTone:
      'A dry sceptic: sardonic, at most one joke per beat, and straight back to the facts after it.',
    look: 'a wry middle-aged male commentator with a slight smirk',
  },
];

const portrait = (look: string) =>
  `Studio portrait of ${look}, head and shoulders, facing the camera, neutral navy backdrop, soft key light, photorealistic, vertical 9:16 framing, no text`;

const zh = (d: Def): Persona => ({
  id: d.id,
  name: d.name,
  lang: 'zh',
  tone: d.tone,
  voice: {
    provider: 'openrouter',
    voiceId: d.voice,
    emotion: d.emotion,
    ...(d.instruction ? { instruction: d.instruction } : {}),
  },
  portraitPrompt: portrait(d.look),
});

const en = (d: Def): Persona => ({
  id: `${d.id}-en`,
  name: d.enName,
  lang: 'en',
  tone: d.enTone,
  voice: { provider: 'elevenlabs', voiceId: cfg.voiceId },
  portraitPrompt: portrait(d.look),
});

export const personas: Persona[] = DEFS.flatMap((d) => [zh(d), en(d)]);
