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
