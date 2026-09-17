import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { paths } from './config';
import { parseShortsDoc } from './schema';

export async function dailyFiles(): Promise<string[]> {
  try {
    return (await readdir(paths.dailyDir))
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .sort()
      .map((name) => path.join(paths.dailyDir, name));
  } catch {
    return [];
  }
}

export async function validateFiles(files: string[]): Promise<boolean> {
  if (!files.length) {
    console.log('no shorts/daily/*.json to validate');
    return true;
  }
  let ok = true;
  for (const file of files) {
    const result = parseShortsDoc(await Bun.file(file).text());
    if (result.errors) {
      ok = false;
      console.error(`FAIL ${file}`);
      for (const issue of result.errors) console.error(`  ${issue}`);
    } else {
      console.log(`ok   ${file} (${result.doc.clips.length} clips)`);
    }
  }
  return ok;
}
