import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { altAdmit } from "../src/alt/index.js";
import { runAgentCheck } from "../src/agent/index.js";
import {
  createAgentMessage,
  verifyAgentMessage,
} from "../src/agent/messages.js";
import { stableStringify } from "../src/core/json.js";
import { decideStatus } from "../src/core/status.js";
import {
  buildPhaseAccelerationPlan,
  phaseAccelerationCompactPayload,
} from "../src/phase/index.js";
import { buildSalienceSchedule } from "../src/sqot/index.js";
import { compileTrc } from "../src/trc/index.js";

describe("non-promotion and safety semantics", () => {
  it("keeps accepted, workflow_usable, operationally_usable, and settled separate", () => {
    const report = runAgentCheck(
      { agent_output: "Candidate packet: preserve residuals." },
      true,
    );
    expect(report.accepted).toBe(true);
    expect(report.workflow_usable).toBe(true);
    expect(report.settled).toBe(false);
    expect(report.unresolved_obligations).toContain(
      "proxy-target-grounding-proof",
    );
  });

  it("does not promote status when settled obligations are absent", () => {
    const decision = decideStatus(
      {
        required_for_settled: ["route:settled"],
        required_for_provisional: ["route:shape"],
        required_for_speculative: ["route:candidate"],
      },
      ["route:shape"],
    );
    expect(decision.accepted).toBe(true);
    expect(decision.status).toBe("provisional");
    expect(decision.missing_obligations).toContain("route:settled");
  });

  it("does not allow empty, expired, or unrelated obligations to settle a claim", () => {
    const emptySettled = decideStatus({ required_for_settled: [] }, []);
    expect(emptySettled.status).not.toBe("settled");
    expect(emptySettled.missing_obligations).toContain(
      "settled-rule:nonempty-obligations",
    );

    const expiredHard = decideStatus(
      { hard_domain_obligations: ["route:hard"] },
      ["route:hard"],
      ["route:hard"],
    );
    expect(expiredHard.accepted).toBe(false);
    expect(expiredHard.status).toBe("rejected");

    const optionalOnly = decideStatus(
      {
        required_for_settled: ["route:mandatory"],
        required_for_provisional: ["route:shape"],
      },
      ["route:shape", "route:optional"],
    );
    expect(optionalOnly.status).toBe("provisional");
    expect(optionalOnly.missing_obligations).toContain("route:mandatory");
  });

  it("keeps production identity missing as a blocker", () => {
    const plan = buildPhaseAccelerationPlan({
      profile: "production",
      compact: true,
    });
    expect(plan.workflow_usable).toBe(true);
    expect(plan.operationally_usable).toBe(false);
    expect(plan.settled).toBe(false);
    expect(plan.cannot_promote_because).toContain(
      "production/adversarial identity context is missing or not accepted",
    );
  });

  it("rejects malformed runtime identity context during production phase planning", () => {
    const plan = buildPhaseAccelerationPlan({
      profile: "production",
      compact: true,
      runtime_report: {
        accepted: true,
        identity_context: { accepted: true },
        residual_ledger: { coordinates: {} },
        settled: false,
      },
    });
    expect(plan.operationally_usable).toBe(false);
    expect(plan.cannot_promote_because).toContain(
      "production/adversarial identity context is missing or not accepted",
    );
  });

  it("keeps candidate-only external volume from reducing phase gaps", () => {
    const base = buildPhaseAccelerationPlan({ compact: true });
    const candidate = buildPhaseAccelerationPlan({
      compact: true,
      general_intake_bridge_reports: [{ accepted: true, candidate_only: true }],
    });
    expect(candidate.phase_gap_vector).toEqual(base.phase_gap_vector);
    expect(candidate.candidate_only_reasons).toContain(
      "candidate-only external volume cannot reduce phase gaps",
    );
  });

  it("marks phase planner actions as recommendation-only", () => {
    const plan = buildPhaseAccelerationPlan({ compact: true });
    const compact = phaseAccelerationCompactPayload(plan);
    expect(compact.settled).toBe(false);
    for (const action of plan.recommended_actions as Array<
      Record<string, unknown>
    >) {
      expect(action.execution_authority_granted).toBe(false);
      expect(action.settled).toBe(false);
    }
  });

  it("keeps candidate agent messages from granting authority or settlement", () => {
    const message = createAgentMessage({
      sender: "agent-a",
      text: "candidate packet",
    });
    const report = verifyAgentMessage(message);
    expect(report.accepted).toBe(true);
    expect(report.settled).toBe(false);
    const packets = report.packets as Array<Record<string, unknown>>;
    expect(packets).toHaveLength(1);
    const [packet] = packets;
    expect(packet?.authority_granted).toBe(false);
    expect(packet?.authority_requested).toBe(false);
  });

  it("routes TRC main-frontier trace omissions to diagnostic residuals", () => {
    const dir = mkdtempSync(join(tmpdir(), "pic-ts-trc-"));
    const recordsPath = join(dir, "records.json");
    writeFileSync(
      recordsPath,
      stableStringify([{ record_id: "frontier:1", stratum: "main" }]),
      "utf8",
    );
    const report = compileTrc({ recordsPath });
    expect(report.accepted).toBe(false);
    expect(report.operationally_usable).toBe(false);
    expect(report.diagnostic_count).toBe(1);
    expect(report.settled).toBe(false);
    expect(report.residual_ledger).toBeTruthy();
  });

  it("keeps SQOT and ALT outputs non-settled with visible residual or candidate routing", () => {
    const schedule = buildSalienceSchedule("development");
    expect(schedule.settled).toBe(false);
    expect(schedule.quarantine_ledger).toBeTruthy();
    expect(schedule.unresolved_obligation_backlog).toBeGreaterThan(0);

    const decision = altAdmit("alt-packet:proxy-only");
    expect(decision.settled).toBe(false);
    expect(decision.reasons).toContain(
      "ALT admission remains candidate-only until value, transport, hazard, and baseline obligations are discharged",
    );
  });
});
