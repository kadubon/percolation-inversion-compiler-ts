type JsonRecord = Record<string, unknown>;

const BOTTLENECK_CLASSES = [
  "missing_evidence",
  "missing_verifier_route",
  "missing_semantic_edge",
  "missing_rollback_support",
  "missing_authority",
  "missing_receiver_context",
  "identity_sybil_blocker",
  "stale_packet",
  "false_liquidity_blocker",
  "salience_obstruction",
  "queue_occupation",
  "missing_alt_lift",
  "trace_boundary_mismatch",
  "external_domain_obligation",
];

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord => Boolean(record(item)))
    : [];
}

function strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).sort();
  if (value === undefined || value === null) return [];
  return [String(value)];
}

function classForBlocker(blocker: string): string {
  const normalized = blocker.replaceAll("-", "_");
  if (BOTTLENECK_CLASSES.includes(normalized)) return normalized;
  if (normalized.includes("evidence")) return "missing_evidence";
  if (normalized.includes("verification")) return "missing_verifier_route";
  if (normalized.includes("edge")) return "missing_semantic_edge";
  if (normalized.includes("rollback")) return "missing_rollback_support";
  if (normalized.includes("authority")) return "missing_authority";
  if (normalized.includes("receiver")) return "missing_receiver_context";
  if (normalized.includes("stale")) return "stale_packet";
  if (normalized.includes("salience")) return "salience_obstruction";
  if (normalized.includes("external")) return "external_domain_obligation";
  return "external_domain_obligation";
}

function minimalConditions(
  bottleneckId: string,
  bottleneckClass: string,
): JsonRecord[] {
  return [
    {
      condition_id: `mec:${bottleneckId}:evidence`,
      condition_kind: "finite-evidence",
      description: `provide finite evidence for ${bottleneckClass}`,
      execution_authority_granted: false,
      settled: false,
    },
    {
      condition_id: `mec:${bottleneckId}:audit`,
      condition_kind: "post-check-audit",
      description: "preserve residuals and rerun the relevant checker",
      execution_authority_granted: false,
      settled: false,
    },
  ];
}

export function diagnoseBottlenecks(graph: JsonRecord): JsonRecord {
  const diagnoses: JsonRecord[] = [];
  for (const node of records(graph.nodes)) {
    for (const blocker of strings(record(node.eligibility)?.blockers)) {
      const bottleneckClass = classForBlocker(blocker);
      const bottleneckId = `bottleneck:${String(node.node_id)}:${bottleneckClass}`;
      diagnoses.push({
        accepted: true,
        bottleneck_class: bottleneckClass,
        bottleneck_id: bottleneckId,
        capability_expression_paths: [
          {
            accepted: false,
            path_id: `capability-path:${String(node.node_id)}`,
            reasons: [`blocked by ${blocker}`],
            settled: false,
          },
        ],
        minimal_enabling_conditions: minimalConditions(
          bottleneckId,
          bottleneckClass,
        ),
        node_id: String(node.node_id ?? ""),
        reasons: [`effective graph node is blocked by ${blocker}`],
        settled: false,
      });
    }
  }
  for (const edgeId of strings(graph.missing_edge_evidence)) {
    const bottleneckId = `bottleneck:${edgeId}:missing_semantic_edge`;
    diagnoses.push({
      accepted: true,
      bottleneck_class: "missing_semantic_edge",
      bottleneck_id: bottleneckId,
      edge_id: edgeId,
      minimal_enabling_conditions: minimalConditions(
        bottleneckId,
        "missing_semantic_edge",
      ),
      reasons: ["edge lacks semantic evidence"],
      settled: false,
    });
  }
  return {
    accepted: true,
    bottleneck_count: diagnoses.length,
    bottlenecks: diagnoses.sort((a, b) =>
      String(a.bottleneck_id).localeCompare(String(b.bottleneck_id)),
    ),
    execution_authority_granted: false,
    graph_id: String(graph.graph_id ?? ""),
    report_id: "bottleneck-inversion-report",
    settled: false,
    workflow_usable: true,
  };
}

export function buildMinimalEnablingConditions(
  bottleneckId: string,
  report?: JsonRecord,
): JsonRecord[] {
  const found = records(report?.bottlenecks).find(
    (item) => item.bottleneck_id === bottleneckId,
  );
  if (found) return records(found.minimal_enabling_conditions);
  return minimalConditions(bottleneckId, "external_domain_obligation");
}

export function invertBottlenecks(report: JsonRecord): JsonRecord {
  const candidates = records(report.bottlenecks).map((bottleneck, index) => {
    const bottleneckId = String(
      bottleneck.bottleneck_id ?? `bottleneck:${index}`,
    );
    const bottleneckClass = String(
      bottleneck.bottleneck_class ?? "external_domain_obligation",
    );
    return {
      accepted: true,
      bottleneck_class: bottleneckClass,
      bottleneck_id: bottleneckId,
      candidate_id: `inversion-candidate:${bottleneckId}`,
      expected_activation_gain: {
        gain_lower_bound:
          bottleneckClass === "missing_semantic_edge" ? 0.2 : 0.1,
        protocol_relative_only: true,
      },
      execution_authority_granted: false,
      minimal_enabling_conditions: buildMinimalEnablingConditions(
        bottleneckId,
        report,
      ),
      post_inversion_audit_plan: {
        audit_steps: ["rerun graph", "rerun observation", "preserve residuals"],
        settled: false,
      },
      reasons: ["inversion candidate is recommendation-only"],
      risk_hazard_authority_notes: [
        "host runtime authority required before external effects",
      ],
      rollback_or_deactivation_plan: {
        plan_id: `rollback:${bottleneckId}`,
        required: true,
        settled: false,
      },
      settled: false,
      verification_cost: 1,
      why_not_settled: "minimal enabling conditions are not discharged",
    };
  });
  return {
    accepted: true,
    candidate_count: candidates.length,
    candidates,
    execution_authority_granted: false,
    report_id: "bottleneck-inversion-candidates",
    settled: false,
    workflow_usable: true,
  };
}

export function buildInversionCertificate(candidate: JsonRecord): JsonRecord {
  const selected =
    records(candidate.inversion_candidates)[0] ??
    records(candidate.candidates)[0] ??
    candidate;
  return {
    accepted: selected.accepted === true,
    candidate: selected,
    certificate_id: `inversion-certificate:${String(selected.candidate_id ?? "candidate")}`,
    certificate_status: "candidate",
    execution_authority_granted: false,
    finite_requirements_passed: false,
    reasons: [
      "inversion certificate is a candidate only",
      "post-inversion audit remains required",
    ],
    settled: false,
    workflow_usable: true,
  };
}

export function compareBottleneckBaseline(
  baseline: JsonRecord,
  candidate: JsonRecord,
): JsonRecord {
  const delta = {
    closure_witness_count:
      Number(candidate.closure_witness_count ?? 0) -
      Number(baseline.closure_witness_count ?? 0),
    effective_edge_count:
      Number(candidate.effective_edge_count ?? 0) -
      Number(baseline.effective_edge_count ?? 0),
    effective_node_count:
      Number(candidate.effective_node_count ?? 0) -
      Number(baseline.effective_node_count ?? 0),
    residual_debt:
      Number(candidate.residual_debt ?? 0) -
      Number(baseline.residual_debt ?? 0),
  };
  return {
    accepted: true,
    activation_gain_estimate: delta,
    execution_authority_granted: false,
    report_id: "bottleneck-baseline-comparison",
    settled: false,
    workflow_usable: true,
  };
}
