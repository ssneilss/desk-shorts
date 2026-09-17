import { registry, type Registry, type Source, type SourceItem } from '../plugin';
import { log } from '../util';

export function pickSources(value?: string, reg: Registry = registry): Source[] {
  const names = (value ?? '').split(',').map((n) => n.trim()).filter(Boolean);
  if (!names.length) return reg.sources;
  const known = new Set(reg.sources.map((s) => s.id));
  const bad = names.filter((n) => !known.has(n));
  if (bad.length) {
    throw new Error(`unknown source(s): ${bad.join(', ')} (have: ${[...known].join(', ')})`);
  }
  return names.map((n) => reg.source(n));
}

export async function loadSources(sources: Source[], date: string): Promise<SourceItem[]> {
  const items: SourceItem[] = [];
  for (const source of sources) {
    try {
      const loaded = await source.load(date);
      log(`source ${source.id}: ${loaded.length} item(s)`);
      items.push(...loaded);
    } catch (err) {
      log(`source ${source.id}: failed — ${(err as Error).message}`);
    }
  }
  return items;
}
