#!/usr/bin/env bun
import packageJson from '../package.json';
import { printScaffoldResult, scaffoldResult } from '../lib/scaffold.ts';

printScaffoldResult(scaffoldResult('mmm-tui', 5, packageJson.version, process.argv.slice(2)));
