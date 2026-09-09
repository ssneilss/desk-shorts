import type { VoiceProvider } from '../../plugin';
import { speech } from '../../providers/openai';

export const openaiVoice: VoiceProvider = {
  id: 'openai',
  available: () => Boolean(process.env.OPENAI_API_KEY?.trim()),
  async synthesize({ text, persona }) {
    const voice = persona.voice.provider === 'openai' ? persona.voice.voiceId : 'alloy';
    return { audio: await speech(text, voice) };
  },
};
