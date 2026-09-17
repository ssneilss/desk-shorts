import type { Plugin } from '../plugin';
import { hedraPlugin } from './avatars/hedra';
import { personas } from './personas';
import { recipes } from './recipes';
import { chartScene } from './scenes/chart';
import { conceptScene } from './scenes/concept';
import { imageScene } from './scenes/image';
import { presenterScene } from './scenes/presenter';
import { deskSource } from './sources/desk';
import { documentsSource } from './sources/documents';
import { inboxSource } from './sources/inbox';
import { signalDeskSource } from './sources/signal-desk';
import { styles } from './styles';
import { elevenlabsVoice } from './voices/elevenlabs';
import { openaiVoice } from './voices/openai';
import { openrouterVoice } from './voices/openrouter';

export const plugins: Plugin[] = [
  { id: 'core', personas, styles, recipes },
  { id: 'openrouter', voices: [openrouterVoice] },
  { id: 'elevenlabs', voices: [elevenlabsVoice] },
  { id: 'openai', voices: [openaiVoice] },
  { id: 'concept', scenes: [conceptScene] },
  { id: 'image', scenes: [imageScene] },
  { id: 'chart', scenes: [chartScene] },
  { id: 'presenter', scenes: [presenterScene] },
  { id: 'signal-desk', sources: [signalDeskSource] },
  { id: 'desk', sources: [deskSource] },
  { id: 'documents', sources: [documentsSource] },
  { id: 'inbox', sources: [inboxSource] },
  hedraPlugin,
];
