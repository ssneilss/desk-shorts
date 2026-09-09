import { cfg } from '../../config';
import type { VoiceProvider } from '../../plugin';
import { hasElevenLabs, ttsWithTimestamps } from '../../providers/elevenlabs';

export const elevenlabsVoice: VoiceProvider = {
  id: 'elevenlabs',
  available: hasElevenLabs,
  async synthesize({ text, persona }) {
    const voiceId = persona.voice.provider === 'elevenlabs' ? persona.voice.voiceId : cfg.voiceId;
    const { audio, alignment } = await ttsWithTimestamps(text, voiceId);
    return alignment
      ? {
          audio,
          charTimes: {
            starts: alignment.character_start_times_seconds,
            ends: alignment.character_end_times_seconds,
          },
        }
      : { audio };
  },
};
