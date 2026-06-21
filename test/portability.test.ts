import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lfNormalize } from "../src/core/json.js";
import { fixtureDir } from "../src/io/paths.js";
import { verifyPortabilityManifest } from "../src/io/portability.js";
import { schemaByType, schemaNames, validateByType } from "../src/io/schema.js";

describe("canonical portability conformance pack", () => {
  const manifestPath = join(fixtureDir(), "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    examples: Array<{ file: string; schema: string; sha256: string }>;
    negative_examples: Array<{
      file: string;
      schema: string;
      expected_status: string;
    }>;
  };

  it("validates positive and negative examples with Python v0.4.4 schemas", () => {
    const report = verifyPortabilityManifest(manifestPath);
    expect(report.accepted).toBe(true);
    expect(report.settled).toBe(false);
    expect(report.positive_example_count).toBe(15);
    expect(report.negative_example_count).toBe(4);
    expect(report.expected_failure_count).toBe(4);
    expect(report.unexpected_failure_count).toBe(0);
    expect(
      Object.values(report.checked_examples).every(
        (status) => status === "valid",
      ),
    ).toBe(true);
    expect(Object.keys(report.schema_names)).toHaveLength(19);
  });

  it("keeps LF-normalized fixture checksums stable", () => {
    for (const example of manifest.examples) {
      const text = readFileSync(join(fixtureDir(), example.file), "utf8");
      const digest = createHash("sha256")
        .update(lfNormalize(text), "utf8")
        .digest("hex");
      expect(digest, example.file).toBe(example.sha256);
    }
  });

  it("loads named schemas and validates representative examples", () => {
    expect(schemaNames()).toContain("PhaseAccelerationPlan");
    expect(schemaNames()).not.toContain("bundle");
    expect(schemaByType("AgentCheckReport").title).toBe("AgentCheckReport");
    for (const example of manifest.examples.slice(0, 6)) {
      const data = JSON.parse(
        readFileSync(join(fixtureDir(), example.file), "utf8"),
      );
      expect(validateByType(data, example.schema).valid, example.file).toBe(
        true,
      );
    }
  });

  it("ships only JSON fixtures inside the conformance tree", () => {
    const names = readdirSync(fixtureDir(), { recursive: true }).map(String);
    expect(
      names.some((name) => name.endsWith(".pdf") || name.endsWith(".tex")),
    ).toBe(false);
  });
});
