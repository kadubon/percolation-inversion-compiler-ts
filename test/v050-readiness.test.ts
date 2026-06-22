import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { schemaByType } from "../src/io/schema.js";
import { packageRoot } from "../src/io/paths.js";

const REQUIRED_V050_SCHEMA_NAMES = [
  "EffectivePacketGraph",
  "EffectivePacketNode",
  "EffectivePacketEdge",
  "EffectivePacketGraphBuildReport",
  "EffectivePacketEligibility",
  "PacketContributionStatus",
  "SemanticEdgeEvidence",
  "EffectiveGraphResidualSummary",
  "PhaseWindow",
  "PhaseWindowObservation",
  "PhaseWindowComparison",
  "PhaseThresholdStatus",
  "PhaseComponentObservation",
  "VerificationThroughputWindow",
  "FalseLiquidityLoad",
  "WasteLoad",
  "SalienceObstructionLoad",
  "BasinReachabilityProxy",
  "AutocatalyticClosureWitness",
  "ProductiveClosureWitness",
  "ExecutableClosureWitness",
  "ClosureSupportHyperpath",
  "ClosureDefect",
  "ClosureCertificateCandidate",
  "ClosureAbstentionReason",
  "ExecutionAvailableHyperpath",
  "ExecutionPathWitness",
  "ExecutionPathDefect",
  "ExecutablePathDensityReport",
  "ReceiverContextSupport",
  "ActionBoundaryRequirement",
  "ExecutionAuthorityStatus",
  "CapabilityExpressionPath",
  "BottleneckClassDiagnosis",
  "MinimalEnablingCondition",
  "BottleneckInversionCandidate",
  "InversionCertificate",
  "ActivationGainEstimate",
  "PostInversionAuditPlan",
  "RollbackOrDeactivationPlan",
  "BottleneckInversionReport",
  "QueueOccupationReport",
  "SalienceObstructionDiagnosis",
  "DiagnosticReserveReport",
  "QueueRebalancePlan",
  "PacketQuarantineDecision",
  "ReversibleSalienceSovereigntyCertificate",
  "AttentionBudgetLedger",
  "VerificationQueuePressure",
  "AltEcptLiftReport",
  "ReceiverLiquidityLift",
  "CrossContextTransferWitness",
  "DownstreamSearchCostDelta",
  "CapitalToPathContribution",
  "LiquidityToClosureContribution",
  "AltLiftBlocker",
  "TypedAgentTrace",
  "TypedToolCallTrace",
  "TypedActionBoundary",
  "TraceNormalForm",
  "TraceToleranceLedger",
  "TraceFrontierDebt",
  "TraceAdapterReport",
  "PhaseLabStoreManifest",
  "PhaseLabEvent",
  "PhaseLabWindowIndex",
  "PhaseLabIngestReport",
  "PhaseLabExportManifest",
  "ASIProxyThresholdSpec",
  "ASIProxyThresholdStatus",
  "CollectivePhaseCertificateCandidate",
  "CollectivePhaseAbstentionReport",
  "PhaseCertificateDefect",
];

function pic(args: string[]): Record<string, unknown> {
  const stdout = execFileSync(
    process.execPath,
    [join(packageRoot(), "dist", "cli", "main.js"), ...args],
    { cwd: packageRoot(), encoding: "utf8" },
  );
  return JSON.parse(stdout) as Record<string, unknown>;
}

function runPic(args: string[]): string {
  return execFileSync(
    process.execPath,
    [join(packageRoot(), "dist", "cli", "main.js"), ...args],
    { cwd: packageRoot(), encoding: "utf8" },
  );
}

describe("v0.5.0 release readiness", () => {
  it("exports Python v0.5.0 public schemas by type and with --all", () => {
    const out = mkdtempSync(join(tmpdir(), "pic-ts-schemas-"));
    for (const name of REQUIRED_V050_SCHEMA_NAMES) {
      expect(schemaByType(name).title).toBe(name);
      expect(pic(["schema", "--type", name]).title).toBe(name);
    }
    runPic(["schema", "--all", "--output-dir", out]);
    for (const name of REQUIRED_V050_SCHEMA_NAMES) {
      expect(existsSync(join(out, `${name}.schema.json`))).toBe(true);
    }
    expect(existsSync(join(out, "bundle.schema.json"))).toBe(true);
    expect(existsSync(join(out, "schema-digest.json"))).toBe(true);
  }, 60_000);

  it("runs the full Phase Lab output-path matrix with explicit JSON paths", () => {
    const dir = mkdtempSync(join(tmpdir(), "pic-ts-v050-lab-"));
    const store = join(dir, "phase-lab");
    const observation = join(dir, "observation.json");
    const graph = join(dir, "effective_graph.json");
    const closure = join(dir, "closure.json");
    const paths = join(dir, "paths.json");
    const thresholdStatus = join(dir, "threshold_status.json");
    const certificate = join(dir, "certificate.json");
    const exportDir = join(dir, "export");

    pic(["phase", "lab", "init", "--output-dir", store]);
    const ingest = pic([
      "phase",
      "lab",
      "ingest",
      "--store",
      store,
      "--report",
      "examples/phase_lab/runtime_report_1.json",
      "examples/phase_lab/runtime_report_2.json",
    ]);
    expect(ingest.ingested_events).toHaveLength(2);
    expect(
      pic(["phase", "lab", "list-windows", "--store", store]).settled,
    ).toBe(false);

    runPic([
      "phase",
      "lab",
      "observe",
      "--store",
      store,
      "--window",
      "latest",
      "--output",
      observation,
    ]);
    runPic(["phase", "lab", "graph", "--store", store, "--output", graph]);
    runPic(["phase", "lab", "closure", "--store", store, "--output", closure]);
    runPic([
      "phase",
      "lab",
      "executable-paths",
      "--store",
      store,
      "--output",
      paths,
    ]);
    runPic([
      "phase",
      "lab",
      "threshold-status",
      "--store",
      store,
      "--threshold",
      "examples/thresholds/asi_proxy_development.json",
      "--output",
      thresholdStatus,
    ]);
    runPic([
      "phase",
      "lab",
      "certify",
      "--store",
      store,
      "--threshold",
      "examples/thresholds/asi_proxy_development.json",
      "--output",
      certificate,
    ]);
    const comparison = pic([
      "phase",
      "lab",
      "compare-window",
      "--store",
      store,
      "--baseline",
      "previous",
      "--candidate",
      "latest",
    ]);
    const exported = pic([
      "phase",
      "lab",
      "export",
      "--store",
      store,
      "--output-dir",
      exportDir,
    ]);

    for (const file of [
      observation,
      graph,
      closure,
      paths,
      thresholdStatus,
      certificate,
    ]) {
      const data = JSON.parse(readFileSync(file, "utf8")) as Record<
        string,
        unknown
      >;
      expect(data.settled).toBe(false);
      expect(JSON.stringify(data)).not.toContain(packageRoot());
    }
    expect(comparison.settled).toBe(false);
    expect(exported.settled).toBe(false);
  });

  it("runs v0.5.0 diagnostic command matrix without execution authority", () => {
    const dir = mkdtempSync(join(tmpdir(), "pic-ts-v050-cli-"));
    const graph = join(dir, "graph.json");
    const bottlenecks = join(dir, "bottlenecks.json");
    const inversions = join(dir, "inversions.json");
    runPic([
      "ecology",
      "effective-graph",
      "--reports",
      "examples/phase_lab/runtime_report_1.json",
      "--reports",
      "examples/phase_lab/runtime_report_2.json",
      "--output",
      graph,
    ]);
    expect(
      pic(["ecology", "execution-available-paths", "--graph", graph])
        .execution_authority_granted,
    ).toBe(false);
    runPic(["bit", "diagnose", "--graph", graph, "--output", bottlenecks]);
    runPic([
      "bit",
      "invert",
      "--bottlenecks",
      bottlenecks,
      "--output",
      inversions,
    ]);
    expect(pic(["bit", "certificate", "--candidate", inversions]).settled).toBe(
      false,
    );
    expect(
      pic([
        "bit",
        "mec",
        "--bottlenecks",
        bottlenecks,
        "--bottleneck",
        "bottleneck:missing",
      ]).minimal_enabling_conditions,
    ).toBeTruthy();
    expect(
      pic([
        "bit",
        "compare-baseline",
        "--baseline",
        "examples/phase_lab/phase_window_observation.example.json",
        "--candidate",
        "examples/phase_lab/phase_window_observation.example.json",
      ]).settled,
    ).toBe(false);
    for (const command of [
      "diagnose-queue",
      "salience-obstruction",
      "rebalance",
      "quarantine",
      "reserve-check",
    ]) {
      expect(pic(["sqot", command, "--graph", graph]).settled).toBe(false);
    }
    expect(
      pic([
        "alt",
        "receiver-lift",
        "--packet",
        "examples/packet_exchange/packet_envelope.example.json",
        "--receiver-context",
        "examples/packet_exchange/packet_envelope.example.json",
      ]).settled,
    ).toBe(false);
    expect(
      pic([
        "alt",
        "liquidity-to-paths",
        "--packet",
        "examples/packet_exchange/packet_envelope.example.json",
        "--graph",
        graph,
      ]).settled,
    ).toBe(false);
    expect(
      pic([
        "alt",
        "capital-impact",
        "--reports",
        "examples/alt_lift/alt_ecpt_lift.example.json",
      ]).settled,
    ).toBe(false);
    for (const args of [
      [
        "trc",
        "trace-adapter",
        "--input",
        "examples/trc_adapter/tool_trace_input.example.json",
      ],
      [
        "trc",
        "tool-trace",
        "--events",
        "examples/trc_adapter/tool_trace_input.example.json",
      ],
      [
        "trc",
        "action-boundary",
        "--report",
        "fixtures/python_v044_demo/runtime_step_report.json",
      ],
    ]) {
      const data = pic(args);
      expect(data.executed_action_count).toBe(0);
      expect(data.execution_authority_granted).toBe(false);
      expect(data.settled).toBe(false);
    }
  });

  it("keeps demo guidance wildcard-free and includes Phase Lab commands", () => {
    for (const args of [
      ["demo", "installed-smoke", "--profile", "development"],
      [
        "demo",
        "bootstrap",
        "--output-dir",
        mkdtempSync(join(tmpdir(), "pic-ts-demo-")),
        "--overwrite",
      ],
    ]) {
      const data = pic(args);
      const joined = JSON.stringify(data);
      expect(joined).not.toMatch(
        /packet\*\.json|reports\/\*\.json|packets\/\*\.json/,
      );
      for (const command of [
        "phase lab observe",
        "phase lab graph",
        "phase lab closure",
        "phase lab executable-paths",
        "phase lab certify",
      ]) {
        expect(joined).toContain(command);
      }
    }
  });
});
