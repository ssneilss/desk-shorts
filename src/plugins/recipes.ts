import type { Recipe } from '../plugin';

export const recipes: Recipe[] = [
  { id: 'classic', personas: ['analyst'], scenes: ['concept'], layout: 'scenes' },
  {
    id: 'presenter',
    personas: ['anchor', 'analyst', 'hype', 'gentle', 'skeptic'],
    scenes: ['presenter', 'chart', 'image', 'concept'],
    avatar: 'hedra',
    layout: 'pip',
  },
];
