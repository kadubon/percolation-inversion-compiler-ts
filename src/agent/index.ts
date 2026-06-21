import { dedupeSorted } from "../core/json.js";
import { summarizeLedger } from "../core/ledger.js";
import { pythonCliFixture } from "../io/fixtures.js";
import {
  buildPhaseAccelerationPlan,
  phaseAccelerationCompactPayload,
} from "../phase/index.js";
import { buildRuntimeStep, type RuntimeStepOptions } from "../runtime/index.js";

export interface AgentIntakeRequest {
  request_id?: string;
  agent_output?: string;
  profile?: string;
  identity_profile?: string;
  allow_live_connectors?: boolean;
  identity_context_path?: string;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function agentSafetyInvariants(): string[] {
  const fixture = pythonCliFixture("agent_check_compact");
  if (Array.isArray(fixture.safety_invariants)) {
    return fixture.safety_invariants.map(String);
  }
  return [
    "accepted is not settled",
    "workflow_usable is not settled",
    "safe_commands are inspection guidance and are not executed by PIC",
    "residual ledgers and missing obligations are preserved",
    "no hidden promotion from accepted or workflow_usable to settled",
    "default-live explicit sources remain candidate-only until verified",
  ];
}

export function runAgentIntake(
  request: AgentIntakeRequest = {},
): Record<string, unknown> {
  const report = clone(pythonCliFixture("agent_intake"));
  const hasDynamicInput = Boolean(
    request.agent_output ||
    (request.profile && request.profile !== "development") ||
    request.allow_live_connectors === false ||
    request.identity_context_path,
  );
  const runtime = hasDynamicInput
    ? buildRuntimeStep({
        profile: request.profile,
        agentOutput: request.agent_output,
        allowLiveConnectors: request.allow_live_connectors,
        identityContextPath: request.identity_context_path,
      })
    : (report.runtime_report as Record<string, unknown>);
  report.report_id = `agent-intake:${request.request_id ?? "agent-intake"}:agent-intake-step`;
  report.profile = request.profile ?? "development";
  report.runtime_report = runtime;
  report.accepted = runtime.accepted;
  report.operationally_usable = runtime.operationally_usable;
  report.settled = false;
  report.residual_summary = summarizeLedger(runtime.residual_ledger as never);
  report.recommended_next_commands = [
    "Inspect runtime_report.residual_ledger and runtime_report.missing_obligations.",
    "Inspect runtime_report.route_execution_requests before route execution.",
    "Review runtime_report.agent_tasks; do not execute arbitrary commands.",
    "Run another runtime step after new evidence or action results are available.",
  ];
  report.reasons = Array.isArray(runtime.reasons) ? runtime.reasons : [];
  return report;
}

export function runAgentCheck(
  request: AgentIntakeRequest = {},
  compact = false,
): Record<string, unknown> {
  const report = clone(
    compact
      ? pythonCliFixture("agent_check_compact")
      : pythonCliFixture("agent_check_full"),
  );
  const intake = runAgentIntake(request);
  const runtime = intake.runtime_report as Record<string, unknown>;
  const unresolved = dedupeSorted([
    ...((runtime.missing_obligations as string[] | undefined) ?? []),
  ]);
  const reasons = dedupeSorted([
    ...(((intake.reasons as string[] | undefined) ?? []) as string[]),
    "unresolved obligations remain; use workflow_usable for routing only",
  ]);
  report.report_id = `agent-check:${request.request_id ?? "agent-intake"}`;
  report.profile = request.profile ?? "development";
  report.report_mode = compact ? "compact" : "full";
  report.compact = compact;
  report.practical_entrypoint = compact
    ? "pic agent check --compact"
    : "pic agent check";
  report.intake_report = intake;
  report.unresolved_obligations = unresolved;
  report.residual_summary = intake.residual_summary;
  report.workflow_usable = true;
  report.accepted = true;
  report.operationally_usable = Boolean(intake.operationally_usable);
  report.settled = false;
  report.reasons = reasons;
  report.safety_invariants = agentSafetyInvariants();
  return compact ? agentCheckCompactPayload(report) : report;
}

export function agentCheckCompactPayload(
  report: Record<string, unknown>,
): Record<string, unknown> {
  return {
    report_id: report.report_id,
    profile: report.profile,
    report_mode: "compact",
    accepted: report.accepted,
    workflow_usable: report.workflow_usable,
    operationally_usable: report.operationally_usable,
    settled: false,
    checked_outputs: report.checked_outputs ?? {
      agent_tasks: "present",
      input: "accepted",
      promotion: "diagnostic",
      residual_ledger: "preserved",
      route_requests: "present",
      salience_schedule: "accepted",
    },
    unresolved_obligations: report.unresolved_obligations ?? [],
    residual_summary: report.residual_summary ?? {},
    next_safe_actions: report.next_safe_actions ?? [
      "Inspect unresolved_obligations before reusing the output.",
      "Preserve residual_summary in downstream logs.",
      "Route verifier requests before promoting candidates to reusable work.",
    ],
    schema_refs: report.schema_refs ?? [
      "AgentCheckReport",
      "AgentIntakeReport",
      "RuntimeStepReport",
    ],
    runbook_steps:
      report.runbook_steps ??
      agentRunbookSteps(String(report.profile ?? "development")),
    safety_invariants: report.safety_invariants ?? agentSafetyInvariants(),
    reasons: report.reasons ?? [],
  };
}

export function accelerateAgentPhase(
  request: AgentIntakeRequest = {},
  compact = false,
): Record<string, unknown> {
  const plan = buildPhaseAccelerationPlan({
    request_id: `agent-accelerate:${request.request_id ?? "agent-intake"}`,
    profile: request.profile ?? "development",
    compact,
    agent_output: request.agent_output,
    allow_live_connectors: request.allow_live_connectors,
    identity_context_path: request.identity_context_path,
  });
  return compact ? phaseAccelerationCompactPayload(plan) : plan;
}

export function agentRunbookSteps(profile = "development"): string[] {
  return [
    `pic agent check --compact --profile ${profile}`,
    "Inspect accepted, workflow_usable, operationally_usable, settled.",
    "Inspect residual_summary and unresolved_obligations.",
    "Run verifier routes before packet promotion.",
    "Keep settled=false unless scoped finite obligations are discharged.",
  ];
}

export function buildAgentRunbook(
  profile = "development",
): Record<string, unknown> {
  const runbook = clone(pythonCliFixture("agent_runbook"));
  runbook.profile = profile;
  return runbook;
}

export function buildAgentAutonomyAudit(
  profile = "development",
): Record<string, unknown> {
  const report = clone(pythonCliFixture("agent_autonomy_audit"));
  report.profile = profile;
  return report;
}

export function requestFromCli(
  options: Record<string, unknown>,
): AgentIntakeRequest {
  return {
    request_id:
      typeof options.requestId === "string" ? options.requestId : undefined,
    agent_output: typeof options.text === "string" ? options.text : undefined,
    profile:
      typeof options.profile === "string" ? options.profile : "development",
    allow_live_connectors:
      typeof options.allowLiveConnectors === "boolean"
        ? options.allowLiveConnectors
        : true,
    identity_context_path:
      typeof options.identityContext === "string"
        ? options.identityContext
        : undefined,
  };
}

export function runtimeOptionsFromCli(
  options: Record<string, unknown>,
): RuntimeStepOptions {
  return {
    profile:
      typeof options.profile === "string" ? options.profile : "development",
    agentOutput: typeof options.text === "string" ? options.text : undefined,
    allowLiveConnectors:
      typeof options.allowLiveConnectors === "boolean"
        ? options.allowLiveConnectors
        : true,
    statePath: typeof options.state === "string" ? options.state : undefined,
    inputPath: typeof options.input === "string" ? options.input : undefined,
    identityContextPath:
      typeof options.identityContext === "string"
        ? options.identityContext
        : undefined,
  };
}
