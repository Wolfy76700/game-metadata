#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";

/**
 * Validates every JSON file under games/{slug}/characters/ and
 * games/{slug}/stages/ against the canonical schema used by
 * super-smash-bros-melee and super-smash-bros-ultimate.
 *
 * Exits non-zero on any structural violation.
 */

const GAMES_DIR = path.join(process.cwd(), "games");

const ALLOWED_TOP_KEYS = new Set(["name", "variants"]);
const ALLOWED_VARIANT_KEYS = new Set(["images", "metadata"]);
const ALLOWED_IMAGE_KEYS: Record<"characters" | "stages", Set<string>> = {
  characters: new Set(["stock_icon"]),
  stages: new Set(["thumbnail"]),
};
const ALLOWED_METADATA_KEYS = new Set(["color", "variant"]);

type Kind = "characters" | "stages";

interface FileTarget {
  filePath: string;
  kind: Kind;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectFiles(): FileTarget[] {
  const targets: FileTarget[] = [];
  if (!fs.existsSync(GAMES_DIR)) return targets;
  for (const game of fs.readdirSync(GAMES_DIR)) {
    const gameDir = path.join(GAMES_DIR, game);
    if (!fs.statSync(gameDir).isDirectory()) continue;
    for (const kind of ["characters", "stages"] as Kind[]) {
      const subDir = path.join(gameDir, kind);
      if (!fs.existsSync(subDir)) continue;
      for (const entry of fs.readdirSync(subDir)) {
        if (!entry.endsWith(".json")) continue;
        targets.push({ filePath: path.join(subDir, entry), kind });
      }
    }
  }
  return targets;
}

function validate(target: FileTarget, errors: string[]): void {
  const rel = path.relative(process.cwd(), target.filePath);
  let raw: string;
  try {
    raw = fs.readFileSync(target.filePath, "utf8");
  } catch (err) {
    errors.push(`${rel}: unreadable (${(err as Error).message})`);
    return;
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    errors.push(`${rel}: invalid JSON (${(err as Error).message})`);
    return;
  }

  if (!isPlainObject(data)) {
    errors.push(`${rel}: root must be an object`);
    return;
  }

  for (const key of Object.keys(data)) {
    if (!ALLOWED_TOP_KEYS.has(key)) {
      errors.push(`${rel}: unexpected top-level key "${key}" (allowed: ${[...ALLOWED_TOP_KEYS].join(", ")})`);
    }
  }

  if (typeof data.name !== "string" || data.name.length === 0) {
    errors.push(`${rel}: "name" must be a non-empty string`);
  }

  if (!Array.isArray(data.variants)) {
    errors.push(`${rel}: "variants" must be an array`);
    return;
  }
  if (data.variants.length === 0) {
    errors.push(`${rel}: "variants" must not be empty`);
  }

  const allowedImageKeys = ALLOWED_IMAGE_KEYS[target.kind];

  data.variants.forEach((variant, i) => {
    const at = `${rel}: variants[${i}]`;
    if (!isPlainObject(variant)) {
      errors.push(`${at}: must be an object`);
      return;
    }
    for (const key of Object.keys(variant)) {
      if (!ALLOWED_VARIANT_KEYS.has(key)) {
        errors.push(`${at}: unexpected key "${key}" (allowed: ${[...ALLOWED_VARIANT_KEYS].join(", ")})`);
      }
    }

    if (!isPlainObject(variant.images)) {
      errors.push(`${at}.images: required object`);
    } else {
      for (const [key, value] of Object.entries(variant.images)) {
        if (!allowedImageKeys.has(key)) {
          errors.push(`${at}.images: unexpected key "${key}" (allowed for ${target.kind}: ${[...allowedImageKeys].join(", ")})`);
        }
        if (typeof value !== "string" || value.length === 0) {
          errors.push(`${at}.images.${key}: must be a non-empty string`);
        }
      }
    }

    if (variant.metadata !== undefined) {
      if (!isPlainObject(variant.metadata)) {
        errors.push(`${at}.metadata: must be an object`);
      } else {
        for (const [key, value] of Object.entries(variant.metadata)) {
          if (!ALLOWED_METADATA_KEYS.has(key)) {
            errors.push(`${at}.metadata: unexpected key "${key}" (allowed: ${[...ALLOWED_METADATA_KEYS].join(", ")})`);
          }
          if (key === "color" && typeof value !== "string") {
            errors.push(`${at}.metadata.color: must be a string`);
          }
          if (key === "variant" && typeof value !== "number") {
            errors.push(`${at}.metadata.variant: must be a number`);
          }
        }
      }
    }
  });
}

function main(): void {
  const targets = collectFiles();
  const errors: string[] = [];
  for (const target of targets) validate(target, errors);

  if (errors.length > 0) {
    console.error(`Validated ${targets.length} file(s); found ${errors.length} error(s):\n`);
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }
  console.log(`Validated ${targets.length} file(s); no errors.`);
}

main();
