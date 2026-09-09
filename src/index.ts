#!/usr/bin/env bun
import path from 'node:path';
import { Command } from 'commander';
import { loadBook } from './book';
import { cfg, paths, root } from './config';
import { registry, resolve } from './plugin';
import { presenterFor } from './pipeline/presenter';
import { publish, type Publishable } from './pipeline/publish';
import { render } from './pipeline/render';
import { scenesFor, segmentPaths } from './pipeline/scenes';
import { scriptFor, type ClipScript } from './pipeline/script';
import { select, type Selected } from './pipeline/select';
import { loadSources, pickSources } from './pipeline/sources';
import { voiceFor, type VoiceResult } from './pipeline/voice';
import { archiveInbox } from './plugins/sources/inbox';
import { dailyFiles, validateFiles } from './validate';
import { ensureDir, initLog, isoDate, log, readJson, writeJson } from './util';

const program = new Command('desk-shorts').description('Daily 9:16 clips for the /shorts feed');

program
  .command('generate')
  .option('--date <YYYY-MM-DD>')
  .option('--limit <n>', 'clips to produce', '6')
  .option('--sources <list>', `comma-separated: ${registry.sources.map((s) => s.id).join(',')}`)
  .option('--recipe <id>', 'plugin recipe (default SHORTS_RECIPE)')
  .option('--dry-run', 'stop after script generation and print the scripts')
  .action(async (opts) => {
    const date = opts.date ?? isoDate();
    initLog(paths.runLog(date));
    log(`desk-shorts ${date} — workspace ${root}`);

    const items = await loadSources(pickSources(opts.sources), date);
    const selected = select(items, date, Number(opts.limit), await loadBook(date));
    log(`selected ${selected.length} of ${items.length} item(s)`);
    if (!selected.length) return;

    const entries: Publishable[] = [];
    const failures: string[] = [];

    for (const item of selected) {
      const dir = paths.work(date, item.id);
      ensureDir(dir);
      try {
        const resolved = resolve(opts.recipe ?? cfg.recipe, item.id);
        log(
          `${item.id}: recipe ${resolved.recipe.id}, persona ${resolved.persona.id}, voice ${resolved.voice.id}` +
            `${resolved.avatar ? `, avatar ${resolved.avatar.id}` : ''}`,
        );
        await writeJson(path.join(dir, 'item.json'), item);
        const script = await scriptFor(dir, item, resolved);
        if (opts.dryRun) {
          log(`\n--- ${item.id} ${item.kind}\n${JSON.stringify(script, null, 2)}`);
          continue;
        }
        const voice = await voiceFor(dir, script, resolved);
        const presenter = resolved.avatar
          ? await presenterFor(dir, resolved.persona, voice, resolved.avatar)
          : undefined;
        const segments = await scenesFor({ dir, item, script, voice, resolved, presenter });
        const rendered = await render(
          dir,
          script,
          voice,
          segments,
          resolved.recipe.layout === 'pip' ? presenter : undefined,
        );
        entries.push({ item, script, voice, rendered });
        log(`rendered ${item.id} (${rendered.durationSec.toFixed(1)}s) — ${script.title}`);
      } catch (err) {
        failures.push(`${item.id}: ${(err as Error).message}`);
        log(`FAILED ${item.id}\n${(err as Error).message}`);
      }
    }

    if (opts.dryRun) return;
    if (!entries.length) throw new Error(`no clips produced\n${failures.join('\n')}`);

    const doc = await publish(date, entries);
    await archiveInbox(entries.map((e) => e.item));
    log(`wrote ${paths.daily(date)} — ${doc.clips.length} clip(s)`);
    if (failures.length) process.exitCode = 1;
  });

program
  .command('validate [file]')
  .description('validate shorts/daily/*.json against the shorts schema')
  .action(async (file?: string) => {
    const ok = await validateFiles(file ? [file] : await dailyFiles());
    if (!ok) process.exitCode = 1;
  });

program
  .command('render-one <clipId>')
  .description('re-render one clip from its cached .work directory')
  .option('--date <YYYY-MM-DD>')
  .option('--recipe <id>', 'plugin recipe (default SHORTS_RECIPE)')
  .action(async (clipId: string, opts) => {
    const date = opts.date ?? isoDate();
    initLog(paths.runLog(date));
    const dir = paths.work(date, clipId);

    const item = await readJson<Selected>(path.join(dir, 'item.json'));
    const script = await readJson<ClipScript>(path.join(dir, 'script.json'));
    const voice = await readJson<VoiceResult>(path.join(dir, 'voice.json'));
    if (!item || !script || !voice) throw new Error(`no cached script/voice in ${dir}`);

    const segments = segmentPaths(dir, script.beats.length);
    for (const segment of segments) {
      if (!(await Bun.file(segment).exists())) throw new Error(`missing ${segment}`);
    }

    const presenter = path.join(dir, 'presenter.mp4');
    const layout = resolve(opts.recipe ?? cfg.recipe, clipId).recipe.layout;
    const overlay =
      layout === 'pip' && (await Bun.file(presenter).exists()) ? presenter : undefined;

    const rendered = await render(dir, script, voice, segments, overlay);
    const doc = await publish(date, [{ item, script, voice, rendered }]);
    log(`re-rendered ${clipId} — ${doc.clips.length} clip(s) in ${paths.daily(date)}`);
  });

program.parseAsync().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
