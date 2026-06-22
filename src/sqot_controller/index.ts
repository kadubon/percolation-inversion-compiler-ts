type JsonRecord = Record<string, unknown>;

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

function graphNodes(graph: JsonRecord): JsonRecord[] {
  return records(graph.nodes);
}

function candidateNodes(graph: JsonRecord): JsonRecord[] {
  return graphNodes(graph).filter(
    (node) => record(node.contribution)?.positive_contribution !== true,
  );
}

export function diagnoseQueueOccupation(
  graph: JsonRecord,
  attentionBudget = 1,
): JsonRecord {
  const nodes = graphNodes(graph);
  const candidates = candidateNodes(graph);
  const occupied = nodes.length === 0 ? 0 : candidates.length / nodes.length;
  return {
    accepted: true,
    attention_budget_ledger: {
      attention_budget: attentionBudget,
      occupied,
      occupied_by_candidate_only: candidates.length,
      settled: false,
    },
    candidate_only_count: candidates.length,
    execution_authority_granted: false,
    graph_id: String(graph.graph_id ?? ""),
    queue_occupation: occupied,
    report_id: "queue-occupation-report",
    settled: false,
    verification_queue_pressure: {
      missing_obligation_count: Number(
        record(graph.residual_summary)?.missing_obligation_count ?? 0,
      ),
      pressure: occupied,
      settled: false,
    },
    workflow_usable: true,
  };
}

export function diagnoseSalienceObstruction(graph: JsonRecord): JsonRecord {
  const blocked = graphNodes(graph).filter((node) =>
    strings(record(node.eligibility)?.blockers).some((blocker) =>
      [
        "candidate-only",
        "salience-obstruction",
        "stale",
        "raw-external-volume",
      ].includes(blocker),
    ),
  );
  return {
    accepted: true,
    blocked_packet_ids: blocked.map((node) => String(node.node_id)),
    execution_authority_granted: false,
    graph_id: String(graph.graph_id ?? ""),
    obstruction_count: blocked.length,
    reasons: [
      "salience obstruction is diagnostic and does not mutate queue state",
    ],
    report_id: "salience-obstruction-diagnosis",
    settled: false,
    workflow_usable: true,
  };
}

export function buildQueueRebalancePlan(graph: JsonRecord): JsonRecord {
  const actions = graphNodes(graph).map((node) => {
    const blockers = strings(record(node.eligibility)?.blockers);
    const action = blockers.length > 0 ? "preserve_residual" : "inspect";
    return {
      action,
      applied: false,
      deletes_packet: false,
      node_id: String(node.node_id ?? ""),
      reasons: blockers,
      settled: false,
    };
  });
  return {
    accepted: true,
    actions,
    applied_action_count: 0,
    execution_authority_granted: false,
    graph_id: String(graph.graph_id ?? ""),
    plan_id: "queue-rebalance-plan",
    recommended_action_count: actions.length,
    settled: false,
    workflow_usable: true,
  };
}

export function buildPacketQuarantineDecisions(graph: JsonRecord): JsonRecord {
  const decisions = candidateNodes(graph).map((node) => ({
    applied: false,
    decision: "quarantine",
    deletes_packet: false,
    node_id: String(node.node_id ?? ""),
    reasons: strings(record(node.eligibility)?.blockers),
    reversible: true,
    settled: false,
  }));
  return {
    accepted: true,
    applied: false,
    deletes_packets: false,
    execution_authority_granted: false,
    quarantine_decisions: decisions,
    settled: false,
    workflow_usable: true,
  };
}

export function checkDiagnosticReserve(
  graph: JsonRecord,
  attentionBudget = 1,
): JsonRecord {
  const queue = diagnoseQueueOccupation(graph, attentionBudget);
  const occupied = Number(queue.queue_occupation ?? 0);
  const reserveFraction = Math.max(0, 1 - occupied);
  return {
    accepted: true,
    diagnostic_reserve_available: reserveFraction > 0.1,
    execution_authority_granted: false,
    minimum_reserve_fraction: 0.1,
    reasons:
      reserveFraction > 0.1
        ? ["diagnostic reserve remains available"]
        : ["diagnostic reserve is below threshold"],
    report_id: "diagnostic-reserve-report",
    reserve_fraction: reserveFraction,
    settled: false,
    workflow_usable: true,
  };
}
