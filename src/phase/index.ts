import { existsSync, readFileSync } from "node:fs";
import { dedupeSorted } from "../core/json.js";
import { parseJsonObject } from "../core/json.js";
import { pythonCliFixture } from "../io/fixtures.js";
import { runtimeIdentityContextAccepted } from "../io/identity.js";
import { buildRuntimeStep } from "../runtime/index.js";

export interface PhaseAccelerationRequest {
  request_id?: string;
  profile?: string;
  compact?: boolean;
  agent_output?: string;
  allow_live_connectors?: boolean;
  identity_context_path?: string;
  general_intake_bridge_reports?: Array<Record<string, unknown>>;
  alt_admission_decisions?: Array<Record<string, unknown>>;
  runtime_report?: Record<string, unknown>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export const phaseSchemaRefs = (pythonCliFixture("phase_plan_compact")
  .schema_refs as string[]) ?? [
  "PhaseAccelerationRequest",
  "PhaseAccelerationPlan",
  "PhaseGapVector",
  "PhaseComponentGap",
  "BottleneckCandidate",
  "SafePhaseAction",
];

export function phaseAccelerationSafetyInvariants(): string[] {
  const fixture = pythonCliFixture("phase_plan_compact");
  if (Array.isArray(fixture.safety_invariants)) {
    return fixture.safety_invariants.map(String);
  }
  return [
    "phase acceleration planning is recommendation-only and does not execute actions",
    "raw external candidate volume cannot improve Psi, BR, AC, or settled status",
    "candidate packets, agent messages, and proxy-only ALT reports remain candidates",
    "settled remains false unless scoped finite verifier rules discharge all obligations",
    "residual ledgers and missing obligations must be preserved into downstream loops",
    "ASI-proxy phase is protocol-relative workflow coordination, not real ASI proof",
    "no physical, simulator, oracle, legal, or policy outcome is proven by this report",
    "no hidden promotion from accepted or workflow_usable to settled",
  ];
}

function identityContextAccepted(path: string | undefined): boolean {
  if (!path || !existsSync(path)) {
    return false;
  }
  try {
    const data = parseJsonObject(
      readFileSync(path, "utf8"),
      "identity context",
    );
    return runtimeIdentityContextAccepted(data);
  } catch {
    return false;
  }
}

function runtimeReportIdentityAccepted(
  report: Record<string, unknown> | undefined,
): boolean {
  if (!report) {
    return false;
  }
  const identity = report.identity_context;
  if (!identity || typeof identity !== "object" || Array.isArray(identity)) {
    return false;
  }
  const data = identity as Record<string, unknown>;
  return runtimeIdentityContextAccepted(data);
}

function objectList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? (value.filter((item) => item && typeof item === "object") as Array<
        Record<string, unknown>
      >)
    : [];
}

function ensureActionBoundary(plan: Record<string, unknown>): void {
  for (const action of objectList(plan.recommended_actions)) {
    action.execution_authority_granted = false;
    action.settled = false;
  }
}

export function buildPhaseAccelerationPlan(
  request: PhaseAccelerationRequest = {},
): Record<string, unknown> {
  const plan = clone(pythonCliFixture("phase_plan_full"));
  const profile = request.profile ?? "development";
  const hasDynamicRuntimeInput = Boolean(
    request.agent_output ||
    (request.profile && request.profile !== "development") ||
    request.allow_live_connectors === false ||
    request.identity_context_path,
  );
  const runtimeReport =
    request.runtime_report ??
    (hasDynamicRuntimeInput
      ? buildRuntimeStep({
          profile,
          agentOutput: request.agent_output,
          allowLiveConnectors: request.allow_live_connectors,
          identityContextPath: request.identity_context_path,
        })
      : (plan.runtime_report as Record<string, unknown>));
  const cannotPromote = new Set(
    (Array.isArray(plan.cannot_promote_because)
      ? plan.cannot_promote_because.map(String)
      : []) as string[],
  );
  const candidateOnly = new Set(
    (Array.isArray(plan.candidate_only_reasons)
      ? plan.candidate_only_reasons.map(String)
      : []) as string[],
  );
  const settledBlockers = new Set(
    (Array.isArray(plan.settled_blockers)
      ? plan.settled_blockers.map(String)
      : []) as string[],
  );
  const reasons = new Set(
    (Array.isArray(plan.reasons) ? plan.reasons.map(String) : []) as string[],
  );

  cannotPromote.add("missing obligations remain");
  settledBlockers.add(
    "phase planner is recommendation-only and cannot settle claims",
  );

  if (
    (request.general_intake_bridge_reports ?? []).some(
      (report) => report.candidate_only !== false,
    )
  ) {
    candidateOnly.add(
      "candidate-only external volume cannot reduce phase gaps",
    );
  }
  if (
    (request.alt_admission_decisions ?? []).some(
      (decision) =>
        Array.isArray(decision.missing_obligations) &&
        (decision.missing_obligations as unknown[]).length > 0,
    )
  ) {
    candidateOnly.add(
      "ALT admission is candidate-only until missing obligations are discharged",
    );
  }
  const identityRequired =
    profile === "production" || profile === "adversarial";
  const identityAccepted =
    identityContextAccepted(request.identity_context_path) ||
    runtimeReportIdentityAccepted(runtimeReport);
  if (identityRequired && !identityAccepted) {
    cannotPromote.add(
      "production/adversarial identity context is missing or not accepted",
    );
    settledBlockers.add(
      "production identity context is required before operational promotion",
    );
  }

  plan.plan_id = `phase-acceleration-plan:${request.request_id ?? "phase-acceleration"}`;
  plan.request_id = request.request_id ?? "phase-acceleration";
  plan.profile = profile;
  plan.report_mode = request.compact ? "compact" : "full";
  plan.accepted = true;
  plan.workflow_usable = true;
  plan.finite_checks_passed = plan.finite_checks_passed ?? true;
  plan.operationally_usable = !(identityRequired && !identityAccepted);
  plan.settled = false;
  plan.status =
    cannotPromote.size > 0 || candidateOnly.size > 0
      ? "diagnostic"
      : "provisional";
  plan.runtime_report = request.compact ? undefined : runtimeReport;
  plan.cannot_promote_because = [...cannotPromote].sort();
  plan.candidate_only_reasons = [...candidateOnly].sort();
  plan.settled_blockers = [...settledBlockers].sort();
  plan.reasons = dedupeSorted([...reasons, ...cannotPromote, ...candidateOnly]);
  plan.safety_invariants = phaseAccelerationSafetyInvariants();
  plan.schema_refs = phaseSchemaRefs;
  plan.safe_commands = dedupeSorted([
    ...(Array.isArray(plan.safe_commands)
      ? plan.safe_commands.map(String)
      : []),
  ]);
  plan.sdk_calls = dedupeSorted([
    ...(Array.isArray(plan.sdk_calls) ? plan.sdk_calls.map(String) : []),
  ]);

  ensureActionBoundary(plan);
  return plan;
}

export function phaseAccelerationCompactPayload(
  plan: Record<string, unknown>,
): Record<string, unknown> {
  return {
    plan_id: plan.plan_id,
    request_id: plan.request_id,
    profile: plan.profile,
    report_mode: "compact",
    accepted: plan.accepted,
    workflow_usable: plan.workflow_usable,
    finite_checks_passed: plan.finite_checks_passed ?? true,
    operationally_usable: plan.operationally_usable,
    settled: false,
    status: plan.status ?? "diagnostic",
    phase_gap_vector: plan.phase_gap_vector,
    top_bottlenecks:
      plan.top_bottlenecks ??
      (Array.isArray(plan.bottlenecks) ? plan.bottlenecks.slice(0, 5) : []),
    safe_commands: plan.safe_commands ?? [],
    sdk_calls: plan.sdk_calls ?? [],
    schema_refs: plan.schema_refs ?? phaseSchemaRefs,
    cannot_promote_because: plan.cannot_promote_because ?? [],
    candidate_only_reasons: plan.candidate_only_reasons ?? [],
    settled_blockers: plan.settled_blockers ?? [],
    residual_summary: plan.residual_summary ?? {},
    missing_obligations: plan.missing_obligations ?? [],
    safety_invariants:
      plan.safety_invariants ?? phaseAccelerationSafetyInvariants(),
    reasons: plan.reasons ?? [],
  };
}

export function phaseGapCompact(): Record<string, unknown> {
  const plan = buildPhaseAccelerationPlan({ compact: true });
  return plan.phase_gap_vector as Record<string, unknown>;
}

export function phaseAccelerationRunbook(
  profile = "development",
): Record<string, unknown> {
  const runbook = clone(pythonCliFixture("phase_runbook"));
  runbook.profile = profile;
  return runbook;
}

export function buildPhaseAccelerationBenchmark(
  profile = "development",
): Record<string, unknown> {
  const report = clone(pythonCliFixture("phase_benchmark"));
  report.profile = profile;
  report.accepted = true;
  report.workflow_usable = true;
  report.operationally_usable = true;
  report.settled = false;
  report.invariant_checks = {
    candidate_only_volume_does_not_reduce_gap: true,
    planner_does_not_execute_commands: true,
    residuals_visible: true,
    settled_not_promoted: true,
  };
  report.safety_invariants = phaseAccelerationSafetyInvariants();
  return report;
}
