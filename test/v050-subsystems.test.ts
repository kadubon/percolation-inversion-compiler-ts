import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stableStringify } from "../src/core/json.js";
import { packageRoot } from "../src/io/paths.js";
import { validateByType } from "../src/io/schema.js";
import {
  buildEffectivePacketGraph,
  detectAutocatalyticClosure,
  detectExecutionAvailablePaths,
  observePhaseWindow,
} from "../src/phase_lab/index.js";

function cli(args: string[]): Record<string, unknown> {
  const stdout = execFileSync(
    process.execPath,
    [join(packageRoot(), "dist", "cli", "main.js"), ...args],
    { cwd: packageRoot(), encoding: "utf8" },
  );
  return JSON.parse(stdout) as Record<string, unknown>;
}

function cliText(args: string[]): string {
  return execFileSync(
    process.execPath,
    [join(packageRoot(), "dist", "cli", "main.js"), ...args],
    { cwd: packageRoot(), encoding: "utf8" },
  );
}

function cliFailure(args: string[]): { status: number; stderr: string } {
  try {
    execFileSync(
      process.execPath,
      [join(packageRoot(), "dist", "cli", "main.js"), ...args],
      {
        cwd: packageRoot(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    throw new Error(`expected CLI failure: ${args.join(" ")}`);
  } catch (error) {
    const err = error as { status?: number; stderr?: string | Buffer };
    return {
      status: Number(err.status ?? 1),
      stderr: String(err.stderr ?? ""),
    };
  }
}

function json(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

const exampleSchemas: Array<[string, string]> = [
  ["examples/phase_lab/effective_graph.example.json", "EffectivePacketGraph"],
  [
    "examples/phase_lab/phase_window_observation.example.json",
    "PhaseWindowObservation",
  ],
  [
    "examples/phase_lab/closure_report.example.json",
    "AutocatalyticClosureReport",
  ],
  [
    "examples/phase_lab/executable_paths.example.json",
    "ExecutablePathDensityReport",
  ],
  [
    "examples/phase_lab/threshold_status.example.json",
    "ASIProxyThresholdStatus",
  ],
  [
    "examples/phase_lab/certificate_abstain.example.json",
    "CollectivePhaseCertificateCandidate",
  ],
  ["examples/bit_engine/bottlenecks.example.json", "BottleneckInversionReport"],
  [
    "examples/sqot_controller/queue_report.example.json",
    "QueueOccupationReport",
  ],
  ["examples/alt_lift/alt_ecpt_lift.example.json", "AltEcptLiftReport"],
  ["examples/trc_adapter/typed_trace.example.json", "TraceAdapterReport"],
];

describe("v0.5.0 subsystem hardening", () => {
  it("records schema provenance and validates v0.5.0 examples", () => {
    const index = json(join(packageRoot(), "schemas", "index.json"));
    expect(index.generated_from).toBe("percolation-inversion-compiler==0.5.0");
    expect(index.generation_command).toBe(
      "pic schema --all --output-dir <schema-output-dir>",
    );
    expect(index.digest_reference).toBe("schema-digest.json");
    expect(index.schema_count).toBeGreaterThan(300);

    for (const [file, schema] of exampleSchemas) {
      const data = json(join(packageRoot(), file));
      const result = validateByType(data, schema);
      expect(result.valid, `${file} validates as ${schema}`).toBe(true);
    }
  });

  it("matches Python v0.5.0 snapshot golden JSON exactly", () => {
    const manifest = json(
      join(packageRoot(), "fixtures", "python_v050_snapshots", "manifest.json"),
    ) as { exact_parity_files?: string[] };
    expect(manifest.exact_parity_files?.length).toBe(12);
    for (const file of manifest.exact_parity_files ?? []) {
      const expected = json(
        join(packageRoot(), "fixtures", "python_v050_snapshots", file),
      );
      const match = file.match(/^snapshot_(show|verify)_([a-z]+)\.json$/);
      const actual =
        file === "snapshot_list.json"
          ? cli(["snapshot", "list"])
          : file === "snapshot_routes.json"
            ? cli(["snapshot", "routes"])
            : match
              ? cli(["snapshot", match[1] ?? "", "--artifact", match[2] ?? ""])
              : null;
      expect(actual, file).toEqual(expected);
    }
  });

  it("separates accepted packets from candidate-only volume in graph metrics", () => {
    const accepted = {
      accepted: true,
      report_id: "accepted-report",
      residual_ledger: { coordinates: {} },
      settled: false,
      workflow_usable: true,
    };
    const candidate = {
      accepted: true,
      candidate_only_reasons: ["external intake is candidate-only"],
      report_id: "candidate-report",
      residual_ledger: { coordinates: {} },
      settled: false,
      workflow_usable: true,
    };
    const graph = buildEffectivePacketGraph([accepted, candidate]);
    expect(graph.accepted_packet_capital).toBe(1);
    expect(graph.candidate_only_packets).toBe(1);
    expect(graph.non_contributing_volume).toBe(1);
    expect(graph.settled).toBe(false);

    const observation = observePhaseWindow(
      { event_count: 2, event_ids: [], sequence: 0, window_id: "adhoc" },
      [accepted, candidate],
      graph,
    );
    expect(observation.packet_candidate_count).toBe(2);
    expect(observation.effective_node_count).toBe(1);
    expect(observation.raw_external_volume_diagnostic_only).toBe(true);
    expect(observation.settled).toBe(false);
  });

  it("keeps closure and executable paths diagnostic without edge evidence", () => {
    const graph = buildEffectivePacketGraph([
      {
        accepted: true,
        report_id: "edge-free-report",
        residual_ledger: { coordinates: {} },
        settled: false,
        workflow_usable: true,
      },
    ]);
    const closure = detectAutocatalyticClosure(graph);
    expect(closure.accepted).toBe(false);
    expect(closure.settled).toBe(false);
    expect(
      (closure.certificate_candidate as Record<string, unknown>)
        .certificate_status,
    ).toBe("abstain");

    const paths = detectExecutionAvailablePaths(graph);
    expect(paths.executed_path_count).toBe(0);
    expect(paths.execution_authority_granted).toBe(false);
    expect(paths.settled).toBe(false);
  });

  it("runs Phase Lab directory ingest, output files, YAML fail-closed, and basename source storage", () => {
    const dir = mkdtempSync(join(tmpdir(), "pic-ts-v050-phase-lab-"));
    const reports = join(dir, "reports");
    const store = join(dir, "store");
    const out = join(dir, "out");
    const report1 = json(
      join(packageRoot(), "examples", "phase_lab", "runtime_report_1.json"),
    );
    const report2 = json(
      join(packageRoot(), "examples", "phase_lab", "runtime_report_2.json"),
    );
    writeFileSync(join(dir, "bad.yaml"), "accepted: true\n", "utf8");
    mkdirSync(reports);
    writeFileSync(join(reports, "report-a.json"), stableStringify(report1));
    writeFileSync(join(reports, "report-b.json"), stableStringify(report2));

    expect(cli(["phase", "lab", "init", "--output-dir", store]).settled).toBe(
      false,
    );
    const ingest = cli([
      "phase",
      "lab",
      "ingest",
      "--store",
      store,
      "--directory",
      reports,
    ]);
    expect(ingest.ingested_events).toHaveLength(2);
    expect(JSON.stringify(ingest)).not.toContain(packageRoot());

    const events = readFileSync(join(store, "events.jsonl"), "utf8")
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events.map((event) => event.source_path).sort()).toEqual([
      "report-a.json",
      "report-b.json",
    ]);

    for (const [name, args] of Object.entries({
      windows: ["phase", "lab", "list-windows", "--store", store],
      observe: ["phase", "lab", "observe", "--store", store],
      graph: ["phase", "lab", "graph", "--store", store],
      closure: ["phase", "lab", "closure", "--store", store],
      paths: ["phase", "lab", "executable-paths", "--store", store],
      threshold: [
        "phase",
        "lab",
        "threshold-status",
        "--store",
        store,
        "--threshold",
        "examples/thresholds/asi_proxy_development.json",
      ],
      certify: [
        "phase",
        "lab",
        "certify",
        "--store",
        store,
        "--threshold",
        "examples/thresholds/asi_proxy_development.json",
      ],
      compare: [
        "phase",
        "lab",
        "compare-window",
        "--store",
        store,
        "--baseline",
        "previous",
        "--candidate",
        "latest",
      ],
    })) {
      const output = join(out, `${name}.json`);
      expect(cliText([...args, "--output", output]), name).toBe("");
      expect(existsSync(output), name).toBe(true);
      expect(json(output).settled, name).toBe(false);
    }

    const exportReport = cli([
      "phase",
      "lab",
      "export",
      "--store",
      store,
      "--output-dir",
      join(out, "export"),
    ]);
    expect(exportReport.absolute_paths_sanitized).toBe(true);
    expect(readdirSync(join(out, "export")).sort()).toEqual(
      expect.arrayContaining(["events.json", "manifest.json", "windows.json"]),
    );

    const failure = cliFailure([
      "phase",
      "lab",
      "ingest",
      "--store",
      store,
      "--report",
      join(dir, "bad.yaml"),
    ]);
    expect(failure.status).not.toBe(0);
    expect(failure.stderr).toContain("YAML input is not enabled");
  });

  it("reports command-like packet and trace strings without execution", () => {
    const dir = mkdtempSync(join(tmpdir(), "pic-ts-v050-inert-"));
    const report = json(
      join(
        packageRoot(),
        "fixtures",
        "python_v044_demo",
        "runtime_step_report.json",
      ),
    );
    report.command_like_text =
      "npm install && npx task && node script.js && docker run image && kubectl get pods && curl URL && bash run.sh && powershell command";
    const reportPath = join(dir, "runtime-report.json");
    const packetPath = join(dir, "packet.json");
    writeFileSync(reportPath, stableStringify(report));
    expect(
      cliText([
        "packet",
        "export",
        "--report",
        reportPath,
        "--output",
        packetPath,
      ]),
    ).toBe("");
    const inspect = cli(["packet", "inspect", "--packet", packetPath]);
    expect(inspect.executed_command_count).toBe(0);
    expect(inspect.settled).toBe(false);
    expect(JSON.stringify(inspect.embedded_command_like_values)).toContain(
      "npm install",
    );
    expect(JSON.stringify(inspect.embedded_command_like_values)).toContain(
      "kubectl",
    );

    const tracePath = join(dir, "trace.json");
    writeFileSync(
      tracePath,
      stableStringify({
        tool_calls: [
          {
            name: "npm install inert && docker run inert && kubectl get pods",
          },
        ],
      }),
    );
    const trace = cli(["trc", "trace-adapter", "--input", tracePath]);
    expect(trace.executed_action_count).toBe(0);
    expect(trace.execution_authority_granted).toBe(false);
    expect(trace.settled).toBe(false);
  });

  it("documents installed-safe quick start, canonical Python, and new subsystem pages", () => {
    const readme = readFileSync(join(packageRoot(), "README.md"), "utf8");
    expect(readme).toContain(
      "npx pic-ts demo bootstrap --output-dir .pic-demo --overwrite",
    );
    expect(readme).toContain(
      "npx pic-ts runtime step --state .pic-demo/runtime_state.json --input .pic-demo/runtime_step_input.json",
    );
    expect(readme).toContain(
      "npx pic-ts alt ecpt-lift --packets examples/alt_lift/alt_ecpt_lift.example.json",
    );
    expect(readme).toContain("Python package remains the canonical");
    expect(readme).toContain(
      "`pic-ts`: recommended for npm and Node.js projects.",
    );
    expect(readme).toContain("do not depend on a cloned repository");
    for (const doc of [
      "effective-packet-graph.md",
      "bit-inversion-engine.md",
      "sqot-queue-sovereignty.md",
      "alt-ecpt-lift.md",
      "trc-trace-adapter.md",
      "threshold-certificates.md",
    ]) {
      const text = readFileSync(join(packageRoot(), "docs", doc), "utf8");
      expect(text).toContain("pic-ts");
      expect(text).toContain("percolation-inversion-compiler==0.5.0");
      expect(text).toMatch(
        /settled=false|does not imply settlement|does not settle/i,
      );
    }

    const audit = readFileSync(
      join(packageRoot(), "docs", "v050-audit.md"),
      "utf8",
    );
    expect(audit).toContain("Theory Boundary");
    expect(audit).toContain(
      "Phase Lab storage layer is intentionally different",
    );
    expect(audit).toContain("fixtures/python_v050_snapshots/manifest.json");
    expect(audit).toContain("fixtures/python_v050_cli/manifest.json");
    expect(audit).toContain("PIC-TS is a TypeScript-compatible port");
    expect(audit).toContain("execution counters stay at zero");
  });

  it("keeps v0.5.0 CLI reference manifest explicit about non-exact routes", () => {
    const manifest = json(
      join(packageRoot(), "fixtures", "python_v050_cli", "manifest.json"),
    ) as {
      exact_parity_files?: string[];
      safe_diagnostic_compatibility_files?: string[];
      safety_contract?: Record<string, unknown>;
    };
    expect(manifest.exact_parity_files).toEqual([]);
    expect(manifest.safe_diagnostic_compatibility_files).toContain(
      "phase_lab_graph.json",
    );
    expect(manifest.safe_diagnostic_compatibility_files).toContain(
      "trc_trace_adapter.json",
    );
    expect(manifest.safety_contract?.settled).toBe(false);
    expect(manifest.safety_contract?.execution_authority_granted).toBe(false);
  });
});
