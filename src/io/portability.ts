import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, normalize, resolve, sep } from "node:path";
import { lfNormalize, parseJsonObject } from "../core/json.js";
import { schemaNames, validateByType } from "./schema.js";

export interface PortabilityConformanceReport {
  report_id: string;
  manifest_path: string;
  checked_examples: Record<string, string>;
  checked_negative_examples: Record<string, string>;
  schema_names: Record<string, string>;
  sha256: Record<string, string>;
  schema_digest: string;
  positive_example_count: number;
  negative_example_count: number;
  expected_failure_count: number;
  unexpected_failure_count: number;
  semantic_invariants: string[];
  accepted: boolean;
  operationally_usable: boolean;
  settled: boolean;
  reasons: string[];
}

function normalizedSha256(text: string): string {
  return createHash("sha256").update(lfNormalize(text), "utf8").digest("hex");
}

function stableCompactJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableCompactJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    return `{${Object.keys(input)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableCompactJson(input[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function safeManifestTarget(base: string, file: string): string | null {
  if (!file || isAbsolute(file)) {
    return null;
  }
  const normalized = normalize(file);
  if (normalized.split(/[\\/]+/).includes("..")) {
    return null;
  }
  const baseResolved = resolve(base);
  const target = resolve(baseResolved, normalized);
  if (target !== baseResolved && !target.startsWith(`${baseResolved}${sep}`)) {
    return null;
  }
  return target;
}

export function verifyPortabilityManifest(
  manifestPath: string,
): PortabilityConformanceReport {
  const manifest = parseJsonObject(
    readFileSync(manifestPath, "utf8"),
    "portability manifest",
  );
  const base = dirname(manifestPath);
  const knownSchemas = new Set(schemaNames());
  const checkedExamples: Record<string, string> = {};
  const checkedNegativeExamples: Record<string, string> = {};
  const checkedSchemas: Record<string, string> = {};
  const sha: Record<string, string> = {};
  const reasons: string[] = [];
  let unexpectedFailureCount = 0;
  let expectedFailureCount = 0;

  if (!Array.isArray(manifest.examples)) {
    reasons.push("manifest examples must be a list");
  }
  if (!Array.isArray(manifest.negative_examples)) {
    reasons.push("manifest negative_examples must be a list");
  }

  for (const entry of Array.isArray(manifest.examples)
    ? manifest.examples
    : []) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      reasons.push("manifest example entry must be an object");
      continue;
    }
    const example = entry as Record<string, unknown>;
    const file = String(example.file ?? "");
    const schema = String(example.schema ?? "");
    const expectedSha = example.sha256 ? String(example.sha256) : "";
    if (
      typeof example.file !== "string" ||
      typeof example.schema !== "string"
    ) {
      reasons.push("manifest example entries require string file and schema");
      continue;
    }
    checkedSchemas[file] = schema;
    const path = safeManifestTarget(base, file);
    if (path === null) {
      checkedExamples[file] = "unsafe-path";
      reasons.push(`${file}: example path is outside manifest directory`);
      unexpectedFailureCount += 1;
      continue;
    }
    if (!existsSync(path)) {
      checkedExamples[file] = "missing";
      reasons.push(`${file}: example file is missing`);
      unexpectedFailureCount += 1;
      continue;
    }
    if (!knownSchemas.has(schema)) {
      checkedExamples[file] = "unknown-schema";
      reasons.push(`${schema} is not a known schema`);
      unexpectedFailureCount += 1;
      continue;
    }
    const text = readFileSync(path, "utf8");
    const digest = normalizedSha256(text);
    sha[file] = digest;
    if (expectedSha && digest !== expectedSha) {
      checkedExamples[file] = "sha256-mismatch";
      reasons.push(`${file}: sha256 does not match manifest`);
      unexpectedFailureCount += 1;
      continue;
    }
    const data = parseJsonObject(text, file);
    const validation = validateByType(data, schema);
    checkedExamples[file] = validation.valid ? "valid" : "schema-invalid";
    if (!validation.valid) {
      unexpectedFailureCount += 1;
      reasons.push(...validation.errors.map((error) => `${file}: ${error}`));
    }
  }

  for (const entry of Array.isArray(manifest.negative_examples)
    ? manifest.negative_examples
    : []) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      reasons.push("manifest negative example entry must be an object");
      unexpectedFailureCount += 1;
      continue;
    }
    const example = entry as Record<string, unknown>;
    const file = String(example.file ?? "");
    const schema = String(example.schema ?? "");
    const expectedStatus = String(example.expected_status ?? "schema-invalid");
    if (
      typeof example.file !== "string" ||
      typeof example.schema !== "string" ||
      typeof example.expected_status !== "string"
    ) {
      reasons.push(
        "manifest negative example entries require string file, schema, and expected_status",
      );
      unexpectedFailureCount += 1;
      continue;
    }
    checkedSchemas[file] = schema;
    const path = safeManifestTarget(base, file);
    let status: string;
    if (path === null) {
      status = "unsafe-path";
    } else if (!existsSync(path)) {
      status = "missing";
    } else if (!knownSchemas.has(schema)) {
      status = "unknown-schema";
    } else {
      const text = readFileSync(path, "utf8");
      if (example.sha256 && normalizedSha256(text) !== String(example.sha256)) {
        status = "sha256-mismatch";
      } else {
        try {
          const data = parseJsonObject(text, file);
          status = validateByType(data, schema).valid
            ? "valid"
            : "schema-invalid";
        } catch {
          status = "schema-invalid";
        }
      }
    }
    checkedNegativeExamples[file] = status;
    if (status === expectedStatus && status !== "valid") {
      expectedFailureCount += 1;
    } else {
      unexpectedFailureCount += 1;
      reasons.push(`${file} expected ${expectedStatus} but got ${status}`);
    }
  }

  const schemaDigestInput = {
    public_schema_count: schemaNames().length,
    schema_names: Object.fromEntries(Object.entries(checkedSchemas).sort()),
  };
  const schemaDigest = createHash("sha256")
    .update(stableCompactJson(schemaDigestInput), "utf8")
    .digest("hex");
  const uniqueReasons = [...new Set(reasons)].sort();
  const accepted =
    Object.keys(checkedExamples).length > 0 &&
    uniqueReasons.length === 0 &&
    Object.values(checkedExamples).every((status) => status === "valid");
  return {
    report_id: "pic-portability-conformance",
    manifest_path: manifestPath,
    checked_examples: checkedExamples,
    checked_negative_examples: checkedNegativeExamples,
    schema_names: checkedSchemas,
    sha256: sha,
    schema_digest: schemaDigest,
    positive_example_count: Object.keys(checkedExamples).length,
    negative_example_count: Object.keys(checkedNegativeExamples).length,
    expected_failure_count: expectedFailureCount,
    unexpected_failure_count: unexpectedFailureCount,
    semantic_invariants: Array.isArray(manifest.invariants)
      ? manifest.invariants.map(String)
      : [],
    accepted,
    operationally_usable: accepted,
    settled: false,
    reasons: uniqueReasons,
  };
}
