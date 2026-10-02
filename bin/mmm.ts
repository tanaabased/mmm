#!/usr/bin/env bun
import packageJson from '../package.json';
import { printScaffoldResult, scaffoldResult } from '../lib/scaffold.ts';

const SCRIPT_VERSION = packageJson.version;

printScaffoldResult(scaffoldResult(SCRIPT_VERSION, process.argv.slice(2)));
