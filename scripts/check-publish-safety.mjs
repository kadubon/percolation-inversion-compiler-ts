import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  "$1",
);
const npmCli = process.env.npm_execpath;

function runNpm(args) {
  if (npmCli) {
    return execFileSync(process.execPath, [npmCli, ...args], {
      cwd: root,
      encoding: "utf8",
    });
  }
  return execFileSync("npm", args, {
    cwd: root,
    encoding: "utf8",
    shell: true,
  });
}

const requiredFilesEntries = [
  "dist/",
  "schemas/",
  "fixtures/portability_conformance/",
  "fixtures/python_v044_cli/",
  "fixtures/python_v044_demo/",
  "fixtures/python_v044_snapshots/",
  "fixtures/portability_conformance_v050/",
  "fixtures/python_v050_cli/",
  "fixtures/python_v050_demo/",
  "fixtures/python_v050_snapshots/",
  "examples/",
  "docs/",
  "agent-manifest.json",
  "CHANGELOG.md",
  "README.md",
  "LICENSE",
  "NOTICE",
];

const allowedPrefixes = [
  "dist/",
  "schemas/",
  "fixtures/portability_conformance/",
  "fixtures/python_v044_cli/",
  "fixtures/python_v044_demo/",
  "fixtures/python_v044_snapshots/",
  "fixtures/portability_conformance_v050/",
  "fixtures/python_v050_cli/",
  "fixtures/python_v050_demo/",
  "fixtures/python_v050_snapshots/",
  "examples/",
  "docs/",
];

const allowedExact = new Set([
  "package.json",
  "agent-manifest.json",
  "CHANGELOG.md",
  "README.md",
  "LICENSE",
  "NOTICE",
]);

const allowedSuffixes = new Set([
  ".d.ts",
  ".js",
  ".json",
  ".jsonl",
  ".md",
  ".txt",
]);

const forbiddenSuffixes = new Set([
  ".7z",
  ".bin",
  ".bz2",
  ".ckpt",
  ".gz",
  ".map",
  ".npy",
  ".npz",
  ".onnx",
  ".parquet",
  ".pdf",
  ".pem",
  ".pfx",
  ".pkl",
  ".pickle",
  ".pt",
  ".pth",
  ".rar",
  ".safetensors",
  ".tar",
  ".tex",
  ".tgz",
  ".whl",
  ".xz",
  ".zip",
  ".key",
]);

const forbiddenPathFragments = [
  ".env",
  ".git",
  ".github",
  "node_modules",
  "src/",
  "test/",
  "scripts/",
  "desktop",
  "downloads",
  "appdata",
  "temp",
  "tmp",
  "private",
  "secrets",
  "vendor",
];

const textPatterns = [
  /C:\\Users\\/i,
  /C:\/Users\//i,
  /\/mnt\/c\/Users\//i,
  /%USERPROFILE%/i,
  /%APPDATA%/i,
  /%TEMP%/i,
  /Users\/[^/\s]+\/Downloads/i,
  /Users\\[^\\\s]+\\Downloads/i,
  /\\\\[^\\\r\n]+\\[^\\\r\n]+\\Users\\/i,
  /\/home\/[^/\s]+/i,
  /AppData\\/i,
  /AppData\//i,
  /Desktop\\Downloads/i,
  /Desktop\/Downloads/i,
  /(?:^|[\s"'=:/\\])(?:tmp|temp)[/\\][A-Za-z0-9_.-]+/i,
  /npm_[A-Za-z0-9]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /(api[_-]?key|secret|password|private[_-]?key)\s*[:=]\s*['"]?[A-Za-z0-9_./+=-]{8,}/i,
  /bearer\s+[A-Za-z0-9_./+=-]{16,}/i,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/i,
];

const overclaimPatterns = [
  /\bcomplete replacement\b/i,
  /\bproves real ASI\b/i,
  /\bguarantees ASI\b/i,
  /\bsafe autonomous execution\b/i,
  /\baccepted means settled\b/i,
  /\bworkflow_usable means settled\b/i,
  /\bsafe_commands execute automatically\b/i,
];

const staleExamplePatterns = [
  /packet\*\.json/i,
  /reports\/\*\.json/i,
  /packets\/\*\.json/i,
  /--baseline earliest/i,
  /dist\\\*\.whl/i,
  /dist\\\*\.tar\.gz/i,
];

const generatedSchemaTitleAllowlist = new Set(['"title": "Proves Real Asi",']);

function overclaimScanLines(file, text) {
  return text.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim();
    return !(
      file.startsWith("schemas/") && generatedSchemaTitleAllowlist.has(trimmed)
    );
  });
}

function suffixOf(file) {
  if (file.endsWith(".d.ts")) {
    return ".d.ts";
  }
  return extname(file).toLowerCase();
}

function npmPackFiles() {
  const output = runNpm(["pack", "--dry-run", "--json", "--ignore-scripts"]);
  const parsed = JSON.parse(output);
  const entry = Array.isArray(parsed) ? parsed[0] : parsed;
  return entry.files.map((file) => file.path.replaceAll("\\", "/")).sort();
}

const failures = [];
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

for (const required of requiredFilesEntries) {
  if (!pkg.files.includes(required)) {
    failures.push(`package.json files must include ${required}`);
  }
}
if (pkg.scripts?.prepack?.includes("git ")) {
  failures.push("prepack must not run git");
}
if (pkg.main !== "./dist/index.js") {
  failures.push("package.json main must be ./dist/index.js");
}

const files = npmPackFiles();
for (const file of files) {
  const lower = file.toLowerCase();
  const suffix = suffixOf(file);
  const allowed =
    allowedExact.has(file) ||
    allowedPrefixes.some((prefix) => file.startsWith(prefix));
  if (!allowed) {
    failures.push(`${file} is not in the npm pack whitelist`);
  }
  if (!allowedSuffixes.has(suffix) && !allowedExact.has(file)) {
    failures.push(`${file} has unexpected suffix ${suffix || "(none)"}`);
  }
  if (forbiddenSuffixes.has(suffix)) {
    failures.push(`${file} uses forbidden suffix ${suffix}`);
  }
  if (forbiddenPathFragments.some((fragment) => lower.includes(fragment))) {
    failures.push(`${file} contains forbidden path fragment`);
  }
  const fullPath = join(root, file);
  if (!existsSync(fullPath)) {
    failures.push(`${file} is listed by npm pack but missing locally`);
    continue;
  }
  const maxSize = file === "schemas/bundle.schema.json" ? 8_000_000 : 2_000_000;
  if (statSync(fullPath).size > maxSize) {
    failures.push(`${file} exceeds ${maxSize} byte pack safety limit`);
  }
  if (allowedSuffixes.has(suffix) || allowedExact.has(file)) {
    const text = readFileSync(fullPath, "utf8");
    for (const pattern of textPatterns) {
      if (pattern.test(text)) {
        failures.push(`${file} matched ${pattern}`);
      }
    }
    const overclaimLines = overclaimScanLines(file, text);
    for (const [index, line] of overclaimLines.entries()) {
      for (const pattern of overclaimPatterns) {
        if (pattern.test(line)) {
          failures.push(
            `${file}:${index + 1} contains unqualified overclaim ${pattern}`,
          );
        }
      }
    }
    for (const pattern of staleExamplePatterns) {
      if (pattern.test(text)) {
        failures.push(`${file} contains stale non-portable example ${pattern}`);
      }
    }
  }
}

if (files.some((file) => file.endsWith(".map"))) {
  failures.push("npm pack must not include source maps");
}
if (!files.includes("dist/index.js") || !files.includes("dist/cli/main.js")) {
  failures.push("npm pack must include built ESM entrypoints");
}
for (const file of [
  "dist/agent/messages.js",
  "dist/agent/messages.d.ts",
  "dist/packet/index.js",
  "dist/packet/index.d.ts",
  "dist/phase_lab/index.js",
  "dist/phase_lab/index.d.ts",
  "dist/bit_engine/index.js",
  "dist/bit_engine/index.d.ts",
  "dist/sqot_controller/index.js",
  "dist/sqot_controller/index.d.ts",
  "dist/alt_lift/index.js",
  "dist/alt_lift/index.d.ts",
  "dist/trc_adapter/index.js",
  "dist/trc_adapter/index.d.ts",
  "dist/interop/ccr.js",
  "dist/interop/ccr.d.ts",
]) {
  if (!files.includes(file)) {
    failures.push(`npm pack must include ${file}`);
  }
}
if (!files.includes("schemas/bundle.schema.json")) {
  failures.push("npm pack must include canonical schema bundle");
}
if (!files.includes("fixtures/portability_conformance/manifest.json")) {
  failures.push("npm pack must include portability conformance manifest");
}
if (!files.includes("fixtures/portability_conformance_v050/manifest.json")) {
  failures.push(
    "npm pack must include v0.5.0 portability conformance manifest",
  );
}
if (!files.includes("fixtures/python_v044_demo/runtime_state.json")) {
  failures.push("npm pack must include Python-free runtime demo state");
}
if (!files.includes("fixtures/python_v044_demo/asi_proxy_phase_request.json")) {
  failures.push("npm pack must include Node-only ASI-proxy phase request demo");
}
if (!files.includes("examples/phase_lab/runtime_report_1.json")) {
  failures.push("npm pack must include v0.5.0 phase lab example inputs");
}
if (!files.includes("examples/thresholds/asi_proxy_development.json")) {
  failures.push("npm pack must include v0.5.0 threshold example");
}
if (!files.includes("docs/cli-reference.md")) {
  failures.push("npm pack must include CLI reference docs");
}
for (const file of [
  "docs/effective-packet-graph.md",
  "docs/bit-inversion-engine.md",
  "docs/sqot-queue-sovereignty.md",
  "docs/alt-ecpt-lift.md",
  "docs/trc-trace-adapter.md",
  "docs/threshold-certificates.md",
]) {
  if (!files.includes(file)) {
    failures.push(`npm pack must include ${file}`);
  }
}
if (!files.includes("agent-manifest.json")) {
  failures.push("npm pack must include agent manifest");
}
if (!files.includes("schemas/index.json")) {
  failures.push("npm pack must include schema index");
}
if (!files.includes("schemas/interop/ccr_task.schema.json")) {
  failures.push("npm pack must include v0.6.0 CCR task interop schema");
}
if (!files.includes("schemas/interop/ccr_residual.schema.json")) {
  failures.push("npm pack must include v0.6.0 CCR residual interop schema");
}
if (
  !files.includes("examples/asi_proxy_benchmark_bundle/trc_agent_trace.json")
) {
  failures.push("npm pack must include v0.6.0 ASI-proxy TRC trace fixture");
}
if (!files.includes("examples/interop/ccr_tasks.example.jsonl")) {
  failures.push("npm pack must include v0.6.0 CCR task JSONL example");
}
for (const file of [
  "docs/ccr-pic-roundtrip.md",
  "docs/asi-proxy-acceleration.md",
  "docs/interop/ccr.md",
  "docs/v060-audit.md",
]) {
  if (!files.includes(file)) {
    failures.push(`npm pack must include ${file}`);
  }
}
if (!files.includes("fixtures/python_v050_snapshots/manifest.json")) {
  failures.push("npm pack must include v0.5.0 Python snapshot fixtures");
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({ checked_pack_files: files.length }, null, 2));
