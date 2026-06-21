import { readFileSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { parseJsonObject } from "../core/json.js";
import { fixtureDir, fixtureRoot } from "./paths.js";

function safeFixturePath(...parts: string[]): string {
  const root = normalize(fixtureRoot());
  const normalized = normalize(join(root, ...parts));
  if (normalized !== root && !normalized.startsWith(`${root}${sep}`)) {
    throw new Error("fixture path escapes package fixtures");
  }
  return normalized;
}

export function fixtureJson(file: string): Record<string, unknown> {
  return parseJsonObject(readFileSync(join(fixtureDir(), file), "utf8"), file);
}

export function fixtureText(namespace: string, file: string): string {
  if (namespace.includes("..") || file.includes("..")) {
    throw new Error("fixture path must not contain parent traversal");
  }
  return readFileSync(safeFixturePath(namespace, file), "utf8");
}

export function fixtureJsonFrom(
  namespace: string,
  file: string,
): Record<string, unknown> {
  return parseJsonObject(fixtureText(namespace, file), `${namespace}/${file}`);
}

export function pythonCliFixture(name: string): Record<string, unknown> {
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error(
      `invalid Python v0.4.4 CLI fixture ${JSON.stringify(name)}`,
    );
  }
  return fixtureJsonFrom("python_v044_cli", `${name}.json`);
}

export function demoFixtureJson(file: string): Record<string, unknown> {
  return fixtureJsonFrom("python_v044_demo", file);
}

export function portabilityManifest(): Record<string, unknown> {
  return fixtureJson("manifest.json");
}
