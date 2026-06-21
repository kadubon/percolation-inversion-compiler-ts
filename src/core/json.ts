import type { JsonValue } from "./types.js";

export function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJson(item));
  }
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      const child = input[key];
      if (child !== undefined) {
        output[key] = sortJson(child);
      }
    }
    return output;
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

export function lfNormalize(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function parseJsonObject(
  text: string,
  label = "JSON",
): Record<string, unknown> {
  const parsed = JSON.parse(text) as JsonValue;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

export function dedupeSorted(
  values: Iterable<string | undefined | null>,
): string[] {
  return [
    ...new Set([...values].filter((item): item is string => Boolean(item))),
  ].sort();
}
