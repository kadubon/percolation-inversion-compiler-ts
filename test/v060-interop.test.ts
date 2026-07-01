import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stableStringify } from "../src/core/json.js";
import { packageRoot } from "../src/io/paths.js";
import {
  altEcptBridgeReport,
  bitRegistryReport,
  bitTasksFromRegistry,
  ccrTasksFromPhasePlan,
  diagnoseSqotQueueState,
  operationGateReport,
  traceCheckReport,
  traceNormalFormReport,
  tracePacketCandidate,
} from "../src/interop/ccr.js";
import { buildPhaseAccelerationPlan } from "../src/phase/index.js";

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

function jsonl(text: string): Array<Record<string, unknown>> {
  return text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function json(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("v0.6.0 CCR interop and TRC operation readiness", () => {
  it("emits CCR tasks and residuals from phase plans without authority", () => {
    const plan = buildPhaseAccelerationPlan({ compact: true });
    const tasks = ccrTasksFromPhasePlan(plan);
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks[0]?.schema_version).toBe("ccr.task.v0.1");
    expect(tasks.every((task) => task.status === "open")).toBe(true);
    expect(
      tasks.every(
        (task) =>
          (task.constraints as Record<string, unknown>).authority_policy ===
            "read_only" &&
          (
            (task.constraints as Record<string, unknown>)
              .allowed_commands as unknown[]
          ).length === 0,
      ),
    ).toBe(true);

    const taskLines = jsonl(
      cliText(["phase", "plan", "--compact", "--emit", "ccr-tasks"]),
    );
    const residualLines = jsonl(
      cliText(["phase", "gap", "--compact", "--emit", "ccr-residuals"]),
    );
    expect(taskLines.length).toBeGreaterThan(0);
    expect(residualLines.length).toBeGreaterThan(0);
    expect(taskLines[0]?.schema_version).toBe("ccr.task.v0.1");
    expect(residualLines[0]?.schema_version).toBe("ccr.residual.v0.1");
  });

  it("checks TRC operation readiness while keeping execution false", () => {
    const normalized = traceNormalFormReport({
      operation_evaluation_clock: "2026-07-01T00:00:00Z",
      trace_id: "trace:operation",
      steps: [
        {
          authority_envelope: {
            expires_at: "2099-01-01T00:00:00Z",
            issuer: "operator:test",
            scopes: ["local-test", "environment:local-test"],
            status: "approved",
          },
          causal_schedule_block: { block_id: "schedule:test" },
          evidence_refs: ["evidence:fixture"],
          output_ref: "provider-plan:test",
          resource_ledger: { provider_calls: 0 },
          rollback_escrow_obligation: { rollback: "discard plan" },
          step_id: "s1",
          tolerance_ledger: { observation_error: 0 },
          tool: "ccr.operation.plan",
          validity_domain: { environment: "local-test" },
        },
      ],
    });
    const checked = traceCheckReport(normalized);
    const packet = tracePacketCandidate(normalized);

    expect(checked.execution_available).toBe(true);
    expect(
      (checked.real_world_operation_gate as Record<string, unknown>)
        .operation_ready,
    ).toBe(true);
    expect(
      (checked.real_world_operation_gate as Record<string, unknown>).executed,
    ).toBe(false);
    expect(checked.settled).toBe(false);
    expect(packet.settled).toBe(false);

    const dir = mkdtempSync(join(tmpdir(), "pic-ts-v060-trc-"));
    const traceNf = join(dir, "trace_nf.json");
    cliText([
      "trc",
      "trace-normalize",
      "--input",
      "examples/asi_proxy_benchmark_bundle/trc_agent_trace.json",
      "--output",
      traceNf,
    ]);
    const report = cli(["trc", "trace-check", "--trace", traceNf]);
    expect(report.execution_available).toBe(false);
    expect(
      (report.real_world_operation_gate as Record<string, unknown>)
        .operation_ready,
    ).toBe(false);
    expect(report.execution_blockers).toContain(
      "fixture_only_authority_non_executable",
    );
  });

  it("separates operation gates from dispatch and blocks expired authority", () => {
    const expired = traceNormalFormReport({
      operation_evaluation_clock: "2026-07-01T00:00:00Z",
      trace_id: "trace:expired-authority",
      steps: [
        {
          authority_envelope: {
            expires_at: "1970-01-01T00:00:00Z",
            issuer: "operator:test",
            scopes: ["local-test", "environment:local-test"],
            status: "approved",
          },
          causal_schedule_block: { block_id: "schedule:test" },
          certificate_version_refs: ["cert:test:v1"],
          evidence_refs: ["evidence:fixture"],
          hazard_envelope: { hazard_refs: ["hazard:test"] },
          resource_ledger: { budget: 1, units: "fixture" },
          rollback_escrow_obligation: { rollback: "delete fixture output" },
          step_id: "s1",
          tolerance_ledger: { observation_error: 0 },
          tool: "fixture-provider",
          validity_domain: { environment: "local-test" },
        },
      ],
    });
    const expiredGate = operationGateReport(expired);
    expect(expiredGate.operation_ready).toBe(false);
    expect(expiredGate.execution_blockers).toContain(
      "expired_authority_envelope",
    );

    const fresh = traceNormalFormReport({
      operation_evaluation_clock: "2026-07-01T00:00:00Z",
      provider_target: "fixture-provider",
      side_effect_policy: "provider_webhook_allowed",
      trace_id: "trace:fresh-authority",
      steps: [
        {
          authority_envelope: {
            expires_at: "2099-01-01T00:00:00Z",
            issuer: "operator:test",
            scopes: [
              "local-test",
              "environment:local-test",
              "fixture-provider",
            ],
            status: "approved",
          },
          causal_schedule_block: { block_id: "schedule:test" },
          certificate_version_refs: ["cert:test:v1"],
          evidence_refs: ["evidence:fixture"],
          hazard_envelope: { hazard_refs: ["hazard:test"] },
          resource_ledger: { budget: 1, units: "fixture" },
          rollback_escrow_obligation: { rollback: "delete fixture output" },
          step_id: "s1",
          tolerance_ledger: { observation_error: 0 },
          tool: "fixture-provider",
          validity_domain: { environment: "local-test" },
        },
      ],
    });
    const freshGate = operationGateReport(fresh, {
      allow_execute: true,
      explicit_execute: true,
      provider_target: "fixture-provider",
      side_effect_policy: "provider_webhook_allowed",
      trusted_issuers: ["operator:test"],
    });
    expect(freshGate.operation_ready).toBe(true);
    expect(freshGate.provider_dispatch_ready).toBe(true);
    expect(freshGate.physical_dispatch_ready).toBe(false);
    expect(freshGate.execution_blockers).toEqual([]);
  });

  it("keeps incomplete traces blocked from operation readiness", () => {
    const checked = traceCheckReport(
      traceNormalFormReport({
        trace_id: "trace:missing",
        steps: [{ step_id: "s1", tool: "local-check" }],
      }),
    );
    expect(checked.execution_available).toBe(false);
    expect(checked.execution_blockers).toEqual(
      expect.arrayContaining([
        "missing_authority_envelope",
        "missing_resource_ledger",
        "missing_rollback_escrow_obligation",
        "missing_step_witness",
        "missing_tolerance_ledger",
      ]),
    );
  });

  it("extracts BIT registry rows and emits CCR witness tasks", () => {
    const dir = mkdtempSync(join(tmpdir(), "pic-ts-v060-bit-"));
    const source = join(dir, "registry.tex");
    const registry = join(dir, "registry.jsonl");
    writeFileSync(
      source,
      [
        "\\MRRecord{claim}{claim:alpha}{text=Alpha claim}",
        "MRRecord|depends|claim:alpha|depends_on=claim:seed",
      ].join("\n"),
      "utf8",
    );
    cliText([
      "bit",
      "extract-registry",
      "--source",
      source,
      "--output",
      registry,
    ]);
    const verified = cli(["bit", "verify-witnesses", "--registry", registry]);
    const tasks = jsonl(
      cliText(["bit", "emit-ccr-tasks", "--registry", registry]),
    );
    expect(verified.accepted).toBe(false);
    expect(tasks[0]?.schema_version).toBe("ccr.task.v0.1");
    expect(tasks[0]?.role).toBe("formalizer");

    const sdkRegistry = bitRegistryReport(readFileSync(source, "utf8"), source);
    expect(sdkRegistry.missing_witness_claims).toEqual(["claim:alpha"]);
    expect(bitTasksFromRegistry(sdkRegistry)).toHaveLength(1);
  });

  it("diagnoses SQOT state and ALT bridge residuals conservatively", () => {
    const sqot = diagnoseSqotQueueState({ queue_score: 0.1 });
    expect(sqot.queue_status).toBe("diagnostic");
    expect(sqot.residuals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "missing_diagnostic_reserve" }),
      ]),
    );

    const dir = mkdtempSync(join(tmpdir(), "pic-ts-v060-sqot-"));
    const state = join(dir, "state.json");
    writeFileSync(state, stableStringify({ queue_score: 0.1 }), "utf8");
    const taskLines = jsonl(
      cliText([
        "sqot",
        "diagnose-queue",
        "--state",
        state,
        "--emit",
        "ccr-tasks",
      ]),
    );
    expect(taskLines.length).toBeGreaterThan(0);

    const bridge = altEcptBridgeReport({
      packet_id: "alt-packet:test",
      negative_liquidity_certificate: { reason: "cost increased" },
    });
    expect(bridge.accepted).toBe(true);
    expect(bridge.capital_admitted).toBe(false);
    expect(bridge.settled).toBe(false);
    expect(bridge.settled_blockers).toEqual(
      expect.arrayContaining(["negative liquidity signal preserved"]),
    );
  });

  it("packages v0.6 examples, schemas, and docs", () => {
    const schemaOut = mkdtempSync(join(tmpdir(), "pic-ts-v060-schemas-"));
    cliText(["schema", "--all", "--output-dir", schemaOut]);
    expect(existsSync(join(schemaOut, "interop", "ccr_task.schema.json"))).toBe(
      true,
    );
    expect(
      json(join(packageRoot(), "schemas", "interop", "ccr_task.schema.json"))
        .title,
    ).toBe("PIC-emitted CCR Task");
    for (const file of [
      "docs/v060-audit.md",
      "docs/ccr-pic-roundtrip.md",
      "docs/interop/ccr.md",
      "examples/asi_proxy_benchmark_bundle/trc_agent_trace.json",
      "examples/interop/ccr_tasks.example.jsonl",
    ]) {
      expect(existsSync(join(packageRoot(), file)), file).toBe(true);
    }
  });
});
