#!/usr/bin/env bun
import path from 'node:path';
import { Command } from 'commander';
import { paths, root } from './config';
import { publish, type Publishable } from './pipeline/publish';
import { render } from './pipeline/render';
import { scriptFor, type ClipScript } from './pipeline/script';
import { select, type Selected } from './pipeline/select';
import { visualsFor, type BeatVisual } from './pipeline/visuals';
import { voiceFor, type VoiceResult } from './pipeline/voice';
import { archiveInbox } from './sources/inbox';
import { SOURCE_NAMES, isSourceName, loadSources, type SourceName } from './sources';
import { dailyFiles, validateFiles } from './validate';
import { ensureDir, initLog, isoDate, log, readJson, writeJson } from './util';

const parseSources = (value?: string): SourceName[] => {
  if (!value) return [...SOURCE_NAMES];
  const names = value.split(',').map((n) => n.trim()).filter(Boolean);
  const bad = names.filter((n) => !isSourceName(n));
  if (bad.length) throw new Error(`unknown source(s): ${bad.join(', ')}`);
  return names.filter(isSourceName);
};

const program = new Command('desk-shorts').description('Daily 9:16 clips for the /shorts feed');

program
  .command('generate')
  .option('--date <YYYY-MM-DD>')
  .option('--limit <n>', 'clips to produce', '6')
  .option('--sources <list>', `comma-separated: ${SOURCE_NAMES.join(',')}`)
  .option('--dry-run', 'stop after script generation and print the scripts')
  .action(async (opts) => {
    const date = opts.date ?? isoDate();
    initLog(paths.runLog(date));
    log(`desk-shorts ${date} — workspace ${root}`);

    const items = await loadSources(parseSources(opts.sources), date);
    const selected = select(items, date, Number(opts.limit));
    log(`selected ${selected.length} of ${items.length} item(s)`);
    if (!selected.length) return;

    const entries: Publishable[] = [];
    const failures: string[] = [];

    for (const item of selected) {
      const dir = paths.work(date, item.id);
      ensureDir(dir);
      try {
        await writeJson(path.join(dir, 'item.json'), item);
        const script = await scriptFor(dir, item);
        if (opts.dryRun) {
          log(`\n--- ${item.id} ${item.kind}\n${JSON.stringify(script, null, 2)}`);
          continue;
        }
        const voice = await voiceFor(dir, script);
        const visuals = await visualsFor(dir, script, item, voice.beats);
        const rendered = await render(dir, script, voice, visuals);
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
  .action(async (clipId: string, opts) => {
    const date = opts.date ?? isoDate();
    initLog(paths.runLog(date));
    const dir = paths.work(date, clipId);

    const item = await readJson<Selected>(path.join(dir, 'item.json'));
    const script = await readJson<ClipScript>(path.join(dir, 'script.json'));
    const voice = await readJson<VoiceResult>(path.join(dir, 'voice.json'));
    if (!item || !script || !voice) throw new Error(`no cached script/voice in ${dir}`);

    const visuals: BeatVisual[] = [];
    for (const i of script.beats.keys()) {
      const video = path.join(dir, `beat-${i}.mp4`);
      visuals.push({
        image: path.join(dir, `beat-${i}.jpg`),
        ...((await Bun.file(video).exists()) ? { video } : {}),
      });
    }

    const rendered = await render(dir, script, voice, visuals);
    const doc = await publish(date, [{ item, script, voice, rendered }]);
    log(`re-rendered ${clipId} — ${doc.clips.length} clip(s) in ${paths.daily(date)}`);
  });

program.parseAsync().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
