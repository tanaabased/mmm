import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// An isolated research toolchain, never an application package or runtime dependency.
const source = fileURLToPath(new URL("../", import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), "mmm-analytics-"));
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: scratch, stdio: "inherit" });
  if (result.error || result.status !== 0)
    throw new Error(`${command} failed: ${result.error ?? result.status}`);
};

try {
  writeFileSync(
    join(scratch, "package.json"),
    readFileSync(join(source, "toolchain.json")),
  );
  cpSync(join(source, "toolchain.bun.lock"), join(scratch, "bun.lock"));
  for (const directory of ["lib", "test", "examples"])
    cpSync(join(source, directory), join(scratch, directory), {
      recursive: true,
    });
  run("bun", ["install", "--frozen-lockfile", "--ignore-scripts"]);
  const tests = readdirSync(join(scratch, "test"))
    .filter((name) => name.endsWith(".spec.mts"))
    .map((name) => `test/${name}`);
  const modules = readdirSync(join(scratch, "lib"))
    .filter((name) => name.endsWith(".mts"))
    .map((name) => `lib/${name}`);
  run("bun", [
    "node_modules/typescript/bin/tsc",
    "--noEmit",
    "--strict",
    "--target",
    "ES2022",
    "--module",
    "nodenext",
    "--allowImportingTsExtensions",
    "--types",
    "node,mocha",
    ...modules,
    ...tests,
  ]);
  run("bun", ["node_modules/mocha/bin/mocha.js", ...tests]);
  run("node", ["node_modules/mocha/bin/mocha.js", ...tests]);
  run("bun", [
    "node_modules/prettier/bin/prettier.cjs",
    "--check",
    source,
    join(source, "../analytics-and-strategies.md"),
    "--no-config",
    "--no-editorconfig",
    "--ignore-path",
    "/dev/null",
  ]);
  run("node", [
    "-e",
    "console.log(`Node ${process.version}; ICU ${process.versions.icu}; tz ${process.versions.tz}`)",
  ]);
  run("bun", ["--version"]);
  console.log("Research checks passed");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
