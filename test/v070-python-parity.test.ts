import { describe, expect, it } from "vitest";
import { stableStringify } from "../src/core/json.js";
import {
  operationGateReport,
  traceNormalFormReport,
  tracePacketCandidate,
} from "../src/interop/ccr.js";

describe("v0.7 Python public JSON parity", () => {
  it("keeps deterministic schema versions and non-execution boundaries", () => {
    const trace = traceNormalFormReport({
      fixture_mode: true,
      side_effect_policy: "dry_run_only",
      trace_id: "trace:parity",
      steps: [
        {
          authority_envelope: {
            expires_at: "1970-01-01T00:00:00Z",
            issuer: "fixture",
            scopes: ["fixture-provider"],
            status: "approved",
          },
          output_ref: "output:fixture",
          resource_ledger: { budget: 1 },
          rollback_escrow_obligation: { rollback: "fixture" },
          step_id: "s1",
          tolerance_ledger: { observation_error: 0 },
          tool: "fixture-provider",
        },
      ],
    });
    const gate = operationGateReport(trace);
    const packet = tracePacketCandidate(trace);

    expect(stableStringify(gate)).toBe(stableStringify(gate));
    expect(gate.schema_version).toBe("pic.trc_operation_gate_report.v1");
    expect(packet.schema_version).toBe("pic.packet_candidate.v1");
    expect(gate.executed).toBe(false);
    expect(gate.settled).toBe(false);
    expect(packet.settled).toBe(false);
  });
});
