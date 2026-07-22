#!/usr/bin/env node
/**
 * Keep every package.json version (and internal @vaagatech/anvesh-* deps) in sync.
 *
 * Usage:
 *   node scripts/version.mjs check
 *   node scripts/version.mjs sync
 *   node scripts/version.mjs set 1.2.3
 *   node scripts/version.mjs bump minor|patch|major
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEMVER = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const TAG_SEMVER = /^v(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function packageJsonPaths() {
  const paths = [path.join(root, "package.json")];
  for (const dir of ["apps", "packages"]) {
    const base = path.join(root, dir);
    for (const name of readdirSync(base)) {
      const pkg = path.join(base, name, "package.json");
      try {
        if (statSync(pkg).isFile()) paths.push(pkg);
      } catch {
        /* skip */
      }
    }
  }
  return paths;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function parseSemver(version) {
  const m = version.match(SEMVER);
  if (!m) {
    throw new Error(`Invalid semver "${version}". Expected X.Y.Z with 1–3 digits per part.`);
  }
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function formatSemver({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

function bump(version, kind) {
  const v = parseSemver(version);
  if (kind === "major") return formatSemver({ major: v.major + 1, minor: 0, patch: 0 });
  if (kind === "minor") return formatSemver({ major: v.major, minor: v.minor + 1, patch: 0 });
  if (kind === "patch") return formatSemver({ major: v.major, minor: v.minor, patch: v.patch + 1 });
  throw new Error(`Unknown bump kind "${kind}". Use major|minor|patch.`);
}

function applyVersion(version) {
  parseSemver(version);
  const files = packageJsonPaths();
  for (const file of files) {
    const pkg = readJson(file);
    pkg.version = version;
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      const deps = pkg[field];
      if (!deps) continue;
      for (const name of Object.keys(deps)) {
        if (name.startsWith("@vaagatech/anvesh-") || name === "@vaagatech/vaakly") {
          deps[name] = version;
        }
      }
    }
    writeJson(file, pkg);
  }
  return files.length;
}

function currentVersions() {
  return packageJsonPaths().map((file) => ({
    file: path.relative(root, file),
    version: readJson(file).version,
  }));
}

function checkSync(expected) {
  const rows = currentVersions();
  const target = expected ?? rows[0]?.version;
  const bad = rows.filter((r) => r.version !== target);
  if (bad.length) {
    console.error(`Version mismatch (expected ${target}):`);
    for (const r of rows) console.error(`  ${r.file}: ${r.version}`);
    process.exit(1);
  }
  parseSemver(target);
  console.log(`OK — ${rows.length} package.json files at ${target}`);
  return target;
}

function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "check") {
    checkSync();
    return;
  }
  if (cmd === "sync") {
    const rootVersion = readJson(path.join(root, "package.json")).version;
    const n = applyVersion(rootVersion);
    console.log(`Synced ${n} package.json files to ${rootVersion}`);
    return;
  }
  if (cmd === "set") {
    if (!arg || !SEMVER.test(arg)) {
      console.error("Usage: node scripts/version.mjs set <X.Y.Z>");
      process.exit(1);
    }
    const n = applyVersion(arg);
    console.log(`Set ${n} package.json files to ${arg}`);
    return;
  }
  if (cmd === "bump") {
    const kind = arg || "minor";
    const current = readJson(path.join(root, "package.json")).version;
    const next = bump(current, kind);
    const n = applyVersion(next);
    console.log(`Bumped ${n} package.json files: ${current} → ${next}`);
    return;
  }
  if (cmd === "from-tag") {
    const tag = arg || "";
    const m = tag.match(TAG_SEMVER);
    if (!m) {
      console.error(`Tag must match vX.Y.Z (1–3 digits per part). Got: ${tag}`);
      process.exit(1);
    }
    const version = `${m[1]}.${m[2]}.${m[3]}`;
    checkSync(version);
    console.log(version);
    return;
  }
  console.error(`Usage:
  node scripts/version.mjs check
  node scripts/version.mjs sync
  node scripts/version.mjs set <X.Y.Z>
  node scripts/version.mjs bump minor|patch|major
  node scripts/version.mjs from-tag vX.Y.Z`);
  process.exit(1);
}

main();
