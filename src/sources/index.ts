import type { ShortsSourceKind } from '../schema';
import { log } from '../util';
import { loadDesk } from './desk';
import { loadDailyUpdates } from './daily-updates';
import { loadInbox } from './inbox';

export interface SourceItem {
  kind: ShortsSourceKind;
  title: string;
  body: string;
  href?: string;
  image?: string;
  tickers: string[];
  publishedAt?: string;
  /** Local inbox file, archived once the clip is published. */
  file?: string;
}

export const SOURCE_NAMES = ['desk', 'daily-updates', 'inbox'] as const;
export type SourceName = (typeof SOURCE_NAMES)[number];

const loaders: Record<SourceName, (date: string) => Promise<SourceItem[]>> = {
  desk: loadDesk,
  'daily-updates': loadDailyUpdates,
  inbox: loadInbox,
};

export const isSourceName = (name: string): name is SourceName =>
  (SOURCE_NAMES as readonly string[]).includes(name);

export async function loadSources(names: SourceName[], date: string): Promise<SourceItem[]> {
  const items: SourceItem[] = [];
  for (const name of names) {
    try {
      const loaded = await loaders[name](date);
      log(`source ${name}: ${loaded.length} item(s)`);
      items.push(...loaded);
    } catch (err) {
      log(`source ${name}: failed — ${(err as Error).message}`);
    }
  }
  return items;
}
