import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import Ajv2020Module from "ajv/dist/2020.js";
import { parseJsonObject, stableStringify } from "../core/json.js";
import { schemaDir } from "./paths.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const PUBLIC_SCHEMA_NAME = /^[A-Za-z][A-Za-z0-9]*$/;

function assertSchemaTypeName(typeName: string): void {
  if (!PUBLIC_SCHEMA_NAME.test(typeName)) {
    throw new Error(`unknown schema type ${JSON.stringify(typeName)}`);
  }
}

function schemaPath(typeName: string): string {
  assertSchemaTypeName(typeName);
  return join(schemaDir(), `${typeName}.schema.json`);
}

function schemaFileNames(): string[] {
  return readdirSync(schemaDir())
    .filter(
      (name) => name.endsWith(".schema.json") && name !== "bundle.schema.json",
    )
    .sort();
}

export function schemaNames(): string[] {
  return schemaFileNames()
    .map((name) => name.slice(0, -".schema.json".length))
    .filter((name) => PUBLIC_SCHEMA_NAME.test(name))
    .sort();
}

export function schemaByType(typeName = "Registry"): Record<string, unknown> {
  const path = schemaPath(typeName);
  if (!existsSync(path)) {
    throw new Error(`unknown schema type ${JSON.stringify(typeName)}`);
  }
  return parseJsonObject(readFileSync(path, "utf8"), `${typeName} schema`);
}

export function schemaBundle(): {
  bundle_id: string;
  schemas: Record<string, Record<string, unknown>>;
} {
  const bundlePath = join(schemaDir(), "bundle.schema.json");
  if (existsSync(bundlePath)) {
    const bundle = parseJsonObject(
      readFileSync(bundlePath, "utf8"),
      "schema bundle",
    );
    if (
      bundle.bundle_id &&
      bundle.schemas &&
      typeof bundle.schemas === "object" &&
      !Array.isArray(bundle.schemas)
    ) {
      return bundle as {
        bundle_id: string;
        schemas: Record<string, Record<string, unknown>>;
      };
    }
  }
  const schemas: Record<string, Record<string, unknown>> = {};
  for (const name of schemaNames()) {
    schemas[name] = schemaByType(name);
  }
  return {
    bundle_id: "percolation-inversion-compiler-portability",
    schemas,
  };
}

export function validateData(
  data: unknown,
  schema: Record<string, unknown>,
): ValidationResult {
  const Ajv2020 = Ajv2020Module as unknown as new (options: {
    allErrors: boolean;
    strict: boolean;
  }) => {
    compile: (schema: Record<string, unknown>) => {
      (data: unknown): boolean;
      errors?: Array<{ instancePath?: string; message?: string }>;
    };
  };
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const valid = Boolean(validate(data));
  return {
    valid,
    errors: valid
      ? []
      : (validate.errors ?? []).map(
          (error: { instancePath?: string; message?: string }) =>
            `${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
        ),
  };
}

export function validateByType(
  data: unknown,
  typeName: string,
): ValidationResult {
  return validateData(data, schemaByType(typeName));
}

export function writeSchema(typeName: string, outputPath: string): void {
  writeFileSync(outputPath, stableStringify(schemaByType(typeName)), "utf8");
}

export function writeAllSchemas(outputDir: string): string[] {
  mkdirSync(outputDir, { recursive: true });
  const written: string[] = [];
  const files = [
    ...schemaFileNames(),
    "bundle.schema.json",
    "schema-digest.json",
  ];
  for (const file of files) {
    const source = join(schemaDir(), file);
    if (!existsSync(source)) {
      continue;
    }
    const target = join(outputDir, file);
    cpSync(source, target);
    written.push(basename(target));
  }
  const interopSource = join(schemaDir(), "interop");
  if (existsSync(interopSource)) {
    cpSync(interopSource, join(outputDir, "interop"), { recursive: true });
    written.push("interop/");
  }
  return written.sort();
}
