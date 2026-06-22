import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { altAdmit } from "../src/alt/index.js";
import { verifyAltEcptLift } from "../src/alt_lift/index.js";
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
import {
  buildCollectivePhaseCertificateCandidate,
  buildEffectivePacketGraph,
  buildPhaseThresholdStatus,
  detectAutocatalyticClosure,
  detectExecutionAvailablePaths,
  observePhaseWindow,
} from "../src/phase_lab/index.js";
import { inspectPacketEnvelope } from "../src/packet/index.js";
import { buildRuntimeStep } from "../src/runtime/index.js";
import {
  buildPacketQuarantineDecisions,
  diagnoseQueueOccupation,
} from "../src/sqot_controller/index.js";
import { buildSalienceSchedule } from "../src/sqot/index.js";
import { adaptToolTrace } from "../src/trc_adapter/index.js";
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

  it("uses real SHA-256 for runtime agent output digests without settling the report", () => {
    const text = "hello";
    const report = buildRuntimeStep({ agentOutput: text });
    const expected = createHash("sha256").update(text, "utf8").digest("hex");
    expect(report.agent_output_digest).toBe(`sha256:${expected}`);
    expect(report.agent_output_digest).not.toBe(
      `sha256:${Buffer.from(text, "utf8").toString("hex")}`,
    );
    expect(report.settled).toBe(false);
  });

  it("detects Node/npm command-like packet strings while keeping packet content inert", () => {
    const inspection = inspectPacketEnvelope({
      accepted: true,
      workflow_usable: true,
      content_digest: "sha256:test",
      packet_id: "packet:test",
      content: {
        install: "npm install percolation-inversion-compiler-ts",
        exec: "npx pic-ts agent check",
        node: "node script.js",
        docker: "docker run image",
        kubernetes: "kubectl get pods",
      },
      settled: false,
    });
    expect(inspection.embedded_command_like_values).toEqual(
      expect.arrayContaining([
        "npm install percolation-inversion-compiler-ts",
        "npx pic-ts agent check",
        "node script.js",
        "docker run image",
        "kubectl get pods",
      ]),
    );
    expect(inspection.executed_command_count).toBe(0);
    expect(inspection.settled).toBe(false);
  });

  it("keeps Phase Ecology Lab raw and candidate-only records out of positive metrics", () => {
    const events = [
      {
        accepted: true,
        report_id: "accepted:alpha",
        evidence_refs: ["evidence:alpha"],
        settled: false,
      },
      {
        accepted: true,
        candidate_only: true,
        report_id: "candidate:beta",
        settled: false,
      },
      {
        accepted: true,
        report_id: "raw:gamma",
        source_kind: "general-intake",
        settled: false,
      },
    ];
    const graph = buildEffectivePacketGraph(events);
    expect(graph.accepted_packet_capital).toBe(1);
    expect(graph.candidate_only_packets).toBe(2);
    expect(graph.settled).toBe(false);

    const observation = observePhaseWindow({ event_count: 3 }, events, graph);
    expect(observation.accepted_packet_count).toBe(3);
    expect(observation.effective_node_count).toBe(1);
    expect(observation.candidate_only_packet_count).toBe(1);
    expect(observation.raw_external_volume_diagnostic_only).toBe(true);
    expect(observation.protocol_relative_only).toBe(true);
    expect(observation.proves_real_asi).toBe(false);
    expect(observation.proves_physical_or_oracle_truth).toBe(false);
    expect(observation.settled).toBe(false);
  });

  it("keeps closure, executable paths, and phase certificates diagnostic-only", () => {
    const graph = buildEffectivePacketGraph([
      {
        accepted: true,
        report_id: "accepted:path",
        execution_available: true,
        evidence_refs: ["evidence:path"],
        settled: false,
      },
    ]);
    const closure = detectAutocatalyticClosure(graph);
    const paths = detectExecutionAvailablePaths(graph);
    const threshold = buildPhaseThresholdStatus(
      observePhaseWindow({ event_count: 1 }, [{}], graph),
      { minimum_accepted_packet_count: 1 },
    );
    const certificate = buildCollectivePhaseCertificateCandidate(
      threshold,
      graph,
    );

    expect(closure.settled).toBe(false);
    expect(paths.executed_path_count).toBe(0);
    expect(paths.execution_authority_granted).toBe(false);
    expect(paths.settled).toBe(false);
    expect(certificate.settled).toBe(false);
    expect(certificate.execution_authority_granted).toBe(false);
  });

  it("keeps BIT/SQOT/ALT/TRC v0.5.0 helpers as inert recommendation data", () => {
    const graph = buildEffectivePacketGraph([
      {
        accepted: true,
        candidate_only: true,
        report_id: "candidate:queue",
        missing_obligations: ["verifier:evidence"],
        settled: false,
      },
    ]);
    const queue = diagnoseQueueOccupation(graph);
    const quarantine = buildPacketQuarantineDecisions(graph);
    const alt = verifyAltEcptLift(
      [
        {
          accepted: true,
          positive_ecpt_component_lift: true,
          missing_obligations: ["baseline"],
        },
      ],
      graph,
    );
    const trace = adaptToolTrace({
      tool_calls: [
        { name: "npm install inert" },
        { command: "docker run inert" },
      ],
    });

    expect(queue.settled).toBe(false);
    expect(quarantine.settled).toBe(false);
    expect(alt.settled).toBe(false);
    expect(alt.promotes_to_ecpt_capital).toBe(false);
    expect(trace.execution_authority_granted).toBe(false);
    expect(trace.settled).toBe(false);
  });
});
