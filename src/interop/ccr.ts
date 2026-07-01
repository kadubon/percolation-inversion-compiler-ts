import { createHash } from "node:crypto";
import { dedupeSorted, sortJson } from "../core/json.js";

type JsonRecord = Record<string, unknown>;

const FIXED_CREATED_AT = "1970-01-01T00:00:00Z";
const NON_CLAIMS = [
  "not_real_asi_proof",
  "not_model_weight_update",
  "not_execution_authority",
];
const CCR_TASK_KINDS = new Set([
  "packet_repair",
  "verifier_route",
  "alt_capital_check",
  "sqot_queue_repair",
  "trc_trace_normalization",
  "bit_witness_completion",
  "baseline_refresh",
  "identity_context_repair",
  "transport_certificate_repair",
  "hazard_envelope_repair",
  "residual_ledger_repair",
]);
const VALID_MR_TYPES = new Set([
  "article",
  "artifact",
  "unit-ledger",
  "schema",
  "claim",
  "witness",
  "depends",
  "citation",
]);

function optionalRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function record(value: unknown): JsonRecord {
  return optionalRecord(value) ?? {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord => Boolean(optionalRecord(item)))
    : [];
}

function listField(data: JsonRecord, key: string): string[] {
  const value = data[key];
  if (value === undefined || value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }
  return String(value) ? [String(value)] : [];
}

function compactStringify(value: unknown): string {
  return JSON.stringify(sortJson(value)) ?? "null";
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(compactStringify(value)).digest("hex")}`;
}

function shortHash(value: unknown): string {
  return createHash("sha256")
    .update(compactStringify(value))
    .digest("hex")
    .slice(0, 16);
}

function inputRef(ref: string, kind: string, notes: string): JsonRecord {
  return { kind, notes, ref, required: true };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function taskPriority(score: unknown): number {
  const numeric = typeof score === "number" ? score : Number(score ?? 0);
  return clamp(
    Math.round(50 + (Number.isFinite(numeric) ? numeric : 0) * 3),
    10,
    95,
  );
}

function roleForTaskKind(kind: string): string {
  return (
    (
      {
        alt_capital_check: "verifier",
        baseline_refresh: "benchmark_runner",
        bit_witness_completion: "formalizer",
        hazard_envelope_repair: "skeptic",
        identity_context_repair: "security_reviewer",
        packet_repair: "implementer",
        residual_ledger_repair: "integrator",
        sqot_queue_repair: "scheduler",
        transport_certificate_repair: "verifier",
        trc_trace_normalization: "formalizer",
        verifier_route: "verifier",
      } as Record<string, string>
    )[kind] ?? "integrator"
  );
}

function taskKindForBottleneck(bottleneck: JsonRecord): string {
  const text = [
    bottleneck.bottleneck_kind,
    bottleneck.target_component,
    ...listField(bottleneck, "reasons"),
    ...listField(bottleneck, "cannot_promote_because"),
  ]
    .map(String)
    .join(" ")
    .toLowerCase();
  if (text.includes("identity")) return "identity_context_repair";
  if (text.includes("transport")) return "transport_certificate_repair";
  if (text.includes("hazard") || text.includes("risk"))
    return "hazard_envelope_repair";
  if (
    text.includes("queue") ||
    text.includes("sqot") ||
    text.includes("salience")
  ) {
    return "sqot_queue_repair";
  }
  if (
    text.includes("alt") ||
    text.includes("liquidity") ||
    bottleneck.target_component === "ALT"
  ) {
    return "alt_capital_check";
  }
  if (text.includes("trace") || text.includes("trc"))
    return "trc_trace_normalization";
  if (text.includes("witness") || text.includes("bit"))
    return "bit_witness_completion";
  if (text.includes("baseline")) return "baseline_refresh";
  if (
    text.includes("route") ||
    listField(bottleneck, "next_verifier_routes").length > 0
  ) {
    return "verifier_route";
  }
  if (text.includes("residual")) return "residual_ledger_repair";
  return "packet_repair";
}

function bottleneckObjective(bottleneck: JsonRecord): string {
  const parts = [String(bottleneck.bottleneck_kind ?? "bottleneck")];
  if (bottleneck.target_component) {
    parts.push(`target=${String(bottleneck.target_component)}`);
  }
  const reasons = listField(bottleneck, "reasons");
  if (reasons.length > 0) {
    parts.push(reasons.slice(0, 3).join("; "));
  }
  return `Repair PIC phase bottleneck without promoting settlement: ${parts.join(" | ")}`;
}

function ccrTask(options: {
  kind: string;
  title: string;
  objective: string;
  sourceId: string;
  profile: string;
  priority: number;
  role: string;
  inputs?: JsonRecord[];
  residualInputs?: string[];
  safeCommandHints?: string[];
  verifierRoutes?: string[];
  candidateOnly?: boolean;
}): JsonRecord {
  const kind = CCR_TASK_KINDS.has(options.kind)
    ? options.kind
    : "packet_repair";
  const safeHints = dedupeSorted(options.safeCommandHints ?? []);
  const residualRefs = dedupeSorted(options.residualInputs ?? []);
  const routes = dedupeSorted(options.verifierRoutes ?? []);
  const profile = [
    "development",
    "research",
    "controlled",
    "federated",
    "production",
    "adversarial",
  ].includes(options.profile)
    ? options.profile
    : "development";
  return {
    blackboard_refs: [],
    completion: {},
    constraints: {
      allowed_commands: [],
      authority_policy: "read_only",
      forbidden_actions: ["automatic_execution", "shell_expansion"],
      max_runtime_minutes: 30,
      network_policy: "none",
      side_effect_policy: "dry_run_only",
    },
    created_at: FIXED_CREATED_AT,
    dependencies: [],
    expected_outputs: [
      {
        acceptance_criteria: [
          "Preserve residuals and do not treat PIC accepted=true as CCR settlement.",
        ],
        destination: "tasks/open",
        kind: "json",
        schema_ref: "schemas/task.schema.json",
      },
    ],
    extensions: {
      x_candidate_only: options.candidateOnly ?? false,
      x_pic_residual_inputs: residualRefs,
      x_pic_safe_command_hints: safeHints,
      x_pic_source_id: options.sourceId,
      x_pic_task_kind: kind,
    },
    inputs: options.inputs ?? [],
    lease: {
      lease_required: true,
      leased_at: null,
      leased_by: null,
      renewal_allowed: true,
      ttl_minutes: 30,
    },
    objective: options.objective,
    pic_interop: {
      candidate_only_until_checked: true,
      enabled: true,
      identity_context_required: kind === "identity_context_repair",
      input_mapping: "report_to_phase_plan",
      output_mapping: "pic_phase_plan_to_tasks",
      pic_profile: profile,
      recommended_pic_commands: safeHints,
    },
    priority: clamp(Math.trunc(options.priority), 0, 100),
    residual_policy: {
      blocking_residuals_prevent_settlement: true,
      minimum_residual_fields: [
        "residual_id",
        "kind",
        "description",
        "blocking",
      ],
      preserve_residuals: true,
      residual_destination: "residuals/open",
    },
    role: options.role,
    schema_version: "ccr.task.v0.1",
    status: "open",
    task_id: `task:pic:${kind}:${shortHash([
      options.sourceId,
      options.objective,
      residualRefs,
      safeHints,
    ])}`,
    title: options.title,
    verifier_plan: {
      failure_route: "residual",
      optional_verifiers: routes.length > 0 ? routes : ["pic"],
      promotion_gate: routes.length > 0 ? "pic_checked" : "none",
      required_verifiers: routes,
    },
  };
}

function ccrResidual(options: {
  kind: string;
  description: string;
  blocking: boolean;
  objectType: string;
  objectId: string;
  sourceId: string;
  sourceField: string;
}): JsonRecord {
  return {
    blocking: options.blocking,
    created_at: FIXED_CREATED_AT,
    description: options.description,
    extensions: {
      x_pic_source_field: options.sourceField,
      x_pic_source_id: options.sourceId,
    },
    kind: options.kind,
    object_id: options.objectId,
    object_type: options.objectType,
    refs: [options.sourceId],
    repair_hint:
      "Route as CCR repair work; do not discard PIC residual context.",
    residual_id: `residual:pic:${shortHash([
      options.kind,
      options.description,
      options.objectId,
      options.sourceId,
    ])}`,
    schema_version: "ccr.residual.v0.1",
    severity: options.blocking ? "high" : "medium",
    source: "pic",
    status: "open",
  };
}

export function jsonlText(items: Iterable<JsonRecord>): string {
  return `${[...items].map(compactStringify).join("\n")}\n`;
}

export function ccrTasksFromPhasePlan(plan: JsonRecord): JsonRecord[] {
  const tasks: JsonRecord[] = [];
  const bottlenecks =
    records(plan.bottlenecks).length > 0
      ? records(plan.bottlenecks)
      : records(plan.top_bottlenecks);
  const profile = String(plan.profile ?? "development");
  const planId = String(plan.plan_id ?? "phase-plan");

  for (const bottleneck of bottlenecks) {
    const kind = taskKindForBottleneck(bottleneck);
    const sourceId = String(
      bottleneck.candidate_id ?? bottleneck.bottleneck_id ?? kind,
    );
    tasks.push(
      ccrTask({
        kind,
        title: `PIC ${kind.replaceAll("_", " ")}`,
        objective: bottleneckObjective(bottleneck),
        sourceId,
        profile,
        priority: taskPriority(bottleneck.priority_score),
        role: roleForTaskKind(kind),
        inputs: [
          inputRef(
            sourceId,
            "report",
            "PIC bottleneck candidate; candidate-only until CCR work verifies it.",
          ),
          ...listField(bottleneck, "cannot_promote_because").map((reason) =>
            inputRef(reason, "text", "Cannot-promote reason."),
          ),
        ],
        safeCommandHints: listField(bottleneck, "next_safe_commands"),
        residualInputs: listField(bottleneck, "residual_coordinates"),
        verifierRoutes: listField(bottleneck, "next_verifier_routes"),
        candidateOnly: bottleneck.candidate_only === true,
      }),
    );
  }
  for (const [index, reason] of listField(
    plan,
    "candidate_only_reasons",
  ).entries()) {
    tasks.push(
      ccrTask({
        kind: "packet_repair",
        title: "Preserve PIC candidate-only reason",
        objective: `Repair or route candidate-only PIC input: ${reason}`,
        sourceId: `${planId}:candidate-only:${index}`,
        profile,
        priority: 45,
        role: "skeptic",
        inputs: [inputRef(reason, "text", "Candidate-only reason.")],
        candidateOnly: true,
      }),
    );
  }
  for (const [index, blocker] of listField(
    plan,
    "settled_blockers",
  ).entries()) {
    tasks.push(
      ccrTask({
        kind: "residual_ledger_repair",
        title: "Repair PIC settlement blocker",
        objective: `Preserve and route PIC settlement blocker: ${blocker}`,
        sourceId: `${planId}:settled-blocker:${index}`,
        profile,
        priority: 80,
        role: "integrator",
        inputs: [inputRef(blocker, "text", "Blocking settlement residual.")],
        residualInputs: [blocker],
      }),
    );
  }
  for (const [index, command] of listField(plan, "safe_commands").entries()) {
    tasks.push(
      ccrTask({
        kind: "verifier_route",
        title: "Review PIC safe command hint",
        objective: "Review a PIC safe command as a non-executed hint.",
        sourceId: `${planId}:safe-command:${index}`,
        profile,
        priority: 30,
        role: "pic_adapter",
        inputs: [inputRef(command, "text", "Safe command hint only.")],
        safeCommandHints: [command],
        candidateOnly: true,
      }),
    );
  }
  return tasks.sort((a, b) =>
    String(a.task_id).localeCompare(String(b.task_id)),
  );
}

export function ccrResidualsFromPhasePlan(plan: JsonRecord): JsonRecord[] {
  const residuals: JsonRecord[] = [];
  const planId = String(plan.plan_id ?? "phase-plan");
  for (const [index, blocker] of listField(
    plan,
    "settled_blockers",
  ).entries()) {
    residuals.push(
      ccrResidual({
        kind: "settlement_blocker",
        description: `PIC settled blocker: ${blocker}`,
        blocking: true,
        objectType: "phase",
        objectId: planId,
        sourceId: `${planId}:settled-blocker:${index}`,
        sourceField: "settled_blockers",
      }),
    );
  }
  for (const [index, reason] of listField(
    plan,
    "candidate_only_reasons",
  ).entries()) {
    residuals.push(
      ccrResidual({
        kind: "candidate_only_reason",
        description: `PIC candidate-only reason: ${reason}`,
        blocking: false,
        objectType: "phase",
        objectId: planId,
        sourceId: `${planId}:candidate-only:${index}`,
        sourceField: "candidate_only_reasons",
      }),
    );
  }
  for (const [index, obligation] of listField(
    plan,
    "missing_obligations",
  ).entries()) {
    residuals.push(
      ccrResidual({
        kind: "settlement_blocker",
        description: `PIC missing obligation: ${obligation}`,
        blocking: true,
        objectType: "phase",
        objectId: planId,
        sourceId: `${planId}:missing-obligation:${index}`,
        sourceField: "missing_obligations",
      }),
    );
  }
  return residuals.sort((a, b) =>
    String(a.residual_id).localeCompare(String(b.residual_id)),
  );
}

function packetId(packet: JsonRecord): string {
  return String(
    packet.packet_id ??
      packet.decision_id ??
      packet.token_id ??
      record(packet.token).token_id ??
      "alt-packet",
  );
}

function bridgeResidual(
  packet: string,
  kind: string,
  blocking: boolean,
): JsonRecord {
  return {
    blocking,
    description: kind.replaceAll("_", " "),
    kind,
    packet_id: packet,
    residual_id: `alt-ecpt:${shortHash([packet, kind])}`,
  };
}

function hasCostUpperBounds(
  packet: JsonRecord,
  liquidity: JsonRecord,
): boolean {
  const cost =
    optionalRecord(liquidity.cost_ledger) ?? optionalRecord(packet.cost_ledger);
  if (!cost) return false;
  return Object.keys(cost).some(
    (key) =>
      key.endsWith("_cost") ||
      key.endsWith("_upper_bound") ||
      key === "formation_cost",
  );
}

function transportScope(packet: JsonRecord, liquidity: JsonRecord): string[] {
  const transport =
    optionalRecord(liquidity.transport_certificate) ??
    optionalRecord(packet.transport_certificate) ??
    {};
  return listField(packet, "transport_scope").length > 0
    ? listField(packet, "transport_scope")
    : listField(transport, "target_receiver_family").length > 0
      ? listField(transport, "target_receiver_family")
      : listField(transport, "transport_scope_refs").length > 0
        ? listField(transport, "transport_scope_refs")
        : listField(packet, "transport_scope_refs");
}

function hasBaseline(packet: JsonRecord, liquidity: JsonRecord): boolean {
  const opportunity =
    optionalRecord(liquidity.opportunity_contract) ??
    optionalRecord(packet.opportunity_contract) ??
    {};
  return Boolean(
    packet.baseline_ref ??
    liquidity.baseline_ref ??
    opportunity.baseline_ref ??
    listField(packet, "baseline_refs").length,
  );
}

function floatValue(...values: unknown[]): number {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
}

export function altEcptBridgeReport(
  packetInput: JsonRecord,
  profile = "development",
): JsonRecord {
  const packet = packetInput ?? {};
  const id = packetId(packet);
  const liquidity = record(packet.liquidity_certificate);
  const token = record(packet.token);
  const negative = record(packet.negative_liquidity_certificate);
  const residuals: JsonRecord[] = [];
  const candidateOnlyReasons: string[] = [];
  const settledBlockers: string[] = [];

  if (Object.keys(liquidity).length === 0) {
    residuals.push(bridgeResidual(id, "missing_liquidity_certificate", true));
    settledBlockers.push("missing liquidity certificate");
  }
  if (!hasCostUpperBounds(packet, liquidity)) {
    residuals.push(bridgeResidual(id, "missing_cost_upper_bounds", true));
    settledBlockers.push("missing cost upper bounds");
  }
  const scope = transportScope(packet, liquidity);
  if (scope.length === 0) {
    residuals.push(bridgeResidual(id, "missing_transport_scope", true));
    settledBlockers.push("missing transport scope");
  }
  if (!hasBaseline(packet, liquidity)) {
    residuals.push(bridgeResidual(id, "missing_baseline", true));
    settledBlockers.push("missing baseline");
  }
  const hazard =
    listField(packet, "hazard_envelope").length > 0
      ? listField(packet, "hazard_envelope")
      : listField(record(liquidity.hazard_envelope_certificate), "hazard_refs");
  if (hazard.length === 0) {
    residuals.push(bridgeResidual(id, "missing_hazard_envelope", true));
    settledBlockers.push("missing hazard envelope");
  }
  const receiver =
    listField(packet, "receiver_family").length > 0
      ? listField(packet, "receiver_family")
      : listField(token, "receiver_family");
  if (receiver.length === 0) {
    residuals.push(bridgeResidual(id, "missing_receiver_admissibility", true));
    settledBlockers.push("missing receiver admissibility");
  }

  const valueBridge = record(liquidity.value_bridge_report);
  const valueLevel = String(
    liquidity.value_evidence_level ??
      packet.value_evidence_level ??
      valueBridge.value_evidence_level ??
      "candidate",
  ).toLowerCase();
  const proxyOnly =
    valueLevel === "proxy-only" || valueBridge.proxy_only === true;
  if (proxyOnly) {
    candidateOnlyReasons.push(
      "proxy-only value evidence cannot increase safe capital",
    );
    residuals.push(bridgeResidual(id, "proxy_only_value_evidence", false));
  }

  const negativeSignal =
    Object.keys(negative).length > 0 ||
    String(packet.alt_status ?? "")
      .toLowerCase()
      .includes("negative");
  if (negativeSignal) {
    residuals.push(bridgeResidual(id, "negative_liquidity_preserved", true));
    settledBlockers.push("negative liquidity signal preserved");
  }

  const accepted = Object.keys(packet).length > 0;
  const surplusLower = floatValue(
    liquidity.signed_surplus_lower_bound,
    liquidity.downstream_search_cost_reduction_lower_bound,
    packet.signed_surplus_lower_bound,
  );
  const surplusUpper = floatValue(
    liquidity.signed_surplus_upper_bound,
    liquidity.downstream_search_cost_reduction_upper_bound,
    packet.signed_surplus_upper_bound,
    surplusLower,
  );
  const capitalBlockers = dedupeSorted([
    ...settledBlockers,
    ...candidateOnlyReasons,
    ...(Object.keys(liquidity).length > 0 &&
    !negativeSignal &&
    surplusLower <= 0
      ? ["nonpositive_signed_surplus_lower_bound"]
      : []),
  ]);
  const capitalAdmitted =
    accepted && capitalBlockers.length === 0 && surplusLower > 0;
  const status = negativeSignal
    ? "negative_liquidity"
    : capitalAdmitted
      ? "capital_admitted"
      : Object.keys(liquidity).length === 0 && Object.keys(packet).length === 0
        ? "diagnostic"
        : "candidate";
  return {
    accepted,
    alt_status: status,
    capital_admission_blockers: capitalBlockers,
    capital_admitted: capitalAdmitted,
    candidate_only_reasons: dedupeSorted(candidateOnlyReasons),
    ecpt_contribution: {
      hazard_envelope: dedupeSorted(hazard),
      liquidity_debt: residuals.map((item) => String(item.kind)),
      liquidity_lower_bound: capitalAdmitted ? surplusLower : null,
      phase_components: {
        alt_bridge_candidate: Boolean(id),
        receiver_scope_present: receiver.length > 0,
        transport_scope_present: scope.length > 0,
      },
      receiver_admissibility: dedupeSorted(receiver),
      settlement_latency: null,
      transport_scope: dedupeSorted(scope),
    },
    non_claims: NON_CLAIMS,
    ok: true,
    packet_id: id,
    profile,
    residuals,
    schema_version: "pic.alt_ecpt_bridge.v1",
    settled: false,
    settled_blockers: dedupeSorted(settledBlockers),
    signed_surplus_lower_bound: surplusLower,
    signed_surplus_upper_bound: surplusUpper,
  };
}

function deepGet(data: JsonRecord, path: string): unknown {
  let current: unknown = data;
  for (const part of path.split(".")) {
    const currentRecord = optionalRecord(current);
    if (!currentRecord) return undefined;
    current = currentRecord[part];
  }
  return current;
}

function optionalFloat(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function sqotResidual(kind: string, blocking: boolean): JsonRecord {
  return {
    blocking,
    description: kind.replaceAll("_", " "),
    kind,
    residual_id: `sqot:${shortHash(kind)}`,
  };
}

export function diagnoseSqotQueueState(state: JsonRecord): JsonRecord {
  const reserveAvailable = optionalFloat(
    deepGet(state, "diagnostic_reserve.available"),
    deepGet(state, "diagnostic_reserve_available"),
    deepGet(state, "reserve_available"),
  );
  const reserveMin = optionalFloat(
    deepGet(state, "diagnostic_reserve.required_min"),
    deepGet(state, "diagnostic_reserve_required"),
    deepGet(state, "required_min"),
  );
  const reserveMax = optionalFloat(
    deepGet(state, "diagnostic_reserve.required_max"),
    deepGet(state, "required_max"),
  );
  const inflow = optionalFloat(
    deepGet(state, "verifier_capacity.inflow"),
    deepGet(state, "queue.inflow"),
    deepGet(state, "inflow"),
  );
  const service = optionalFloat(
    deepGet(state, "verifier_capacity.service"),
    deepGet(state, "queue.service"),
    deepGet(state, "service"),
  );
  const metaScore = optionalFloat(
    deepGet(state, "meta_occupation.score"),
    deepGet(state, "meta_occupation"),
  );
  const quarantineLoad = optionalFloat(
    deepGet(state, "quarantine.load"),
    deepGet(state, "quarantine_load"),
  );
  const residuals: JsonRecord[] = [];
  const blocking: string[] = [];

  let reserveStatus = "unknown";
  if (reserveAvailable === null || reserveMin === null) {
    residuals.push(sqotResidual("missing_diagnostic_reserve", true));
    blocking.push("missing diagnostic reserve data");
  } else if (reserveAvailable < reserveMin) {
    reserveStatus = "below_band";
    residuals.push(sqotResidual("diagnostic_reserve_below_band", true));
    blocking.push("diagnostic reserve below required band");
  } else if (reserveMax !== null && reserveAvailable > reserveMax) {
    reserveStatus = "above_band";
    residuals.push(sqotResidual("diagnostic_reserve_above_band", false));
  } else {
    reserveStatus = "within_band";
  }

  let capacityRatio: number | null = null;
  let capacityStatus = "unknown";
  if (inflow === null || service === null) {
    residuals.push(sqotResidual("missing_verifier_capacity", true));
    blocking.push("missing verifier capacity data");
  } else if (service <= 0) {
    capacityStatus = "inadequate";
    residuals.push(sqotResidual("verifier_service_nonpositive", true));
    blocking.push("verifier service capacity is nonpositive");
  } else {
    capacityRatio = inflow / service;
    capacityStatus = capacityRatio <= 1 ? "adequate" : "inadequate";
    if (capacityRatio > 1) {
      residuals.push(sqotResidual("verifier_queue_overloaded", true));
      blocking.push("verifier queue inflow exceeds service");
    }
  }

  let metaStatus = "unknown";
  if (metaScore === null) {
    residuals.push(sqotResidual("missing_meta_occupation", false));
  } else {
    metaStatus = metaScore > 1 ? "over_band" : "within_band";
    if (metaScore > 1) {
      residuals.push(sqotResidual("meta_occupation_over_band", true));
      blocking.push("meta occupation is over band");
    }
  }

  let quarantineStatus = "unknown";
  if (quarantineLoad !== null) {
    quarantineStatus = quarantineLoad > 1 ? "overloaded" : "within_band";
    if (quarantineLoad > 1) {
      residuals.push(sqotResidual("quarantine_overloaded", true));
      blocking.push("quarantine overloaded");
    }
  }

  const scalarOnly =
    ("queue_score" in state || "score" in state) &&
    (reserveAvailable === null || inflow === null || service === null);
  if (scalarOnly) {
    residuals.push(sqotResidual("scalar_queue_score_incomplete", true));
    blocking.push("single scalar queue score omits mandatory SQOT coordinates");
  }

  let queueStatus = "ok";
  if (capacityStatus === "inadequate") queueStatus = "overloaded";
  else if (reserveStatus === "below_band") queueStatus = "reserve_low";
  else if (reserveStatus === "above_band") queueStatus = "diagnostic";
  else if (metaStatus === "over_band") queueStatus = "meta_occupied";
  else if (quarantineStatus === "overloaded")
    queueStatus = "quarantine_overloaded";
  else if (residuals.length > 0) queueStatus = "diagnostic";

  const repairTasks: JsonRecord[] = [];
  if (
    residuals.some((item) =>
      ["verifier_queue_overloaded", "missing_verifier_capacity"].includes(
        String(item.kind),
      ),
    )
  ) {
    repairTasks.push(
      ccrTask({
        kind: "verifier_route",
        title: "Repair verifier queue route",
        objective:
          "Route verifier capacity diagnostics without treating unknown budget as zero.",
        sourceId: "sqot:verifier-capacity",
        profile: "development",
        priority: 75,
        role: "scheduler",
        residualInputs: residuals.map((item) => String(item.kind)),
      }),
    );
  }
  if (residuals.length > 0) {
    repairTasks.push(
      ccrTask({
        kind: "sqot_queue_repair",
        title: "Repair SQOT queue ledger",
        objective:
          "Supply missing SQOT queue, reserve, meta-occupation, and quarantine ledgers.",
        sourceId: "sqot:queue-report",
        profile: "development",
        priority: 70,
        role: "scheduler",
        residualInputs: residuals.map((item) => String(item.kind)),
      }),
    );
  }

  return {
    blocking_residuals: dedupeSorted(blocking),
    diagnostic_reserve: {
      available: reserveAvailable,
      required_max: reserveMax,
      required_min: reserveMin,
      status: reserveStatus,
    },
    meta_occupation: { score: metaScore, status: metaStatus },
    ok: true,
    queue_status: queueStatus,
    repair_tasks: repairTasks,
    residuals,
    schema_version: "pic.sqot_queue_report.v1",
    verifier_capacity: {
      capacity_ratio: capacityRatio,
      inflow,
      service,
      status: capacityStatus,
    },
  };
}

function traceResidual(
  traceId: string,
  stepId: string,
  kind: string,
  blocking: boolean,
): JsonRecord {
  return {
    blocking,
    description: kind.replaceAll("_", " "),
    kind,
    residual_id: `trc:${shortHash([traceId, stepId, kind])}`,
    step_id: stepId,
  };
}

function traceSteps(trace: JsonRecord): JsonRecord[] {
  for (const key of ["steps", "events", "tool_calls", "calls", "trace"]) {
    const value = trace[key];
    if (Array.isArray(value)) return records(value);
  }
  return [trace];
}

export function traceNormalFormReport(trace: JsonRecord): JsonRecord {
  const rawSteps = traceSteps(trace);
  const steps: JsonRecord[] = [];
  const residuals: JsonRecord[] = [];
  const traceId = String(trace.trace_id ?? trace.id ?? "agent-trace");
  for (const [index, raw] of rawSteps.entries()) {
    const stepId = String(raw.step_id ?? raw.event_id ?? `step:${index}`);
    const actionType = String(
      raw.action_type ?? raw.action_kind ?? raw.type ?? "tool-call",
    );
    const toolCall = String(
      raw.tool_call ?? raw.tool_name ?? raw.tool ?? raw.name ?? "",
    );
    const stepResiduals: JsonRecord[] = [];
    if (!raw.witness && !raw.evidence_refs && !raw.output_ref) {
      stepResiduals.push(
        traceResidual(traceId, stepId, "missing_step_witness", false),
      );
    }
    if (!raw.authority_envelope && !raw.authority_status) {
      stepResiduals.push(
        traceResidual(traceId, stepId, "missing_authority_envelope", true),
      );
    }
    if (!raw.rollback_escrow_obligation && !raw.rollback_status) {
      stepResiduals.push(
        traceResidual(
          traceId,
          stepId,
          "missing_rollback_escrow_obligation",
          false,
        ),
      );
    }
    if (!raw.resource_use && !raw.resource_ledger) {
      stepResiduals.push(
        traceResidual(traceId, stepId, "missing_resource_ledger", false),
      );
    }
    if (!raw.tolerance_ledger && !raw.tolerance_budget) {
      stepResiduals.push(
        traceResidual(traceId, stepId, "missing_tolerance_ledger", false),
      );
    }
    residuals.push(...stepResiduals);
    steps.push({
      action_type: actionType,
      actuator_class: raw.actuator_class,
      authority_envelope: raw.authority_envelope ?? {
        status: String(raw.authority_status ?? "missing"),
      },
      emergency_stop: raw.emergency_stop,
      hazard_envelope: raw.hazard_envelope ?? raw.hazard_envelope_certificate,
      human_operator_authority: raw.human_operator_authority,
      causal_schedule_block: raw.causal_schedule_block,
      certificate_version_refs: listField(raw, "certificate_version_refs"),
      clock_cell: raw.clock_cell,
      input_ref: String(
        raw.input_ref ?? digest(raw.input ?? raw.arguments ?? {}),
      ),
      output_ref: String(
        raw.output_ref ?? digest(raw.output ?? raw.result ?? {}),
      ),
      observation_window: raw.observation_window,
      physical_domain_profile: raw.physical_domain_profile,
      postcondition: raw.postcondition ?? {},
      precondition: raw.precondition ?? {},
      provider_target: raw.provider_target,
      runtime_assurance_certificate:
        raw.runtime_assurance_certificate ?? raw.shield_certificate,
      residuals: stepResiduals,
      resource_use: raw.resource_use ?? raw.resource_ledger ?? null,
      rollback_escrow_obligation: raw.rollback_escrow_obligation ?? {
        status: String(raw.rollback_status ?? "missing"),
      },
      side_effect_policy: raw.side_effect_policy,
      step_id: stepId,
      tolerance_ledger: raw.tolerance_ledger ?? raw.tolerance_budget ?? null,
      tool_call: toolCall,
      validity_domain: raw.validity_domain,
    });
  }
  return {
    accepted: steps.length > 0,
    finite: true,
    non_claims: NON_CLAIMS,
    ok: true,
    residuals,
    schema_version: "pic.trc_trace_nf.v1",
    settled: false,
    trace_id: traceId,
    trc_trace_nf: {
      evaluation_clock:
        trace.evaluation_clock ??
        trace.operation_evaluation_clock ??
        trace.reference_time,
      fixture_mode: trace.fixture_mode === true,
      provider_target: trace.provider_target,
      side_effect_policy: trace.side_effect_policy,
      steps,
      validity_domain: trace.validity_domain,
    },
  };
}

const ACTIVE_AUTHORITY_STATUSES = new Set(["active", "approved"]);
const AUTHORITY_RESIDUAL_KINDS = new Set([
  "authority_issuer_untrusted",
  "authority_scope_mismatch",
  "authority_status_not_active",
  "authority_time_unknown",
  "expired_authority_envelope",
  "fixture_only_authority_non_executable",
  "missing_authority_envelope",
]);
const CORE_OPERATION_BLOCKERS = new Set([
  ...AUTHORITY_RESIDUAL_KINDS,
  "missing_resource_ledger",
  "missing_rollback_escrow_obligation",
  "missing_steps",
  "missing_step_witness",
  "missing_tolerance_ledger",
]);
const OPERATION_GATE_KINDS: Record<string, Set<string>> = {
  capability_gate: new Set(["missing_step_witness", "missing_steps"]),
  resource_gate: new Set(["missing_resource_ledger"]),
  rollback_gate: new Set(["missing_rollback_escrow_obligation"]),
  tolerance_gate: new Set(["missing_tolerance_ledger"]),
};
const PHYSICAL_PROFILE_FIELDS: Record<string, string> = {
  actuator_class: "physical actuator class",
  emergency_stop: "emergency stop or abort route",
  hazard_envelope: "hazard envelope",
  human_operator_authority: "human/operator authority",
  observation_window: "observation window",
  physical_domain_profile: "physical domain profile",
  rollback_escrow: "rollback/escrow",
  runtime_assurance_certificate: "runtime assurance or shield certificate",
};

function contextValue(
  traceNf: JsonRecord,
  nf: JsonRecord,
  providerProfile: JsonRecord,
  ...keys: string[]
): unknown {
  for (const key of keys) {
    const value = providerProfile[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  for (const key of keys) {
    const value = nf[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  for (const key of keys) {
    const value = traceNf[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function boolContext(
  traceNf: JsonRecord,
  nf: JsonRecord,
  providerProfile: JsonRecord,
  ...keys: string[]
): boolean {
  const value = contextValue(traceNf, nf, providerProfile, ...keys);
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "fixture", "fixture-only"].includes(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );
}

function sideEffectPolicy(
  traceNf: JsonRecord,
  nf: JsonRecord,
  providerProfile: JsonRecord,
): string {
  return String(
    contextValue(
      traceNf,
      nf,
      providerProfile,
      "side_effect_policy",
      "default_side_effect_policy",
    ) ?? "none_without_execute_flag",
  );
}

function parseTime(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  const text = String(value).trim();
  if (!text) return undefined;
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function status(value: unknown): string {
  const asRecord = optionalRecord(value);
  return String(asRecord?.status ?? value ?? "")
    .trim()
    .toLowerCase();
}

function statusOk(value: unknown, allowed: Set<string>): boolean {
  return allowed.has(status(value));
}

function freshUntil(value: JsonRecord, reference: Date | undefined): boolean {
  if (!reference) return false;
  const expiry = parseTime(value.expires_at ?? value.fresh_until);
  return Boolean(expiry && expiry.getTime() > reference.getTime());
}

function certificateFresh(
  value: unknown,
  reference: Date | undefined,
): boolean {
  const cert = record(value);
  const certStatus = status(cert);
  if (["fresh", "recomputed"].includes(certStatus)) return true;
  if (
    ![
      "accepted",
      "approved",
      "available",
      "tested",
      "verified",
      "active",
    ].includes(certStatus)
  ) {
    return false;
  }
  return freshUntil(cert, reference) || cert.fresh === true;
}

function referenceTime(
  traceNf: JsonRecord,
  nf: JsonRecord,
  providerProfile: JsonRecord,
): Date | undefined {
  for (const value of [
    contextValue(
      traceNf,
      nf,
      providerProfile,
      "operation_evaluation_clock",
      "evaluation_clock",
      "reference_time",
      "checked_at",
    ),
    deepGet(nf, "clock_cell.evaluation_time"),
    deepGet(nf, "clock_cell.reference_time"),
  ]) {
    const parsed = parseTime(value);
    if (parsed) return parsed;
  }
  for (const step of records(nf.steps)) {
    const clockCell = record(step.clock_cell);
    for (const key of [
      "operation_evaluation_clock",
      "evaluation_time",
      "reference_time",
      "wall_time",
    ]) {
      const parsed = parseTime(clockCell[key]);
      if (parsed) return parsed;
    }
  }
  return undefined;
}

function scopeTokens(value: unknown): Set<string> {
  const tokens = new Set<string>();
  if (value === undefined || value === null || value === "") return tokens;
  if (Array.isArray(value)) {
    for (const item of value) {
      for (const token of scopeTokens(item)) tokens.add(token);
    }
  } else if (typeof value === "object") {
    for (const [key, item] of Object.entries(value as JsonRecord)) {
      if (item === undefined || item === null || item === "") continue;
      tokens.add(String(item).trim().toLowerCase());
      tokens.add(`${key}:${String(item)}`.trim().toLowerCase());
    }
  } else {
    tokens.add(String(value).trim().toLowerCase());
  }
  tokens.delete("");
  return tokens;
}

function authorityScopeTokens(authority: JsonRecord): Set<string> {
  const tokens = new Set<string>();
  for (const key of [
    "scope",
    "scopes",
    "validity_domain",
    "validity_domains",
    "provider_target",
    "provider_targets",
    "provider",
    "providers",
  ]) {
    for (const token of scopeTokens(authority[key])) tokens.add(token);
  }
  return tokens;
}

function scopeMatches(authority: JsonRecord, required: Set<string>): boolean {
  if (required.size === 0) return true;
  const authorityTokens = authorityScopeTokens(authority);
  if (authorityTokens.has("*")) return true;
  return [...required].every((token) => authorityTokens.has(token));
}

function gate(ok: boolean, residuals: JsonRecord[], note = ""): JsonRecord {
  return {
    ok,
    note,
    residual_kinds: dedupeSorted(
      residuals.map((item) => String(item.kind ?? "")).filter(Boolean),
    ),
  };
}

function withinNumericBudget(usage: JsonRecord, limit: JsonRecord): boolean {
  if (Object.keys(usage).length === 0 || Object.keys(limit).length === 0) {
    return true;
  }
  for (const [key, value] of Object.entries(usage)) {
    if (!(key in limit)) continue;
    const used = optionalFloat(value);
    const allowed = optionalFloat(limit[key]);
    if (used !== null && allowed !== null && used > allowed) return false;
  }
  return true;
}

function toleranceWithinBudget(tolerance: JsonRecord): boolean {
  if (Object.keys(tolerance).length === 0) return true;
  for (const [key, value] of Object.entries(tolerance)) {
    if (key.endsWith("_budget")) continue;
    const budget = tolerance[`${key}_budget`] ?? tolerance.budget;
    const observed = optionalFloat(value);
    const allowed = optionalFloat(budget);
    if (observed !== null && allowed !== null && observed > allowed) {
      return false;
    }
  }
  return true;
}

function lifecycleFresh(
  providerProfile: JsonRecord,
  reference: Date | undefined,
): boolean {
  const cert = record(
    providerProfile.lifecycle_certificate ??
      providerProfile.certificate_lifecycle,
  );
  if (Object.keys(cert).length === 0) {
    return providerProfile.lifecycle_recomputed === true;
  }
  return certificateFresh(cert, reference);
}

function physicalDispatchResiduals(
  traceId: string,
  providerProfile: JsonRecord,
  reference: Date | undefined,
  policy: string,
): JsonRecord[] {
  const residuals: JsonRecord[] = [];
  const physicalDomain = record(providerProfile.physical_domain_profile);
  const actuatorClass = String(providerProfile.actuator_class ?? "");
  const allowedActuators = new Set([
    ...listField(providerProfile, "allowed_actuator_classes"),
    ...listField(physicalDomain, "allowed_actuator_classes"),
  ]);
  const checks: Array<[boolean, string]> = [
    [
      statusOk(physicalDomain, new Set(["accepted", "approved"])),
      "physical_profile_not_accepted",
    ],
    [
      allowedActuators.size === 0 || allowedActuators.has(actuatorClass),
      "actuator_class_not_allowed",
    ],
    [
      statusOk(
        record(providerProfile.human_operator_authority),
        new Set(["approved", "active"]),
      ) &&
        freshUntil(record(providerProfile.human_operator_authority), reference),
      "human_operator_authority_not_approved",
    ],
    [
      statusOk(
        record(providerProfile.emergency_stop),
        new Set(["accepted", "tested", "available"]),
      ),
      "emergency_stop_not_tested",
    ],
    [
      certificateFresh(
        providerProfile.runtime_assurance_certificate,
        reference,
      ) &&
        ["accepted", "fresh", "approved"].includes(
          status(providerProfile.runtime_assurance_certificate),
        ),
      "runtime_assurance_certificate_not_accepted",
    ],
    [
      !(
        providerProfile.requires_shield_certificate ||
        providerProfile.shield_certificate
      ) ||
        (certificateFresh(providerProfile.shield_certificate, reference) &&
          ["accepted", "fresh", "approved"].includes(
            status(providerProfile.shield_certificate),
          )),
      "shield_certificate_not_accepted",
    ],
    [
      statusOk(
        record(providerProfile.rollback_escrow),
        new Set(["available", "verified"]),
      ),
      "rollback_escrow_not_verified",
    ],
    [
      certificateFresh(
        providerProfile.hazard_envelope ??
          providerProfile.hazard_envelope_certificate,
        reference,
      ) &&
        ["accepted", "fresh", "approved"].includes(
          status(
            providerProfile.hazard_envelope ??
              providerProfile.hazard_envelope_certificate,
          ),
        ),
      "hazard_envelope_not_accepted",
    ],
    [
      record(providerProfile.observation_window).has_verifier === true ||
        statusOk(
          record(providerProfile.observation_window).verifier,
          new Set(["accepted", "approved", "active"]),
        ),
      "observation_verifier_required",
    ],
    [
      withinNumericBudget(
        record(providerProfile.resource_use),
        record(providerProfile.resource_limit),
      ),
      "resource_use_exceeds_profile",
    ],
    [
      toleranceWithinBudget(record(providerProfile.tolerance_ledger)),
      "tolerance_budget_exceeded",
    ],
    [lifecycleFresh(providerProfile, reference), "lifecycle_certificate_stale"],
    [
      [
        "physical_provider_allowed",
        "provider_physical_allowed",
        "controlled_physical_allowed",
      ].includes(policy),
      "side_effect_policy_not_dispatchable",
    ],
    [
      providerProfile.requires_mcp_tool !== true ||
        providerProfile.mcp_tool_gate_accepted === true,
      "mcp_tool_gate_not_accepted",
    ],
    [
      providerProfile.requires_a2a_agent !== true ||
        providerProfile.a2a_agent_gate_accepted === true,
      "a2a_agent_gate_not_accepted",
    ],
  ];
  for (const [ok, kind] of checks) {
    if (!ok) {
      residuals.push(traceResidual(traceId, "physical-dispatch", kind, true));
    }
  }
  return residuals;
}

function authorityResiduals(
  traceId: string,
  traceNf: JsonRecord,
  nf: JsonRecord,
  providerProfile: JsonRecord,
): JsonRecord[] {
  const output: JsonRecord[] = [];
  const steps = records(nf.steps);
  const policy = sideEffectPolicy(traceNf, nf, providerProfile);
  const fixtureDryRun =
    boolContext(traceNf, nf, providerProfile, "fixture_mode") &&
    policy === "dry_run_only";
  const reference = referenceTime(traceNf, nf, providerProfile);
  const trustedIssuers = new Set(listField(providerProfile, "trusted_issuers"));
  const providerTargetTokens = scopeTokens(
    contextValue(traceNf, nf, providerProfile, "provider_target", "provider"),
  );

  for (const step of steps) {
    const stepId = String(step.step_id ?? "step");
    const authority = record(step.authority_envelope);
    if (
      Object.keys(authority).length === 0 ||
      String(authority.status ?? "").toLowerCase() === "missing"
    ) {
      continue;
    }
    const status = String(authority.status ?? "").toLowerCase();
    if (!ACTIVE_AUTHORITY_STATUSES.has(status)) {
      output.push(
        traceResidual(traceId, stepId, "authority_status_not_active", true),
      );
    }
    const issuer = String(authority.issuer ?? "");
    if (trustedIssuers.size > 0 && !trustedIssuers.has(issuer)) {
      output.push(
        traceResidual(traceId, stepId, "authority_issuer_untrusted", true),
      );
    }
    const expiresAt = authority.expires_at;
    if (expiresAt === undefined || expiresAt === null || expiresAt === "") {
      if (!fixtureDryRun) {
        output.push(
          traceResidual(traceId, stepId, "authority_time_unknown", true),
        );
      }
    } else {
      const expiry = parseTime(expiresAt);
      if (!expiry) {
        output.push(
          traceResidual(traceId, stepId, "authority_time_unknown", true),
        );
      } else if (!reference) {
        if (!fixtureDryRun) {
          output.push(
            traceResidual(traceId, stepId, "authority_time_unknown", true),
          );
        }
      } else if (expiry.getTime() <= reference.getTime()) {
        output.push(
          traceResidual(traceId, stepId, "expired_authority_envelope", true),
        );
      }
      if (String(expiresAt) === FIXED_CREATED_AT && fixtureDryRun) {
        output.push(
          traceResidual(
            traceId,
            stepId,
            "fixture_only_authority_non_executable",
            true,
          ),
        );
      }
    }
    const requiredScope = new Set([
      ...scopeTokens(step.validity_domain),
      ...providerTargetTokens,
    ]);
    if (!scopeMatches(authority, requiredScope)) {
      output.push(
        traceResidual(traceId, stepId, "authority_scope_mismatch", true),
      );
    }
  }
  return output;
}

function gateResiduals(
  residuals: JsonRecord[],
  kinds: Set<string>,
): JsonRecord[] {
  return residuals.filter((item) => kinds.has(String(item.kind ?? "")));
}

export function traceCheckReport(traceNf: JsonRecord): JsonRecord {
  const nf = optionalRecord(traceNf.trc_trace_nf) ?? traceNf;
  const steps = records(nf.steps);
  const residuals = steps.flatMap((step) => records(step.residuals));
  const traceId = String(traceNf.trace_id ?? nf.trace_id ?? "trace");
  if (steps.length === 0) {
    residuals.push(traceResidual(traceId, "trace", "missing_steps", true));
  }
  residuals.push(...authorityResiduals(traceId, traceNf, nf, {}));
  const missingAuthority = residuals.some(
    (item) => item.kind === "missing_authority_envelope",
  );
  const missingResource = residuals.some(
    (item) => item.kind === "missing_resource_ledger",
  );
  const missingRollback = residuals.some(
    (item) => item.kind === "missing_rollback_escrow_obligation",
  );
  const missingTolerance = residuals.some(
    (item) => item.kind === "missing_tolerance_ledger",
  );
  const executionBlockers = dedupeSorted(
    residuals
      .map((item) => String(item.kind ?? ""))
      .filter((kind) => CORE_OPERATION_BLOCKERS.has(kind)),
  );
  const executionAvailable = steps.length > 0 && executionBlockers.length === 0;
  const policy = sideEffectPolicy(traceNf, nf, {});
  const authorityGateResiduals = gateResiduals(
    residuals,
    AUTHORITY_RESIDUAL_KINDS,
  );
  return {
    accepted:
      steps.length > 0 && !residuals.some((item) => item.blocking === true),
    execution_available: executionAvailable,
    execution_blockers: executionBlockers,
    missing_obligations: residuals.map((item) => String(item.kind)),
    ok: true,
    real_world_operation_gate: {
      authority_gate: gate(
        authorityGateResiduals.length === 0,
        authorityGateResiduals,
      ),
      executed: false,
      operation_ready: executionAvailable,
      physical_dispatch_ready: false,
      provider_dispatch_ready: false,
      requires_explicit_authority: true,
      requires_provider_config: true,
      safe_commands_are_authority: false,
      side_effect_policy: policy,
    },
    residuals,
    schema_version: "pic.trc_trace_report.v1",
    settled: false,
    status: residuals.length > 0 ? "diagnostic" : "provisional",
    trace_id: traceId,
    trc_trace_nf: nf,
    warnings: [
      ...(missingResource
        ? ["missing resource ledger blocks resource/tolerance claims"]
        : []),
      ...(missingRollback
        ? ["missing rollback/escrow blocks real-world operation claims"]
        : []),
      ...(missingTolerance
        ? ["missing tolerance ledger blocks TRC operation claims"]
        : []),
      ...(missingAuthority
        ? ["missing authority envelope blocks operation claims"]
        : []),
      ...(authorityGateResiduals.length > 0
        ? ["authority freshness/scope/trust blocks operation claims"]
        : []),
    ],
  };
}

export function operationGateReport(
  traceNf: JsonRecord,
  providerProfileInput: JsonRecord = {},
): JsonRecord {
  const providerProfile = providerProfileInput ?? {};
  const nf = optionalRecord(traceNf.trc_trace_nf) ?? traceNf;
  const steps = records(nf.steps);
  const traceId = String(traceNf.trace_id ?? nf.trace_id ?? "trace");
  const checked = traceCheckReport(traceNf);
  const baseResiduals = records(checked.residuals).filter(
    (item) => !AUTHORITY_RESIDUAL_KINDS.has(String(item.kind ?? "")),
  );
  const residuals = [
    ...baseResiduals,
    ...authorityResiduals(traceId, traceNf, nf, providerProfile),
  ];
  const policy = sideEffectPolicy(traceNf, nf, providerProfile);
  const fixtureDryRun =
    boolContext(traceNf, nf, providerProfile, "fixture_mode") &&
    policy === "dry_run_only";
  const reference = referenceTime(traceNf, nf, providerProfile);

  if (!fixtureDryRun) {
    if (steps.some((step) => !record(step).causal_schedule_block)) {
      residuals.push(
        traceResidual(
          traceId,
          "operation",
          "missing_causal_schedule_block",
          true,
        ),
      );
    }
    const hasHazard = Boolean(
      providerProfile.hazard_envelope ??
      providerProfile.hazard_envelope_certificate ??
      steps.find(
        (step) =>
          record(step).hazard_envelope ??
          record(step).hazard_envelope_certificate,
      ),
    );
    if (!hasHazard) {
      residuals.push(
        traceResidual(traceId, "operation", "missing_hazard_envelope", true),
      );
    }
    const hasLifecycle = Boolean(
      providerProfile.certificate_version_refs ??
      steps.find(
        (step) =>
          listField(record(step), "certificate_version_refs").length > 0,
      ),
    );
    if (!hasLifecycle) {
      residuals.push(
        traceResidual(
          traceId,
          "operation",
          "missing_certificate_lifecycle",
          true,
        ),
      );
    }
  }

  const operationBlockerKinds = new Set([
    ...CORE_OPERATION_BLOCKERS,
    "missing_causal_schedule_block",
    "missing_certificate_lifecycle",
    "missing_hazard_envelope",
  ]);
  const executionBlockers = dedupeSorted(
    residuals
      .map((item) => String(item.kind ?? ""))
      .filter((kind) => operationBlockerKinds.has(kind)),
  );
  const operationReady = steps.length > 0 && executionBlockers.length === 0;
  const providerDispatchReady =
    operationReady &&
    !fixtureDryRun &&
    !["dry_run_only", "none", "none_without_execute_flag"].includes(policy) &&
    providerProfile.allow_execute === true &&
    providerProfile.explicit_execute === true;
  const physicalRequested = Boolean(
    providerProfile.physical_dispatch_requested ??
    providerProfile.physical_domain_profile ??
    providerProfile.actuator_class,
  );
  const physicalMissing: JsonRecord[] = [];
  if (physicalRequested) {
    for (const [key, label] of Object.entries(PHYSICAL_PROFILE_FIELDS)) {
      if (!providerProfile[key]) {
        physicalMissing.push({
          ...traceResidual(
            traceId,
            "physical-dispatch",
            `missing_${key}`,
            true,
          ),
          description: `missing ${label}`,
        });
      }
    }
    physicalMissing.push(
      ...physicalDispatchResiduals(traceId, providerProfile, reference, policy),
    );
  }
  const physicalDispatchReady =
    providerDispatchReady && physicalRequested && physicalMissing.length === 0;
  const authorityGateResiduals = gateResiduals(
    residuals,
    AUTHORITY_RESIDUAL_KINDS,
  );
  const capabilityResiduals = gateResiduals(
    residuals,
    OPERATION_GATE_KINDS.capability_gate ?? new Set(),
  );
  const resourceResiduals = gateResiduals(
    residuals,
    OPERATION_GATE_KINDS.resource_gate ?? new Set(),
  );
  const rollbackResiduals = gateResiduals(
    residuals,
    OPERATION_GATE_KINDS.rollback_gate ?? new Set(),
  );
  const toleranceResiduals = gateResiduals(
    residuals,
    OPERATION_GATE_KINDS.tolerance_gate ?? new Set(),
  );
  const hazardResiduals = gateResiduals(
    residuals,
    new Set(["missing_hazard_envelope"]),
  );
  const scheduleResiduals = gateResiduals(
    residuals,
    new Set(["missing_causal_schedule_block"]),
  );
  const lifecycleResiduals = gateResiduals(
    residuals,
    new Set(["missing_certificate_lifecycle"]),
  );
  const clockResiduals = gateResiduals(
    residuals,
    new Set(["authority_time_unknown"]),
  );
  const observationResiduals = gateResiduals(
    residuals,
    new Set(["missing_step_witness"]),
  );

  return {
    accepted: steps.length > 0,
    a2a_agent_gate: {
      ok:
        providerProfile.requires_a2a_agent !== true ||
        providerProfile.a2a_agent_gate_accepted === true,
      required: providerProfile.requires_a2a_agent === true,
    },
    authority_gate: gate(
      authorityGateResiduals.length === 0,
      authorityGateResiduals,
    ),
    capability_gate: gate(
      capabilityResiduals.length === 0,
      capabilityResiduals,
    ),
    clock_gate: gate(reference !== undefined || fixtureDryRun, clockResiduals),
    executed: false,
    execution_blockers: executionBlockers,
    hazard_gate: gate(hazardResiduals.length === 0, hazardResiduals),
    lifecycle_gate: gate(lifecycleResiduals.length === 0, lifecycleResiduals),
    mcp_tool_gate: {
      ok:
        providerProfile.requires_mcp_tool !== true ||
        providerProfile.mcp_tool_gate_accepted === true,
      required: providerProfile.requires_mcp_tool === true,
    },
    non_claims: [
      ...NON_CLAIMS,
      "operation_ready_is_not_executed",
      "physical_dispatch_ready_is_not_physical_outcome_proof",
    ],
    observation_gate: gate(
      observationResiduals.length === 0,
      observationResiduals,
    ),
    ok: true,
    operation_ready: operationReady,
    physical_dispatch_blockers: physicalMissing.map((item) =>
      String(item.kind),
    ),
    physical_dispatch_ready: physicalDispatchReady,
    provider_dispatch_ready: providerDispatchReady,
    residuals: [...residuals, ...physicalMissing],
    resource_gate: gate(resourceResiduals.length === 0, resourceResiduals),
    rollback_gate: gate(rollbackResiduals.length === 0, rollbackResiduals),
    schedule_gate: gate(scheduleResiduals.length === 0, scheduleResiduals),
    schema_version: "pic.trc_operation_gate_report.v1",
    settled: false,
    side_effect_policy: policy,
    tolerance_gate: gate(toleranceResiduals.length === 0, toleranceResiduals),
    trace_id: traceId,
    trc_trace_nf: nf,
  };
}

function reportResidual(
  prefix: string,
  subject: unknown,
  kind: string,
  blocking = true,
  description?: string,
): JsonRecord {
  return {
    blocking,
    description: description ?? kind.replaceAll("_", " "),
    kind,
    residual_id: `${prefix}:${shortHash([subject, kind])}`,
  };
}

function blockingKinds(residuals: JsonRecord[]): string[] {
  return dedupeSorted(
    residuals
      .filter((item) => item.blocking === true)
      .map((item) => String(item.kind ?? "")),
  );
}

function requiredResiduals(
  prefix: string,
  subject: unknown,
  data: JsonRecord,
  fields: string[],
): JsonRecord[] {
  return fields
    .filter((field) => {
      const value = data[field];
      return (
        value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0) ||
        (typeof value === "object" &&
          !Array.isArray(value) &&
          Object.keys(value as JsonRecord).length === 0)
      );
    })
    .map((field) => reportResidual(prefix, subject, `missing_${field}`));
}

function profileSettings(profile: string | JsonRecord): JsonRecord {
  const defaults: JsonRecord = {
    allowed_auth_scopes: ["read", "local", "local_fixture", "fixture"],
    allowed_egress_policies: ["none", "disabled", "allowlist"],
    allowed_side_effect_classes: ["read_only", "none", "diagnostic"],
    max_byte_limit: 1_000_000,
    max_timeout_budget: 30,
    require_descriptor_provenance: false,
    require_signature: false,
    trusted_server_statuses: ["trusted", "approved", "accepted"],
  };
  if (typeof profile === "object" && profile !== null) {
    return { ...defaults, profile: "custom", ...profile };
  }
  const normalized = String(profile || "development").toLowerCase();
  const strict = ["production", "adversarial"].includes(normalized);
  return {
    ...defaults,
    profile: normalized,
    require_descriptor_provenance: strict,
    require_signature: strict,
  };
}

function listAny(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return [];
  return Array.isArray(value)
    ? value.filter((item) => item !== undefined && item !== null).map(String)
    : [String(value)];
}

function lowerTokens(value: unknown): Set<string> {
  return new Set(listAny(value).map((item) => item.trim().toLowerCase()));
}

function dangerousText(value: unknown): boolean {
  const text = compactStringify(value).toLowerCase();
  return [
    "ignore previous",
    "system prompt",
    "developer message",
    "rm -rf",
    "powershell",
    "bash -lc",
    "curl ",
    "wget ",
    "ssh ",
    "http://",
    "https://",
    "subprocess",
    "exec(",
    "eval(",
  ].some((marker) => text.includes(marker));
}

function recordsAny(value: unknown): JsonRecord[] {
  return records(value);
}

export function mcpToolDescriptorReport(
  descriptorInput: JsonRecord,
  profile: string | JsonRecord = "development",
): JsonRecord {
  const descriptor = descriptorInput ?? {};
  const settings = profileSettings(profile);
  const serverId = String(descriptor.server_id ?? descriptor.server ?? "");
  const toolName = String(descriptor.tool_name ?? descriptor.name ?? "");
  const canonicalName = serverId && toolName ? `${serverId}/${toolName}` : "";
  const descriptorVersion = String(
    descriptor.descriptor_version ?? descriptor.version ?? "",
  );
  const serverStatus = String(
    descriptor.server_trust_status ?? descriptor.trust_status ?? "",
  ).toLowerCase();
  const sideEffectClass = String(
    descriptor.side_effect_class ?? "unknown",
  ).toLowerCase();
  const egressPolicy = String(
    descriptor.egress_policy ?? "unknown",
  ).toLowerCase();
  const authScope = listAny(descriptor.auth_scope ?? descriptor.auth_scopes);
  const subject = canonicalName || digest(descriptor);
  const residuals = requiredResiduals("mcp", subject, descriptor, [
    "server_id",
    "tool_name",
    "descriptor_version",
    "side_effect_class",
  ]);
  if (!lowerTokens(settings.trusted_server_statuses).has(serverStatus)) {
    residuals.push(reportResidual("mcp", subject, "server_trust_not_accepted"));
  }
  if (
    settings.require_descriptor_provenance === true &&
    !(descriptor.provenance || descriptor.signature)
  ) {
    residuals.push(
      reportResidual("mcp", subject, "descriptor_provenance_required"),
    );
  }
  if (settings.require_signature === true && !descriptor.signature) {
    residuals.push(
      reportResidual("mcp", subject, "descriptor_signature_required"),
    );
  }
  if (!lowerTokens(settings.allowed_side_effect_classes).has(sideEffectClass)) {
    residuals.push(
      reportResidual("mcp", subject, "side_effect_class_not_allowed"),
    );
  }
  if (!lowerTokens(settings.allowed_egress_policies).has(egressPolicy)) {
    residuals.push(reportResidual("mcp", subject, "egress_policy_not_allowed"));
  }
  const allowedScopes = lowerTokens(settings.allowed_auth_scopes);
  if (!authScope.every((token) => allowedScopes.has(token.toLowerCase()))) {
    residuals.push(reportResidual("mcp", subject, "auth_scope_not_allowed"));
  }
  const diagnostics: JsonRecord[] = [];
  const dangerousKeys = Object.keys(descriptor).filter((key) =>
    [
      "system_prompt",
      "developer_message",
      "secrets",
      "password",
      "shell",
      "exec",
    ].includes(key.toLowerCase()),
  );
  if (dangerousKeys.length > 0) {
    residuals.push({
      ...reportResidual("mcp", subject, "dangerous_metadata_fields"),
      fields: dangerousKeys.sort(),
    });
  }
  if (dangerousText(descriptor.description)) {
    diagnostics.push(
      reportResidual(
        "mcp",
        subject,
        "prompt_injection_bearing_description_risk",
        false,
      ),
    );
  }
  if (descriptor.descriptor_changed_after_approval === true) {
    residuals.push(
      reportResidual("mcp", subject, "descriptor_rug_pull_blocked"),
    );
  }
  const blockers = blockingKinds([...residuals, ...diagnostics]);
  const inputSchema = descriptor.input_schema ?? descriptor.inputSchema;
  const outputSchema = descriptor.output_schema ?? descriptor.outputSchema;
  return {
    accepted: blockers.length === 0,
    auth_scope: authScope,
    blockers,
    canonical_tool_name: canonicalName,
    descriptor_changed_after_approval:
      descriptor.descriptor_changed_after_approval === true,
    descriptor_hash: digest(descriptor),
    descriptor_version: descriptorVersion,
    egress_policy: egressPolicy,
    input_schema_hash: inputSchema ? digest(inputSchema) : null,
    non_claims: [
      ...NON_CLAIMS,
      "mcp_descriptor_is_candidate_evidence_not_execution_authority",
    ],
    ok: true,
    output_schema_hash: outputSchema ? digest(outputSchema) : null,
    profile: settings.profile,
    residuals: [...residuals, ...diagnostics].sort((a, b) =>
      String(a.kind).localeCompare(String(b.kind)),
    ),
    schema_version: "pic.mcp_tool_descriptor_report.v1",
    server_id: serverId,
    server_trust_status: serverStatus,
    settled: false,
    side_effect_class: sideEffectClass,
    tool_name: toolName,
  };
}

export function mcpToolInvocationPreflight(
  descriptor: JsonRecord,
  callInput: JsonRecord,
  profile: string | JsonRecord = "development",
): JsonRecord {
  const call = callInput ?? {};
  const descriptorReport = mcpToolDescriptorReport(descriptor, profile);
  const settings = profileSettings(profile);
  const canonical = String(descriptorReport.canonical_tool_name ?? "");
  const requested = String(
    call.canonical_tool_name ?? call.tool ?? call.tool_name ?? "",
  );
  const sideEffectClass = String(
    descriptorReport.side_effect_class ?? "unknown",
  ).toLowerCase();
  const residuals = records(descriptorReport.residuals).filter(
    (item) => item.blocking === true,
  );
  const subject = requested || canonical || digest(call);
  if (descriptorReport.accepted !== true) {
    residuals.push(
      reportResidual("mcp-call", subject, "descriptor_not_accepted"),
    );
  }
  if (
    canonical &&
    requested &&
    ![canonical, canonical.split("/").at(-1)].includes(requested)
  ) {
    residuals.push(
      reportResidual("mcp-call", subject, "canonical_tool_name_mismatch"),
    );
  }
  if (
    !["read_only", "none", "diagnostic"].includes(sideEffectClass) &&
    !call.approval_ref
  ) {
    residuals.push(
      reportResidual("mcp-call", subject, "per_call_approval_required"),
    );
  }
  if (!lowerTokens(settings.allowed_side_effect_classes).has(sideEffectClass)) {
    residuals.push(
      reportResidual("mcp-call", subject, "side_effect_class_not_allowed"),
    );
  }
  if (!call.output_redaction_policy) {
    residuals.push(
      reportResidual("mcp-call", subject, "output_redaction_policy_required"),
    );
  }
  if (call.trace_logging_enabled !== true) {
    residuals.push(
      reportResidual("mcp-call", subject, "trace_logging_required"),
    );
  }
  if (descriptorReport.descriptor_changed_after_approval === true) {
    residuals.push(
      reportResidual("mcp-call", subject, "descriptor_rug_pull_blocked"),
    );
  }
  if (call.tool_name_collision === true) {
    residuals.push(reportResidual("mcp-call", subject, "tool_name_collision"));
  }
  if (dangerousText(call.arguments ?? call.input ?? call)) {
    residuals.push(
      reportResidual("mcp-call", subject, "hidden_escalation_in_arguments"),
    );
  }
  const timeout = optionalFloat(call.timeout_budget);
  const byteLimit = optionalFloat(call.byte_limit);
  if (
    timeout !== null &&
    timeout > floatValue(settings.max_timeout_budget, 30)
  ) {
    residuals.push(
      reportResidual("mcp-call", subject, "timeout_budget_exceeded"),
    );
  }
  if (
    byteLimit !== null &&
    byteLimit > floatValue(settings.max_byte_limit, 1_000_000)
  ) {
    residuals.push(reportResidual("mcp-call", subject, "byte_limit_exceeded"));
  }
  const blockers = blockingKinds(residuals);
  return {
    blockers,
    canonical_tool_name: canonical,
    descriptor_report: descriptorReport,
    executed: false,
    invocation_ready: blockers.length === 0,
    network_call_performed: false,
    non_claims: [
      ...NON_CLAIMS,
      "mcp_invocation_preflight_is_not_tool_dispatch",
    ],
    ok: true,
    profile: settings.profile,
    requested_tool_name: requested,
    residuals: residuals.sort((a, b) =>
      String(a.kind).localeCompare(String(b.kind)),
    ),
    schema_version: "pic.mcp_tool_invocation_preflight.v1",
    settled: false,
  };
}

export function a2aAgentCardReport(
  cardInput: JsonRecord,
  profile: string | JsonRecord = "development",
): JsonRecord {
  const card = cardInput ?? {};
  const settings = profileSettings(profile);
  const agentId = String(card.agent_id ?? card.id ?? "");
  const residuals = requiredResiduals(
    "a2a-card",
    agentId || digest(card),
    card,
    ["agent_id", "endpoint", "task_schema", "declared_authority"],
  );
  const endpoint = record(card.endpoint);
  if (!(endpoint.provenance || endpoint.url)) {
    residuals.push(
      reportResidual("a2a-card", agentId, "endpoint_provenance_required"),
    );
  }
  if (settings.require_signature === true && !card.signature) {
    residuals.push(
      reportResidual("a2a-card", agentId, "agent_card_signature_required"),
    );
  }
  const blockers = blockingKinds(residuals);
  return {
    accepted: blockers.length === 0,
    agent_id: agentId,
    blockers,
    endpoint_hash: Object.keys(endpoint).length > 0 ? digest(endpoint) : null,
    non_claims: [
      ...NON_CLAIMS,
      "a2a_agent_card_is_not_delegated_tool_authority",
    ],
    ok: true,
    profile: settings.profile,
    residuals: residuals.sort((a, b) =>
      String(a.kind).localeCompare(String(b.kind)),
    ),
    schema_version: "pic.a2a_agent_card_report.v1",
    settled: false,
  };
}

export function a2aTaskHandoffReport(
  handoffInput: JsonRecord,
  profile: string | JsonRecord = "development",
): JsonRecord {
  const handoff = handoffInput ?? {};
  const settings = profileSettings(profile);
  const handoffId = String(
    handoff.handoff_id ?? handoff.task_id ?? shortHash(handoff),
  );
  const residuals = requiredResiduals("a2a-handoff", handoffId, handoff, [
    "agent_card_ref",
    "task_schema",
    "handoff_scope",
    "replay_nonce",
    "idempotency_key",
  ]);
  if (!handoff.declared_authority) {
    residuals.push(
      reportResidual("a2a-handoff", handoffId, "declared_authority_required"),
    );
  }
  if (handoff.delegated_tool_execution === true) {
    residuals.push(
      reportResidual(
        "a2a-handoff",
        handoffId,
        "delegated_execution_not_inferred",
      ),
    );
  }
  const blockers = blockingKinds(residuals);
  return {
    accepted: blockers.length === 0,
    blockers,
    handoff_id: handoffId,
    non_claims: [
      ...NON_CLAIMS,
      "a2a_handoff_result_is_provider_evidence_not_settlement",
      "a2a_message_does_not_grant_delegated_tool_execution",
    ],
    ok: true,
    profile: settings.profile,
    residuals: residuals.sort((a, b) =>
      String(a.kind).localeCompare(String(b.kind)),
    ),
    schema_version: "pic.a2a_task_handoff_report.v1",
    settled: false,
  };
}

function targetStatusResiduals(
  targetId: string,
  target: JsonRecord,
): JsonRecord[] {
  const residuals: JsonRecord[] = [];
  for (const field of ["mission_law", "generated_law", "externality_law"]) {
    if (
      !statusOk(
        target[field],
        new Set(["accepted", "approved", "fresh", "active"]),
      )
    ) {
      residuals.push(
        reportResidual("target", targetId, `${field}_not_accepted`),
      );
    }
  }
  if (
    !statusOk(
      target.hazard_envelope,
      new Set(["accepted", "approved", "active"]),
    )
  ) {
    residuals.push(
      reportResidual("target", targetId, "hazard_envelope_not_accepted"),
    );
  }
  if (
    !statusOk(
      target.authority_envelope,
      new Set(["accepted", "approved", "active"]),
    )
  ) {
    residuals.push(
      reportResidual("target", targetId, "authority_envelope_not_approved"),
    );
  }
  if (
    !statusOk(
      target.capability_envelope,
      new Set(["accepted", "approved", "active"]),
    )
  ) {
    residuals.push(
      reportResidual("target", targetId, "capability_envelope_not_accepted"),
    );
  }
  if (
    !statusOk(target.viability_set, new Set(["accepted", "approved", "active"]))
  ) {
    residuals.push(
      reportResidual("target", targetId, "viability_set_not_accepted"),
    );
  }
  if (target.target_set_changed_after_observation === true) {
    residuals.push(
      reportResidual("target", targetId, "target_changed_after_observation"),
    );
  }
  return residuals;
}

export function targetValidityCheck(targetInput: JsonRecord): JsonRecord {
  const target = targetInput ?? {};
  const targetId = String(target.target_id ?? "target");
  const residuals = requiredResiduals("target", targetId, target, [
    "capability_basis",
    "target_set",
    "mission_law",
    "generated_law",
    "externality_law",
    "hazard_envelope",
    "authority_envelope",
    "capability_envelope",
    "viability_set",
    "raw_net_capital_floor",
    "horizon",
    "target_validity_certificate_ref",
    "baseline_upper_envelope_ref",
  ]);
  if (
    target.observed_outcome_ref &&
    !target.target_set_locked_before_observation
  ) {
    residuals.push(
      reportResidual("target", targetId, "target_changed_after_observation"),
    );
  }
  residuals.push(...targetStatusResiduals(targetId, target));
  const blockers = blockingKinds(residuals);
  const authorityOk = statusOk(
    target.authority_envelope,
    new Set(["accepted", "approved", "active"]),
  );
  const hazardOk = statusOk(
    target.hazard_envelope,
    new Set(["accepted", "approved", "active"]),
  );
  const opportunityLawOk = [
    "mission_law",
    "generated_law",
    "externality_law",
  ].every((field) =>
    statusOk(
      target[field],
      new Set(["accepted", "approved", "fresh", "active"]),
    ),
  );
  const viabilityOk = statusOk(
    target.viability_set,
    new Set(["accepted", "approved", "active"]),
  );
  return {
    authority_ok: authorityOk,
    blockers,
    hazard_ok: hazardOk,
    non_claims: [...NON_CLAIMS, "target_validity_is_protocol_relative"],
    ok: blockers.length === 0,
    opportunity_law_ok: opportunityLawOk,
    residuals: residuals.sort((a, b) =>
      String(a.kind).localeCompare(String(b.kind)),
    ),
    schema_version: "pic.target_validity_certificate.v1",
    settled: false,
    target_id: targetId,
    target_validity_ok: blockers.length === 0,
    viability_ok: viabilityOk,
  };
}

export function baselineEnvelopeCheck(baselineInput: JsonRecord): JsonRecord {
  const baseline = baselineInput ?? {};
  const baselineId = String(baseline.baseline_id ?? "baseline");
  const residuals = requiredResiduals("baseline", baselineId, baseline, [
    "baseline_policy_class",
    "resource_envelope",
    "model_toolchain_environment_versions",
    "control_observability",
    "upper_bound_method",
    "confidence_budget",
    "refresh_contract",
    "path_law_refs",
    "envelope_coordinates",
  ]);
  if (baseline.stale === true) {
    residuals.push(
      reportResidual("baseline", baselineId, "baseline_refresh_required"),
    );
  }
  if (baseline.resource_matched === false) {
    residuals.push(
      reportResidual("baseline", baselineId, "baseline_not_resource_matched"),
    );
  }
  if (
    typeof baseline.control_observability === "object" &&
    baseline.control_observability !== null &&
    !statusOk(
      baseline.control_observability,
      new Set(["accepted", "approved", "active"]),
    )
  ) {
    residuals.push(
      reportResidual(
        "baseline",
        baselineId,
        "control_observability_not_accepted",
      ),
    );
  }
  const blockers = blockingKinds(residuals);
  return {
    baseline_envelope_ok: blockers.length === 0,
    baseline_id: baselineId,
    blockers,
    non_claims: [...NON_CLAIMS, "baseline_upper_envelope_is_not_oracle_truth"],
    ok: blockers.length === 0,
    residuals: residuals.sort((a, b) =>
      String(a.kind).localeCompare(String(b.kind)),
    ),
    schema_version: "pic.baseline_upper_envelope_check.v1",
    settled: false,
  };
}

export function capitalWitnessReport(packetInput: JsonRecord): JsonRecord {
  const packet = packetInput ?? {};
  const id = packetId(packet);
  const coordinate = String(
    packet.coordinate ?? record(packet.capital).coordinate ?? id,
  );
  const capitalLower = floatValue(
    packet.capital_lower_bound,
    packet.capital_lower,
  );
  const costUpper = floatValue(packet.cost_upper_bound, packet.cost_upper);
  const hazardUpper = floatValue(
    packet.hazard_charge_upper_bound,
    packet.hazard_upper,
  );
  const transportUpper = floatValue(
    packet.transport_charge_upper_bound,
    packet.transport_upper,
  );
  const signedSurplus = floatValue(
    packet.signed_surplus_lower_bound,
    capitalLower - costUpper - hazardUpper - transportUpper,
  );
  const valueType = String(packet.value_estimand_type ?? "proxy_only");
  const residuals = requiredResiduals("capital", id, packet, [
    "coordinate",
    "baseline_ref",
    "transport_ref",
    "finality_ref",
  ]);
  for (const field of [
    "mission_valid",
    "transport_valid",
    "finality_valid",
    "hazard_constrained",
    "gauge_compatible",
    "raw_net_solvent",
  ]) {
    if (packet[field] !== true) {
      residuals.push(reportResidual("capital", id, `${field}_not_verified`));
    }
  }
  if (valueType === "proxy_only") {
    residuals.push(reportResidual("capital", id, "proxy_only_not_admitted"));
  }
  if (signedSurplus <= 0) {
    residuals.push(reportResidual("capital", id, "nonpositive_signed_surplus"));
  }
  if (packet.negative_liquidity === true) {
    residuals.push(reportResidual("capital", id, "negative_liquidity"));
  }
  if (packet.lifecycle_stale === true) {
    residuals.push(reportResidual("capital", id, "stale_lifecycle"));
  }
  if (packet.authority_fresh === false) {
    residuals.push(reportResidual("capital", id, "authority_not_fresh"));
  }
  const blockers = blockingKinds(residuals);
  return {
    blockers,
    capital_admitted: blockers.length === 0,
    capital_lower_bound: capitalLower,
    coordinate,
    cost_upper_bound: costUpper,
    evidence_refs: listAny(packet.evidence_refs),
    finality_valid: packet.finality_valid === true,
    gauge_compatible: packet.gauge_compatible === true,
    hazard_charge_upper_bound: hazardUpper,
    hazard_constrained: packet.hazard_constrained === true,
    mission_valid: packet.mission_valid === true,
    non_claims: [
      ...NON_CLAIMS,
      "accepted_report_does_not_imply_capital_admitted",
      "proxy_only_cannot_increase_safe_capital",
    ],
    ok: true,
    packet_refs: listAny(packet.packet_refs ?? id),
    raw_net_solvent: packet.raw_net_solvent === true,
    residuals: residuals.sort((a, b) =>
      String(a.kind).localeCompare(String(b.kind)),
    ),
    schema_version: "pic.runtime_capital_witness.v1",
    settled: false,
    signed_surplus_lower_bound: signedSurplus,
    transport_charge_upper_bound: transportUpper,
    transport_valid: packet.transport_valid === true,
    value_estimand_type: valueType,
    verifier_refs: listAny(packet.verifier_refs),
    witness_id: String(packet.witness_id ?? `capital:${shortHash(packet)}`),
  };
}

export function deploymentAdmissibilityReport(
  packetInput: JsonRecord,
  profile: string | JsonRecord = "development",
): JsonRecord {
  const packet = packetInput ?? {};
  const id = packetId(packet);
  const residuals = requiredResiduals("deployment", id, packet, [
    "guard_certificate",
    "current_certificate",
    "authority_envelope",
  ]);
  if (
    !statusOk(
      record(packet.guard_certificate),
      new Set(["accepted", "fresh", "approved"]),
    )
  ) {
    residuals.push(
      reportResidual("deployment", id, "guard_certificate_not_accepted"),
    );
  }
  if (!certificateFresh(packet.current_certificate, new Date())) {
    residuals.push(
      reportResidual("deployment", id, "current_certificate_not_fresh"),
    );
  }
  if (
    !statusOk(
      record(packet.authority_envelope),
      new Set(["approved", "active"]),
    )
  ) {
    residuals.push(reportResidual("deployment", id, "authority_not_approved"));
  }
  const blockers = blockingKinds(residuals);
  return {
    admissible: blockers.length === 0,
    blockers,
    non_claims: [
      ...NON_CLAIMS,
      "deployment_admissible_is_not_provider_dispatch",
    ],
    ok: true,
    packet_id: id,
    profile: profileSettings(profile).profile,
    residuals: residuals.sort((a, b) =>
      String(a.kind).localeCompare(String(b.kind)),
    ),
    schema_version: "pic.deployment_admissibility_report.v1",
    settled: false,
  };
}

function baselineCoordinates(baseline: JsonRecord): Record<string, number> {
  const raw = baseline.envelope_coordinates;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return Object.fromEntries(
      Object.entries(raw as JsonRecord).map(([key, value]) => [
        key,
        floatValue(value),
      ]),
    );
  }
  return Object.fromEntries(
    recordsAny(raw).map((item) => [
      String(item.coordinate),
      floatValue(item.upper_bound, item.value),
    ]),
  );
}

function targetThresholds(target: JsonRecord): Record<string, number> {
  const targetSet = record(target.target_set);
  const raw = targetSet.thresholds ?? targetSet.coordinate_thresholds;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return Object.fromEntries(
      Object.entries(raw as JsonRecord).map(([key, value]) => [
        key,
        floatValue(value),
      ]),
    );
  }
  return Object.fromEntries(
    recordsAny(raw).map((item) => [
      String(item.coordinate),
      floatValue(item.threshold, item.value),
    ]),
  );
}

export function phaseAccelerationReport(
  target: JsonRecord,
  baseline: JsonRecord,
  capitalWitnesses: JsonRecord[],
): JsonRecord {
  const targetReport = targetValidityCheck(target);
  const baselineReport = baselineEnvelopeCheck(baseline);
  const witnesses = capitalWitnesses.map((item) =>
    item.schema_version === "pic.runtime_capital_witness.v1"
      ? item
      : capitalWitnessReport(item),
  );
  const residuals = [
    ...records(targetReport.residuals),
    ...records(baselineReport.residuals),
  ];
  const kAlt: Record<string, number> = {};
  for (const witness of witnesses) {
    if (witness.capital_admitted === true) {
      const coord = String(witness.coordinate);
      kAlt[coord] =
        (kAlt[coord] ?? 0) + floatValue(witness.signed_surplus_lower_bound);
    } else if (witness.value_estimand_type === "proxy_only") {
      residuals.push(
        reportResidual(
          "phase",
          witness.witness_id,
          "proxy_only_non_contributing",
        ),
      );
    }
  }
  const kBaseline = baselineCoordinates(baseline);
  const thresholds = targetThresholds(target);
  if (Object.keys(kAlt).length === 0) {
    residuals.push(
      reportResidual(
        "phase",
        target.target_id ?? "target",
        "runtime_capital_witness_required",
      ),
    );
  }
  if (
    Object.values(kAlt).reduce((sum, value) => sum + value, 0) <
    floatValue(target.raw_net_capital_floor)
  ) {
    residuals.push(
      reportResidual(
        "phase",
        target.target_id ?? "target",
        "raw_net_capital_floor_not_met",
      ),
    );
  }
  if (Object.keys(thresholds).length === 0) {
    residuals.push(
      reportResidual(
        "phase",
        target.target_id ?? "target",
        "target_set_evaluator_required",
      ),
    );
  }
  const coords = [
    ...new Set([
      ...Object.keys(kAlt),
      ...Object.keys(kBaseline),
      ...Object.keys(thresholds),
    ]),
  ].sort();
  const margins = coords.map(
    (coord) => (kAlt[coord] ?? 0) - (kBaseline[coord] ?? 0),
  );
  const marginDelta = margins.length > 0 ? Math.min(...margins) : null;
  const tauAlt = Object.fromEntries(
    Object.entries(thresholds)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([coord, threshold]) => [
        coord,
        (kAlt[coord] ?? 0) >= threshold ? 0 : null,
      ]),
  );
  const tauBaseline = Object.fromEntries(
    Object.entries(thresholds)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([coord, threshold]) => [
        coord,
        (kBaseline[coord] ?? 0) >= threshold ? 0 : null,
      ]),
  );
  const blockers = blockingKinds(residuals);
  const certified =
    Object.keys(thresholds).length > 0 &&
    targetReport.ok === true &&
    baselineReport.ok === true &&
    blockers.length === 0 &&
    marginDelta !== null &&
    marginDelta > 0 &&
    Object.values(tauAlt).some((value) => value === 0) &&
    !Object.values(tauBaseline).every((value) => value === 0);
  const reportOk =
    targetReport.ok === true &&
    baselineReport.ok === true &&
    blockers.length === 0;
  return {
    authority_ok: targetReport.authority_ok,
    baseline_envelope_ok: baselineReport.ok,
    blockers,
    capital_witnesses: witnesses,
    certified_acceleration_candidate: certified,
    finality_ok:
      witnesses.length > 0 &&
      witnesses.every((item) => item.finality_valid === true),
    hazard_ok: targetReport.hazard_ok,
    horizon: target.horizon,
    k_alt_lower: Object.fromEntries(Object.entries(kAlt).sort()),
    k_baseline_upper: Object.fromEntries(Object.entries(kBaseline).sort()),
    margin_delta: marginDelta,
    non_claims: [
      ...NON_CLAIMS,
      "certified_acceleration_candidate_is_not_real_asi_proof",
      "target_baseline_and_witnesses_are_protocol_relative",
    ],
    ok: reportOk,
    opportunity_law_ok: targetReport.opportunity_law_ok,
    residuals: residuals.sort((a, b) =>
      String(a.kind).localeCompare(String(b.kind)),
    ),
    schema_version: "pic.phase_acceleration_report.v1",
    settled: false,
    target_id: target.target_id,
    target_validity_ok: targetReport.ok,
    tau_alt: tauAlt,
    tau_baseline_upper: tauBaseline,
    viability_ok: targetReport.viability_ok,
  };
}

export function activationConstructionReport(
  stateInput: JsonRecord,
): JsonRecord {
  const state = stateInput ?? {};
  const stateId = String(state.state_id ?? state.graph_id ?? "state");
  const configs = recordsAny(
    state.configurations ?? state.states ?? state.nodes,
  );
  const residuals: JsonRecord[] = [];
  if (configs.length === 0) {
    residuals.push(
      reportResidual("ecpt", stateId, "finite_configuration_set_required"),
    );
  }
  if (configs.length > 64 && !state.factor_graph) {
    residuals.push(reportResidual("ecpt", stateId, "factor_graph_required"));
  }
  if (state.sampler_mode && !state.sample_ledger) {
    residuals.push(reportResidual("ecpt", stateId, "sampler_ledger_required"));
  }
  const utilities = configs.map(
    (cfg) =>
      floatValue(cfg.gain) -
      floatValue(cfg.burden) -
      floatValue(cfg.debt) -
      floatValue(cfg.queue_cost) -
      floatValue(cfg.capacity_price) -
      floatValue(cfg.incompatibility) +
      floatValue(cfg.acceleration_drive),
  );
  const weights = utilities.map((utility) => Math.max(0, utility) + 1);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const blockers = blockingKinds(residuals);
  return {
    accepted: blockers.length === 0,
    activation_probabilities: weights.map((weight, index) => ({
      configuration_id: String(configs[index]?.configuration_id ?? index),
      probability: Math.round((weight / total) * 1e12) / 1e12,
      utility: utilities[index],
    })),
    blockers,
    certified_intervals: Boolean(state.error_ledger),
    non_claims: [...NON_CLAIMS, "no_global_gibbs_claim_without_certificate"],
    ok: true,
    residuals,
    schema_version: "pic.activation_construction_certificate.v1",
    settled: false,
    state_id: stateId,
  };
}

export function phaseResponseControlStep(
  state: JsonRecord,
  controlInput: JsonRecord,
): JsonRecord {
  const control = controlInput ?? {};
  const report = activationConstructionReport(state);
  const controlId = String(
    control.control_id ?? control.action_id ?? "control",
  );
  const residuals = records(report.residuals);
  if (!control.control_surface) {
    residuals.push(
      reportResidual("ecpt-control", controlId, "control_surface_required"),
    );
  }
  const utility =
    floatValue(control.gain) -
    floatValue(control.burden) -
    floatValue(control.debt) -
    floatValue(control.queue_cost) -
    floatValue(control.capacity_price) -
    floatValue(control.incompatibility) +
    floatValue(control.acceleration_drive);
  const blockers = blockingKinds(residuals);
  return {
    accepted: blockers.length === 0,
    blockers,
    control_id: controlId,
    non_claims: [...NON_CLAIMS, "phase_response_step_is_advisory"],
    ok: true,
    residuals,
    schema_version: "pic.phase_response_control_step.v1",
    settled: false,
    utility_interval: state.error_ledger
      ? [utility - 1, utility + 1]
      : [utility, utility],
  };
}

export function pathLawResponsePolicyReport(
  trajectoryInput: JsonRecord,
): JsonRecord {
  const trajectory = trajectoryInput ?? {};
  const trajectoryId = String(trajectory.trajectory_id ?? "trajectory");
  const residuals = requiredResiduals("ecpt-policy", trajectoryId, trajectory, [
    "path_law_refs",
    "response_policy",
    "control_surface",
  ]);
  const blockers = blockingKinds(residuals);
  return {
    accepted: blockers.length === 0,
    blockers,
    non_claims: [...NON_CLAIMS, "response_policy_is_not_execution_authority"],
    ok: true,
    residuals,
    schema_version: "pic.path_law_response_policy.v1",
    settled: false,
    trajectory_id: trajectoryId,
  };
}

export function sqotProtocolIntegrityReport(
  stateInput: JsonRecord,
): JsonRecord {
  const state = stateInput ?? {};
  const stateId = String(state.protocol_id ?? state.state_id ?? "protocol");
  const residuals = requiredResiduals("sqot-protocol", stateId, state, [
    "mandatory_obligations",
    "checker_thresholds",
    "audit_fuel",
    "diagnostic_reserve",
  ]);
  if (state.hidden_protocol_mutation || state.protocol_mutation_edges) {
    residuals.push(
      reportResidual("sqot-protocol", stateId, "hidden_protocol_mutation"),
    );
  }
  if (!state.root_checker_integrity) {
    residuals.push(
      reportResidual(
        "sqot-protocol",
        stateId,
        "root_checker_integrity_missing",
      ),
    );
  }
  if (
    !["accepted", "closed", "not_applicable"].includes(
      String(state.semantic_egress_status),
    )
  ) {
    residuals.push(
      reportResidual("sqot-protocol", stateId, "semantic_egress_unresolved"),
    );
  }
  if (state.verification_cost_status === "over_band") {
    residuals.push(
      reportResidual("sqot-protocol", stateId, "verification_cost_over_band"),
    );
  }
  if (
    state.mechanism_compatibility_status === undefined ||
    state.mechanism_compatibility_status === "" ||
    state.mechanism_compatibility_status === "missing"
  ) {
    residuals.push(
      reportResidual("sqot-protocol", stateId, "mechanism_witness_missing"),
    );
  }
  const blockers = blockingKinds(residuals);
  return {
    accepted: blockers.length === 0,
    audit_fuel: state.audit_fuel,
    blockers,
    checker_thresholds: state.checker_thresholds,
    diagnostic_reserve: state.diagnostic_reserve,
    mandatory_obligations: state.mandatory_obligations,
    mechanism_compatibility_status: state.mechanism_compatibility_status,
    meta_vulnerability: state.meta_vulnerability,
    non_claims: [...NON_CLAIMS, "single_scalar_cannot_certify_sqot_safety"],
    ok: true,
    protocol_mutation_edges: state.protocol_mutation_edges ?? [],
    protocol_state_hash: digest(state),
    queue_morphism_status: state.queue_morphism_status,
    residuals: residuals.sort((a, b) =>
      String(a.kind).localeCompare(String(b.kind)),
    ),
    root_checker_integrity: state.root_checker_integrity,
    schema_version: "pic.sqot_protocol_integrity_report.v1",
    semantic_egress_status: state.semantic_egress_status,
    settled: false,
    verification_cost_status: state.verification_cost_status,
  };
}

export function sqotResourceExchangeReport(stateInput: JsonRecord): JsonRecord {
  const state = stateInput ?? {};
  const stateId = String(
    state.exchange_id ?? state.state_id ?? "resource-exchange",
  );
  const conversions = recordsAny(
    state.conversions ?? state.resource_conversions,
  );
  const residuals: JsonRecord[] = [];
  if (conversions.length === 0) {
    residuals.push(
      reportResidual("sqot-exchange", stateId, "resource_conversion_required"),
    );
  }
  for (const conversion of conversions) {
    const subject = conversion.conversion_id ?? stateId;
    if (!conversion.from || !conversion.to) {
      residuals.push(
        reportResidual("sqot-exchange", subject, "unknown_conversion"),
      );
    }
    if (conversion.rate === undefined || conversion.loss === undefined) {
      residuals.push(
        reportResidual(
          "sqot-exchange",
          subject,
          "conversion_rate_loss_required",
        ),
      );
    }
    if (floatValue(conversion.meta_occupation_charge) <= 0) {
      residuals.push(
        reportResidual(
          "sqot-exchange",
          subject,
          "meta_occupation_charge_required",
        ),
      );
    }
    if (conversion.arbitrage_obstruction === true) {
      residuals.push(
        reportResidual(
          "sqot-exchange",
          subject,
          "exchange_arbitrage_obstruction",
        ),
      );
    }
  }
  const blockers = blockingKinds(residuals);
  return {
    accepted: blockers.length === 0,
    blockers,
    conversions,
    non_claims: [
      ...NON_CLAIMS,
      "local_resource_safety_does_not_imply_cross_modal_safety",
    ],
    ok: true,
    residuals,
    schema_version: "pic.sqot_resource_exchange_report.v1",
    settled: false,
  };
}

export function probeStopReport(probeTreeInput: JsonRecord): JsonRecord {
  const probeTree = probeTreeInput ?? {};
  const probeId = String(probeTree.probe_id ?? "probe");
  const reserve = floatValue(probeTree.diagnostic_reserve, 0);
  const cost = floatValue(probeTree.probe_cost, probeTree.cost);
  const metaBand = floatValue(probeTree.meta_occupation_band, 1);
  const metaCharge = floatValue(probeTree.meta_occupation_charge, 0);
  const residuals: JsonRecord[] = [];
  if (cost > reserve) {
    residuals.push(
      reportResidual("probe", probeId, "probe_cost_exceeds_reserve"),
    );
  }
  if (metaCharge > metaBand) {
    residuals.push(
      reportResidual("probe", probeId, "meta_occupation_band_exceeded"),
    );
  }
  const blockers = blockingKinds(residuals);
  return {
    accepted: blockers.length === 0,
    blockers,
    no_action_certificate: blockers.length > 0,
    non_claims: [...NON_CLAIMS, "probe_plan_is_not_provider_execution"],
    ok: true,
    residuals,
    schema_version: "pic.probe_stop_report.v1",
    settled: false,
  };
}

type MecMetrics = { cost: number; friction: number; load: number };

function mecMetrics(item: JsonRecord): MecMetrics {
  return {
    cost: floatValue(item.cost),
    friction: floatValue(item.friction),
    load: floatValue(item.load),
  };
}

function paretoFrontier(items: JsonRecord[]): JsonRecord[] {
  return items
    .filter((candidate) => {
      const candidateMetrics = mecMetrics(candidate);
      return !items.some((other) => {
        if (other === candidate) return false;
        const otherMetrics = mecMetrics(other);
        const keys = ["cost", "friction", "load"] as const;
        return (
          keys.every((key) => otherMetrics[key] <= candidateMetrics[key]) &&
          keys.some((key) => otherMetrics[key] < candidateMetrics[key])
        );
      });
    })
    .sort((a, b) =>
      String(a.certificate_id ?? a.witness_id ?? a).localeCompare(
        String(b.certificate_id ?? b.witness_id ?? b),
      ),
    );
}

export function bitMecFrontierReport(certificates: JsonRecord[]): JsonRecord {
  const residuals: JsonRecord[] = [];
  const accepted: JsonRecord[] = [];
  for (const [index, certificate] of certificates.entries()) {
    const certId = String(certificate.certificate_id ?? `certificate:${index}`);
    if (!certificate.finite_witness) {
      residuals.push(
        reportResidual("bit-mec", certId, "finite_witness_required"),
      );
      continue;
    }
    if (!certificate.unit_ledger) {
      residuals.push(reportResidual("bit-mec", certId, "unit_ledger_required"));
      continue;
    }
    accepted.push(certificate);
  }
  const blockers = blockingKinds(residuals);
  return {
    accepted: blockers.length === 0,
    blockers,
    frontier: paretoFrontier(accepted),
    non_claims: [...NON_CLAIMS, "mec_frontier_reports_only_finite_witnesses"],
    ok: true,
    residuals,
    schema_version: "pic.bit_mec_frontier_report.v1",
    settled: false,
  };
}

export function bitCertificateCompilerReport(
  certificates: JsonRecord[],
): JsonRecord {
  const frontier = bitMecFrontierReport(certificates);
  return {
    accepted: frontier.accepted,
    blockers: frontier.blockers,
    compiled_certificate_count: records(frontier.frontier).length,
    non_claims: [
      ...NON_CLAIMS,
      "compiler_report_does_not_promote_diagnostic_clauses",
    ],
    ok: true,
    residuals: frontier.residuals,
    schema_version: "pic.bit_certificate_compiler_report.v1",
    settled: false,
  };
}

export function bitUnitCompatibilityReport(
  certificates: JsonRecord[],
): JsonRecord {
  const units = new Set(
    certificates
      .filter((certificate) => certificate.unit_ledger !== undefined)
      .map((certificate) => compactStringify(certificate.unit_ledger)),
  );
  const residuals: JsonRecord[] = [];
  if (units.size > 1) {
    residuals.push(
      reportResidual("bit-unit", "unit-ledger", "unit_mixing_blocked"),
    );
  }
  const blockers = blockingKinds(residuals);
  return {
    accepted: blockers.length === 0,
    blockers,
    non_claims: [...NON_CLAIMS, "unit_compatibility_is_coordinate_local"],
    ok: true,
    residuals,
    schema_version: "pic.bit_unit_compatibility_report.v1",
    settled: false,
  };
}

export function cegarSimulationBarrierReport(
  barrierInput: JsonRecord,
): JsonRecord {
  const barrier = barrierInput ?? {};
  const barrierId = String(barrier.barrier_id ?? "barrier");
  const residuals: JsonRecord[] = [];
  if (!(barrier.finite_transition_table || barrier.interval_table)) {
    residuals.push(
      reportResidual("cegar", barrierId, "finite_transition_table_required"),
    );
  }
  if (!(barrier.simulation_contraction || barrier.refinement_record)) {
    residuals.push(
      reportResidual("cegar", barrierId, "refinement_record_required"),
    );
  }
  if (barrier.uncovered_counterexamples) {
    residuals.push(
      reportResidual("cegar", barrierId, "uncovered_counterexample"),
    );
  }
  if (!barrier.bad_state_bound_certified) {
    residuals.push(
      reportResidual("cegar", barrierId, "bad_state_bound_uncertified"),
    );
  }
  const blockers = blockingKinds(residuals);
  return {
    accepted: blockers.length === 0,
    blockers,
    non_claims: [
      ...NON_CLAIMS,
      "simulation_barrier_is_not_real_physical_outcome_proof",
    ],
    ok: true,
    residuals,
    schema_version: "pic.cegar_simulation_barrier_report.v1",
    settled: false,
  };
}

export function dynamicRegimeAccelerationReport(
  surfaceInput: JsonRecord,
): JsonRecord {
  const surface = surfaceInput ?? {};
  const surfaceId = String(surface.surface_id ?? "surface");
  const residuals: JsonRecord[] = [];
  if (surface.dynamic_baseline_resource_matched !== true) {
    residuals.push(
      reportResidual(
        "dynamic",
        surfaceId,
        "dynamic_baseline_not_resource_matched",
      ),
    );
  }
  if (floatValue(surface.positivity_floor) <= 0) {
    residuals.push(
      reportResidual("dynamic", surfaceId, "positivity_floor_required"),
    );
  }
  for (const key of [
    "censoring_charge",
    "competing_stop_charge",
    "truncation_charge",
  ]) {
    if (surface[key] === undefined || surface[key] === "") {
      residuals.push(reportResidual("dynamic", surfaceId, `${key}_required`));
    }
  }
  const blockers = blockingKinds(residuals);
  return {
    accepted: blockers.length === 0,
    arrival_gain_lower_bound:
      blockers.length === 0
        ? floatValue(surface.arrival_gain_lower_bound)
        : null,
    blockers,
    non_claims: [
      ...NON_CLAIMS,
      "arrival_gain_is_local_to_declared_risk_set_convention",
    ],
    ok: true,
    residuals,
    schema_version: "pic.dynamic_regime_acceleration_report.v1",
    settled: false,
  };
}

export function tracePacketCandidate(traceNf: JsonRecord): JsonRecord {
  const report = traceCheckReport(traceNf);
  const traceId = String(report.trace_id);
  return {
    accepted: report.accepted === true,
    candidate_only_reasons: [
      "TRC trace-to-packet output is candidate-only until verifier routes pass",
    ],
    claims: [
      {
        claim_id: `claim:${traceId}:trace-normal-form`,
        claim_text: "Agent trace has a finite practical TRC trace normal form.",
        claim_type: "trace_normal_form",
        status: "candidate",
      },
    ],
    non_claims: NON_CLAIMS,
    packet_id: `trc-packet:${shortHash(traceId)}`,
    residuals: report.residuals,
    schema_version: "pic.packet_candidate.v1",
    settled: false,
    source_trace_id: traceId,
    status: "candidate",
    trc_trace_nf: report.trc_trace_nf,
  };
}

function parseMrFields(
  text: string,
  lineNumber: number,
): [JsonRecord, JsonRecord[]] {
  const fields: JsonRecord = {};
  const residuals: JsonRecord[] = [];
  for (const rawPart of text.split(";")) {
    const part = rawPart.trim();
    if (!part) continue;
    const index = part.indexOf("=");
    const key = (index >= 0 ? part.slice(0, index) : part).trim();
    const value = index >= 0 ? part.slice(index + 1).trim() : "";
    if (!key || index < 0) {
      residuals.push({
        kind: "partial_field",
        line_number: lineNumber,
        raw_field: part,
      });
      if (key) fields[key] = value;
      continue;
    }
    fields[key] = value.includes(",")
      ? value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : value;
  }
  return [fields, residuals];
}

function parseLiteralMr(
  line: string,
  lineNumber: number,
): JsonRecord | undefined {
  const stripped = line.trim();
  const marker = stripped.indexOf("MRRecord|");
  if (marker < 0) return undefined;
  const raw = stripped.slice(marker);
  const match = /^MRRecord\|([^|\s]+)\|([^|\s]+)\|?(.*)$/.exec(raw);
  if (!match) {
    return {
      fields: {},
      id: `malformed:${lineNumber}`,
      line_number: lineNumber,
      parse_residuals: [
        {
          kind: "malformed_mrrecord",
          line_number: lineNumber,
          raw_line: stripped,
        },
      ],
      raw_line: stripped,
      record_type: "malformed",
      source_form: "literal",
    };
  }
  const recordType = match[1] ?? "";
  const identifier = match[2] ?? "";
  const fieldText = match[3] ?? "";
  const residuals: JsonRecord[] = [];
  if (!VALID_MR_TYPES.has(recordType)) {
    residuals.push({
      kind: "unknown_record_type",
      line_number: lineNumber,
      record_type: recordType,
    });
  }
  const [fields, fieldResiduals] = parseMrFields(fieldText, lineNumber);
  residuals.push(...fieldResiduals);
  return {
    fields,
    id: identifier,
    line_number: lineNumber,
    parse_residuals: residuals,
    raw_line: stripped,
    record_type: recordType,
    source_form: "literal",
  };
}

function parseMacroArgs(line: string): string[] | undefined {
  const marker = line.indexOf("\\MRRecord");
  if (marker < 0) return undefined;
  const args: string[] = [];
  let index = marker + "\\MRRecord".length;
  while (args.length < 3) {
    while (line[index] === " " || line[index] === "\t") index += 1;
    if (line[index] !== "{") return undefined;
    index += 1;
    let depth = 1;
    let value = "";
    while (index < line.length && depth > 0) {
      const char = line[index] ?? "";
      if (char === "{") {
        depth += 1;
        value += char;
      } else if (char === "}") {
        depth -= 1;
        if (depth > 0) value += char;
      } else {
        value += char;
      }
      index += 1;
    }
    if (depth !== 0) return undefined;
    args.push(value);
  }
  return args;
}

function parseMacroMr(
  line: string,
  lineNumber: number,
): JsonRecord | undefined {
  const stripped = line.trim();
  const args = parseMacroArgs(stripped);
  if (!args) return undefined;
  const [recordType = "", identifier = "", fieldText = ""] = args;
  const residuals: JsonRecord[] = [];
  if (!VALID_MR_TYPES.has(recordType)) {
    residuals.push({
      kind: "unknown_record_type",
      line_number: lineNumber,
      record_type: recordType,
    });
  }
  const [fields, fieldResiduals] = parseMrFields(fieldText, lineNumber);
  residuals.push(...fieldResiduals);
  return {
    fields,
    id: identifier,
    line_number: lineNumber,
    parse_residuals: residuals,
    raw_line: stripped,
    record_type: recordType,
    source_form: "tex_macro",
  };
}

function bitDependencyEdges(recordsInput: JsonRecord[]): JsonRecord[] {
  const edges: JsonRecord[] = [];
  for (const item of recordsInput) {
    if (item.record_type !== "depends") continue;
    const fields = record(item.fields);
    const deps =
      listField(fields, "depends_on").length > 0
        ? listField(fields, "depends_on")
        : listField(fields, "depends").length > 0
          ? listField(fields, "depends")
          : listField(fields, "requires");
    const finalDeps =
      deps.length > 0
        ? deps
        : Object.entries(fields)
            .filter(([key, value]) => Boolean(key) && value !== undefined)
            .map(([, value]) => String(value));
    for (const dep of finalDeps) {
      edges.push({
        source: dep,
        target: String(item.id ?? ""),
        type: "depends",
      });
    }
  }
  return edges.sort((a, b) =>
    `${String(a.target)}\0${String(a.source)}`.localeCompare(
      `${String(b.target)}\0${String(b.source)}`,
    ),
  );
}

function bitMissingWitnessClaims(recordsInput: JsonRecord[]): string[] {
  const claims = new Set(
    recordsInput
      .filter((item) => item.record_type === "claim")
      .map((item) => String(item.id)),
  );
  const witnessed = new Set<string>();
  for (const item of recordsInput) {
    if (item.record_type !== "witness") continue;
    const fields = record(item.fields);
    for (const key of ["claim", "claim_id", "for", "witness_for"]) {
      for (const value of listField(fields, key)) witnessed.add(value);
    }
    const id = String(item.id);
    if (claims.has(id)) witnessed.add(id);
  }
  return [...claims].filter((claim) => !witnessed.has(claim)).sort();
}

export function bitRegistryReport(sourceText: string, source = ""): JsonRecord {
  const parsedRecords: JsonRecord[] = [];
  const residuals: JsonRecord[] = [];
  for (const [index, line] of sourceText.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const parsed =
      parseLiteralMr(line, lineNumber) ?? parseMacroMr(line, lineNumber);
    if (parsed) {
      parsedRecords.push(parsed);
      residuals.push(...records(parsed.parse_residuals));
    }
  }
  const unique = new Map<string, JsonRecord>();
  for (const item of parsedRecords) {
    unique.set(
      `${String(item.record_type)}\0${String(item.id)}\0${String(item.line_number)}\0${String(
        item.raw_line,
      )}`,
      item,
    );
  }
  const finalRecords = [...unique.values()].sort((a, b) =>
    `${String(a.line_number).padStart(12, "0")}\0${String(a.record_type)}\0${String(
      a.id,
    )}`.localeCompare(
      `${String(b.line_number).padStart(12, "0")}\0${String(b.record_type)}\0${String(
        b.id,
      )}`,
    ),
  );
  return {
    dependency_edges: bitDependencyEdges(finalRecords),
    missing_witness_claims: bitMissingWitnessClaims(finalRecords),
    ok: true,
    records: finalRecords,
    residuals,
    schema_version: "pic.bit_registry.v1",
    source,
  };
}

export function bitTasksFromRegistry(registry: JsonRecord): JsonRecord[] {
  return listField(registry, "missing_witness_claims")
    .map((claimId) =>
      ccrTask({
        kind: "bit_witness_completion",
        title: "Complete BIT witness record",
        objective: `Supply a machine-readable witness for BIT claim ${claimId}.`,
        sourceId: `bit:witness:${claimId}`,
        profile: "development",
        priority: 65,
        role: "formalizer",
        inputs: [inputRef(claimId, "claim", "Claim lacks witness.")],
        residualInputs: [`claim_without_witness:${claimId}`],
      }),
    )
    .sort((a, b) => String(a.task_id).localeCompare(String(b.task_id)));
}
