import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { packageRoot } from "../src/io/paths.js";
import {
  a2aTaskHandoffReport,
  bitMecFrontierReport,
  dynamicRegimeAccelerationReport,
  mcpToolDescriptorReport,
  mcpToolInvocationPreflight,
  operationGateReport,
  phaseAccelerationReport,
  sqotProtocolIntegrityReport,
  targetValidityCheck,
  traceNormalFormReport,
} from "../src/interop/ccr.js";

function cli(args: string[]): Record<string, unknown> {
  const stdout = execFileSync(
    process.execPath,
    [join(packageRoot(), "dist", "cli", "main.js"), ...args],
    { cwd: packageRoot(), encoding: "utf8" },
  );
  return JSON.parse(stdout) as Record<string, unknown>;
}

function physicalTrace(): Record<string, unknown> {
  return traceNormalFormReport({
    operation_evaluation_clock: "2026-07-01T00:00:00Z",
    provider_target: "fixture-provider",
    side_effect_policy: "physical_provider_allowed",
    trace_id: "trace:v080-physical",
    steps: [
      {
        authority_envelope: {
          expires_at: "2099-01-01T00:00:00Z",
          issuer: "operator:test",
          scopes: ["fixture-provider", "local-test", "environment:local-test"],
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
}

describe("v0.8 acceleration and availability reports", () => {
  it("requires accepted and fresh physical certificates", () => {
    const common = {
      actuator_class: "fixture_arm",
      allow_execute: true,
      allowed_actuator_classes: ["fixture_arm"],
      explicit_execute: true,
      observation_window: { has_verifier: true },
      physical_dispatch_requested: true,
      provider_target: "fixture-provider",
      rollback_escrow: { status: "verified" },
      side_effect_policy: "physical_provider_allowed",
      trusted_issuers: ["operator:test"],
    };
    const rejected = operationGateReport(physicalTrace(), {
      ...common,
      emergency_stop: { status: "present" },
      hazard_envelope: { status: "present" },
      human_operator_authority: {
        expires_at: "2099-01-01T00:00:00Z",
        status: "present",
      },
      lifecycle_certificate: { status: "present" },
      physical_domain_profile: {
        allowed_actuator_classes: ["fixture_arm"],
        status: "present",
      },
      runtime_assurance_certificate: { status: "present" },
    });
    const accepted = operationGateReport(physicalTrace(), {
      ...common,
      emergency_stop: { status: "tested" },
      hazard_envelope: {
        expires_at: "2099-01-01T00:00:00Z",
        status: "accepted",
      },
      human_operator_authority: {
        expires_at: "2099-01-01T00:00:00Z",
        status: "approved",
      },
      lifecycle_certificate: { status: "fresh" },
      physical_domain_profile: {
        allowed_actuator_classes: ["fixture_arm"],
        status: "accepted",
      },
      runtime_assurance_certificate: { status: "fresh" },
    });

    expect(rejected.provider_dispatch_ready).toBe(true);
    expect(rejected.physical_dispatch_ready).toBe(false);
    expect(rejected.physical_dispatch_blockers).toContain(
      "physical_profile_not_accepted",
    );
    expect(accepted.physical_dispatch_ready).toBe(true);
    expect(accepted.physical_dispatch_blockers).toEqual([]);
  });

  it("separates MCP descriptor acceptance from invocation preflight readiness", () => {
    const descriptor = {
      auth_scope: ["read"],
      descriptor_changed_after_approval: true,
      descriptor_version: "1",
      egress_policy: "none",
      server_id: "srv",
      server_trust_status: "trusted",
      side_effect_class: "read_only",
      tool_name: "read",
    };
    const report = mcpToolDescriptorReport(descriptor);
    const preflight = mcpToolInvocationPreflight(descriptor, {
      output_redaction_policy: "redact-secrets",
      tool: "srv/read",
      trace_logging_enabled: true,
    });

    expect(report.accepted).toBe(false);
    expect(report.descriptor_changed_after_approval).toBe(true);
    expect(report.blockers).toContain("descriptor_rug_pull_blocked");
    expect(preflight.invocation_ready).toBe(false);
    expect(preflight.blockers).toContain("descriptor_rug_pull_blocked");
  });

  it("keeps A2A handoff evidence unsettled", () => {
    const handoff = a2aTaskHandoffReport({
      agent_card_ref: "agent:srv",
      declared_authority: { scope: "read" },
      handoff_scope: "read-only",
      idempotency_key: "idem-1",
      replay_nonce: "nonce-1",
      task_schema: { type: "object" },
    });

    expect(handoff.accepted).toBe(true);
    expect(handoff.settled).toBe(false);
    expect(handoff.non_claims).toContain(
      "a2a_message_does_not_grant_delegated_tool_execution",
    );
  });

  it("fails CARA comparison closed without baseline and keeps proxy-only non-contributing", () => {
    const report = phaseAccelerationReport(
      {
        authority_envelope: { status: "approved" },
        baseline_upper_envelope_ref: "baseline:missing",
        capability_basis: ["capability:x"],
        capability_envelope: { status: "accepted" },
        externality_law: { status: "accepted" },
        generated_law: { status: "accepted" },
        hazard_envelope: { status: "accepted" },
        horizon: "P7D",
        mission_law: { status: "accepted" },
        raw_net_capital_floor: 0,
        target_id: "target:v080",
        target_set: { thresholds: { "coord:x": 1 } },
        target_validity_certificate_ref: "tvc:1",
        viability_set: { status: "accepted" },
      },
      {},
      [
        {
          baseline_ref: "baseline:missing",
          coordinate: "coord:x",
          finality_ref: "finality:x",
          finality_valid: true,
          gauge_compatible: true,
          hazard_constrained: true,
          mission_valid: true,
          raw_net_solvent: true,
          signed_surplus_lower_bound: 10,
          transport_ref: "transport:x",
          transport_valid: true,
          value_estimand_type: "proxy_only",
        },
      ],
    );

    expect(report.certified_acceleration_candidate).toBe(false);
    expect(report.ok).toBe(false);
    expect(report.blockers).toContain("missing_baseline_policy_class");
    expect(report.blockers).toContain("proxy_only_non_contributing");
  });

  it("rejects target validity when authority is not approved", () => {
    const report = targetValidityCheck({
      authority_envelope: { status: "present" },
      baseline_upper_envelope_ref: "baseline:demo",
      capability_basis: ["capability:x"],
      capability_envelope: { status: "accepted" },
      externality_law: { status: "accepted" },
      generated_law: { status: "accepted" },
      hazard_envelope: { status: "accepted" },
      horizon: "P7D",
      mission_law: { status: "accepted" },
      raw_net_capital_floor: 0,
      target_id: "target:status",
      target_set: { thresholds: { "coord:x": 1 } },
      target_validity_certificate_ref: "tvc:1",
      viability_set: { status: "accepted" },
    });

    expect(report.ok).toBe(false);
    expect(report.authority_ok).toBe(false);
    expect(report.blockers).toContain("authority_envelope_not_approved");
  });

  it("reports SQOT mutation blockers, BIT antichain, and dynamic positivity residuals", () => {
    const sqot = sqotProtocolIntegrityReport({
      audit_fuel: 1,
      checker_thresholds: { root: 1 },
      diagnostic_reserve: { min: 1 },
      hidden_protocol_mutation: true,
      mandatory_obligations: ["root_checker"],
      mechanism_compatibility_status: "accepted",
      protocol_id: "sqot:v080",
      root_checker_integrity: true,
      semantic_egress_status: "accepted",
    });
    const mec = bitMecFrontierReport([
      {
        certificate_id: "slow",
        cost: 2,
        finite_witness: true,
        friction: 2,
        load: 2,
        unit_ledger: { unit: "u" },
      },
      {
        certificate_id: "fast",
        cost: 1,
        finite_witness: true,
        friction: 1,
        load: 1,
        unit_ledger: { unit: "u" },
      },
    ]);
    const dynamic = dynamicRegimeAccelerationReport({
      arrival_gain_lower_bound: 0.5,
      censoring_charge: 0.1,
      competing_stop_charge: 0.1,
      dynamic_baseline_resource_matched: true,
      surface_id: "surface:v080",
      truncation_charge: 0.1,
    });

    expect(sqot.accepted).toBe(false);
    expect(sqot.blockers).toContain("hidden_protocol_mutation");
    expect(
      (mec.frontier as Array<Record<string, unknown>>).map(
        (item) => item.certificate_id,
      ),
    ).toEqual(["fast"]);
    expect(dynamic.accepted).toBe(false);
    expect(dynamic.blockers).toContain("positivity_floor_required");
  });

  it("exposes v0.8 CLI commands", () => {
    const dir = mkdtempSync(join(tmpdir(), "pic-ts-v080-"));
    const descriptor = join(dir, "descriptor.json");
    writeFileSync(
      descriptor,
      JSON.stringify({
        auth_scope: ["read"],
        descriptor_version: "1",
        egress_policy: "none",
        server_id: "srv",
        server_trust_status: "trusted",
        side_effect_class: "read_only",
        tool_name: "read",
      }),
    );
    const report = cli([
      "mcp",
      "descriptor-check",
      "--descriptor",
      descriptor,
      "--profile",
      "development",
    ]);

    expect(report.schema_version).toBe("pic.mcp_tool_descriptor_report.v1");
    expect(report.accepted).toBe(true);
  });
});
