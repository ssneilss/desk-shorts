import type { Recipe } from '../plugin';
import { styles } from './styles';

const ALL_STYLES = styles.map((style) => style.id);

export const recipes: Recipe[] = [
  {
    id: 'classic',
    personas: ['analyst', 'anchor', 'gentle', 'skeptic'],
    scenes: ['concept'],
    styles: ALL_STYLES,
    layout: 'scenes',
  },
  {
    id: 'presenter',
    personas: ['anchor', 'analyst', 'hype', 'gentle', 'skeptic'],
    scenes: ['presenter', 'chart', 'image', 'concept'],
    styles: ALL_STYLES,
    avatar: 'hedra',
    layout: 'pip',
  },
];
