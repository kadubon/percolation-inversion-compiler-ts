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

function packetId(packet: JsonRecord): string {
  return String(
    packet.packet_id ?? packet.report_id ?? packet.decision_id ?? "alt-packet",
  );
}

function graphHasCapital(graph: JsonRecord): boolean {
  return Number(graph.accepted_packet_capital ?? 0) > 0;
}

export function verifyAltEcptLift(
  packets: JsonRecord[],
  graph: JsonRecord,
): JsonRecord {
  const positive = packets.filter(
    (packet) =>
      packet.accepted === true &&
      packet.positive_ecpt_component_lift === true &&
      graphHasCapital(graph),
  );
  return {
    accepted: true,
    blockers:
      positive.length > 0
        ? []
        : [
            {
              blocker_id: "alt-lift:no-positive-ecpt-component",
              blocker_type: "missing_alt_lift",
              residual_preserved: true,
            },
          ],
    candidate_packet_count: packets.length,
    capital_to_path_contributions: positive.map((packet) => ({
      contribution_id: `capital-to-path:${packetId(packet)}`,
      packet_id: packetId(packet),
      positive_path_contribution: false,
      settled: false,
    })),
    execution_authority_granted: false,
    graph_id: String(graph.graph_id ?? ""),
    lift_status: positive.length > 0 ? "candidate" : "diagnostic_only",
    positive_ecpt_component_lift: positive.length > 0,
    promotes_to_ecpt_capital: false,
    reasons: [
      "ALT liquidity does not automatically become ECPT packet capital",
      "lift report is protocol-relative and diagnostic",
    ],
    report_id: "alt-ecpt-lift-report",
    settled: false,
    workflow_usable: true,
  };
}

export function verifyReceiverLift(
  packet: JsonRecord,
  receiverContext: JsonRecord,
): JsonRecord {
  const present =
    receiverContext.accepted === true || receiverContext.present === true;
  return {
    accepted: true,
    execution_authority_granted: false,
    packet_id: packetId(packet),
    receiver_context_present: present,
    receiver_lift_status: present ? "candidate" : "diagnostic_only",
    reasons: present
      ? ["receiver context is present but does not settle lift"]
      : ["receiver context is missing or not accepted"],
    settled: false,
    workflow_usable: true,
  };
}

export function mapLiquidityToPaths(
  packet: JsonRecord,
  graph: JsonRecord,
): JsonRecord {
  const pathCount = records(graph.edges).filter(
    (edge) => edge.accepted === true,
  ).length;
  return {
    accepted: true,
    execution_authority_granted: false,
    mapped_path_count: 0,
    packet_id: packetId(packet),
    positive_path_contribution: false,
    reasons: [
      `observed ${pathCount} graph edges`,
      "liquidity-to-path mapping is diagnostic-only until execution path rules pass",
    ],
    settled: false,
    workflow_usable: true,
  };
}

export function estimateCapitalImpact(reports: JsonRecord[]): JsonRecord {
  const positive = reports.filter(
    (report) => report.positive_ecpt_component_lift === true,
  ).length;
  return {
    accepted: true,
    estimated_positive_lift_count: positive,
    execution_authority_granted: false,
    false_liquidity_risk: reports.length - positive,
    report_count: reports.length,
    report_id: "alt-capital-impact",
    settled: false,
    workflow_usable: true,
  };
}
