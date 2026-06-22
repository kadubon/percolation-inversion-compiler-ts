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

function eventsFromTrace(input: JsonRecord): JsonRecord[] {
  return records(input.events).length > 0
    ? records(input.events)
    : records(input.tool_calls).length > 0
      ? records(input.tool_calls)
      : [input];
}

export function adaptTrcTrace(input: JsonRecord): JsonRecord {
  const events = eventsFromTrace(input);
  const typedEvents = events.map((event, index) => ({
    action_kind: String(
      event.action_kind ?? event.type ?? event.name ?? "agent-event",
    ),
    authority_status: String(event.authority_status ?? "not-granted"),
    event_id: String(event.event_id ?? `trace-event:${index}`),
    evidence_refs: Array.isArray(event.evidence_refs)
      ? event.evidence_refs.map(String)
      : [],
    receiver: String(
      event.receiver ?? event.receiver_agent_id ?? "unknown-receiver",
    ),
    rollback_status: String(event.rollback_status ?? "unknown"),
    source: String(event.source ?? event.sender ?? "unknown-source"),
    settled: false,
  }));
  return {
    accepted: true,
    executed_action_count: 0,
    execution_authority_granted: false,
    frontier_debt: {
      missing_physical_or_oracle_obligations: [
        "physical execution evidence",
        "oracle truth evidence",
      ],
      settled: false,
    },
    normal_form: {
      event_count: typedEvents.length,
      normal_form_id: "trace-normal-form",
      settled: false,
    },
    physical_truth_proven: false,
    reasons: ["trace content is typed data, not instruction"],
    report_id: "trace-adapter-report",
    settled: false,
    tolerance_ledger: {
      residual_tolerance: 1,
      settled: false,
    },
    typed_trace: {
      events: typedEvents,
      trace_id: String(input.trace_id ?? "typed-agent-trace"),
    },
    workflow_usable: true,
  };
}

export function adaptToolTrace(input: JsonRecord | JsonRecord[]): JsonRecord {
  const events = Array.isArray(input) ? input : eventsFromTrace(input);
  return adaptTrcTrace({ events, trace_id: "typed-tool-call-trace" });
}

export function buildActionBoundaryReport(
  runtimeReport: JsonRecord,
): JsonRecord {
  const commits = records(runtimeReport.action_commits);
  return {
    accepted: runtimeReport.accepted === true,
    action_boundaries: commits.map((commit, index) => ({
      action_id: String(commit.action_id ?? `action:${index}`),
      authority_status: "not-granted",
      execution_authority_granted: false,
      rollback_required: true,
      settled: false,
    })),
    executed_action_count: 0,
    execution_authority_granted: false,
    physical_truth_proven: false,
    reasons: ["runtime action boundaries are diagnostic and non-executing"],
    report_id: "action-boundary-report",
    settled: false,
    workflow_usable: runtimeReport.accepted === true,
  };
}
