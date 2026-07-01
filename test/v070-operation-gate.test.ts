import { describe, expect, it } from "vitest";
import {
  operationGateReport,
  traceNormalFormReport,
} from "../src/interop/ccr.js";

function freshTrace(): Record<string, unknown> {
  return traceNormalFormReport({
    operation_evaluation_clock: "2026-07-01T00:00:00Z",
    provider_target: "fixture-provider",
    side_effect_policy: "provider_webhook_allowed",
    trace_id: "trace:v070-operation",
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

describe("v0.7 operation gate compatibility", () => {
  it("keeps provider readiness separate from execution and physical proof", () => {
    const report = operationGateReport(freshTrace(), {
      allow_execute: true,
      explicit_execute: true,
      provider_target: "fixture-provider",
      side_effect_policy: "provider_webhook_allowed",
      trusted_issuers: ["operator:test"],
    });

    expect(report.schema_version).toBe("pic.trc_operation_gate_report.v1");
    expect(report.operation_ready).toBe(true);
    expect(report.provider_dispatch_ready).toBe(true);
    expect(report.physical_dispatch_ready).toBe(false);
    expect(report.executed).toBe(false);
    expect(report.settled).toBe(false);
  });
});
