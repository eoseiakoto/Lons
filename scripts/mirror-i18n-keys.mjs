#!/usr/bin/env node
/**
 * Mirror i18n keys from en.json to all non-English locale files.
 *
 * For each target locale:
 *   - Reads the existing file (preserving any keys it already has)
 *   - Deep-merges with en.json, where existing values WIN over English placeholders
 *   - Writes back with the SAME key ordering as en.json (for diff readability)
 *
 * Run:
 *   node scripts/mirror-i18n-keys.mjs
 */

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOCALES_DIR = resolve(__dirname, '..', 'apps/admin-portal/src/lib/i18n/locales');
const SOURCE = 'en.json';
const TARGETS = ['fr.json', 'es.json', 'pt.json', 'ar.json', 'sw.json', 'ha.json'];

/** Recursively count leaf string keys in an object tree. */
function countKeys(obj) {
  let total = 0;
  for (const value of Object.values(obj)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      total += countKeys(value);
    } else {
      total += 1;
    }
  }
  return total;
}

/**
 * Build a new object using `source` as the canonical key tree:
 *   - For each key in source, if `existing` has the same key:
 *       * Both are objects -> recurse
 *       * Existing is a primitive (string/number/etc.) -> KEEP existing value
 *       * Mismatched types (e.g. existing is string, source is object) -> use source (English)
 *   - Otherwise -> use the source value (English placeholder) and count it as filled
 *
 * The returned object follows the source's insertion order, so the resulting JSON
 * file keeps the same key order as en.json.
 */
function mergePreserveOrder(source, existing, fillCounter) {
  const result = {};
  for (const [key, sourceValue] of Object.entries(source)) {
    const existingValue =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? existing[key]
        : undefined;

    if (
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue)
    ) {
      // Nested object — recurse.
      const nestedExisting =
        existingValue !== null &&
        typeof existingValue === 'object' &&
        !Array.isArray(existingValue)
          ? existingValue
          : {};
      result[key] = mergePreserveOrder(sourceValue, nestedExisting, fillCounter);
    } else if (existingValue !== undefined && typeof existingValue === typeof sourceValue) {
      // Existing value present and same primitive type — preserve it.
      result[key] = existingValue;
    } else {
      // Missing or wrong type — fill with English placeholder.
      result[key] = sourceValue;
      fillCounter.count += 1;
    }
  }
  return result;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Atomically write JSON: write to .tmp, then rename. */
function writeJsonAtomic(path, data) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  renameSync(tmp, path);
}

function main() {
  const sourcePath = join(LOCALES_DIR, SOURCE);
  if (!existsSync(sourcePath)) {
    console.error(`Source file not found: ${sourcePath}`);
    process.exit(1);
  }

  const source = readJson(sourcePath);
  const sourceKeyCount = countKeys(source);
  console.log(`Source: ${SOURCE} -> ${sourceKeyCount} keys\n`);

  const summary = [];

  for (const target of TARGETS) {
    const targetPath = join(LOCALES_DIR, target);
    if (!existsSync(targetPath)) {
      console.warn(`Target missing, will create: ${target}`);
    }

    const existing = existsSync(targetPath) ? readJson(targetPath) : {};
    const beforeCount = countKeys(existing);

    const fillCounter = { count: 0 };
    const merged = mergePreserveOrder(source, existing, fillCounter);

    // Override the locale/label fields so they reflect the target file's identity
    // even if existing copies were stale or missing them. The key set still matches en.json.
    if (Object.prototype.hasOwnProperty.call(merged, 'locale')) {
      merged.locale =
        typeof existing.locale === 'string' && existing.locale.length > 0
          ? existing.locale
          : target.replace('.json', '');
    }

    writeJsonAtomic(targetPath, merged);

    const afterCount = countKeys(merged);
    summary.push({
      file: target,
      before: beforeCount,
      after: afterCount,
      filled: fillCounter.count,
    });
  }

  console.log('Per-file results:');
  console.log('file       before    after    filled-from-en');
  for (const row of summary) {
    console.log(
      `${row.file.padEnd(10)} ${String(row.before).padStart(6)}   ${String(row.after).padStart(6)}   ${String(row.filled).padStart(6)}`,
    );
  }

  const allMatch = summary.every((row) => row.after === sourceKeyCount);
  console.log(
    `\nAll locales match en.json key count (${sourceKeyCount})? ${allMatch ? 'YES' : 'NO'}`,
  );
  if (!allMatch) process.exit(1);
}

main();
