#!/usr/bin/env bun
import packageJson from '../package.json';
import { printScaffoldResult, scaffoldResult } from '../lib/scaffold.ts';

printScaffoldResult(scaffoldResult('mmm-server', 3, packageJson.version, process.argv.slice(2)));
