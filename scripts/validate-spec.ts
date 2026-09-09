#!/usr/bin/env bun
import { dailyFiles, validateFiles } from '../src/validate';

const files = process.argv.slice(2);
const ok = await validateFiles(files.length ? files : await dailyFiles());
if (!ok) process.exit(1);
