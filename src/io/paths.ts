import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function packageRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    if (
      existsSync(join(current, "package.json")) &&
      existsSync(join(current, "schemas"))
    ) {
      return current;
    }
    const next = dirname(current);
    if (next === current) {
      break;
    }
    current = next;
  }
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

export function schemaDir(): string {
  return join(packageRoot(), "schemas");
}

export function fixtureDir(): string {
  return join(packageRoot(), "fixtures", "portability_conformance");
}

export function fixtureRoot(): string {
  return join(packageRoot(), "fixtures");
}
