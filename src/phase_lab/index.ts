import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import {
  dedupeSorted,
  parseJsonObject,
  sortJson,
  stableStringify,
} from "../core/json.js";

type JsonRecord = Record<string, unknown>;

const PHASE_LAB_SAFETY = [
  "phase lab stores local report data only",
  "phase lab never executes report or packet content",
  "phase lab diagnostics do not settle claims",
  "raw packet volume is diagnostic only",
];

const GRAPH_SAFETY = [
  "raw packet volume is diagnostic only",
  "candidate-only nodes do not improve positive phase components",
  "graph construction does not execute packet content",
  "graph construction does not settle claims",
];

function sha256Json(data: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(sortJson(data)), "utf8")
    .digest("hex");
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function asRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord => Boolean(asRecord(item)))
    : [];
}

function stringList(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map(String).sort();
  if (value instanceof Set) return [...value].map(String).sort();
  return [String(value)];
}

function numeric(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numericDict(value: unknown): Record<string, number> {
  const record = asRecord(value);
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, item]) => [key, numeric(item)] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function residualSummary(payload: JsonRecord): Record<string, number> {
  const direct =
    asRecord(payload.residual_summary) ??
    asRecord(payload.residual_ledger_summary);
  if (direct) return numericDict(direct);
  const coordinates = asRecord(asRecord(payload.residual_ledger)?.coordinates);
  if (!coordinates) return {};
  const summary: Record<string, number> = {};
  for (const coordinate of Object.values(coordinates)) {
    const item = asRecord(coordinate);
    if (!item) continue;
    const kind = String(item.kind ?? "residual");
    summary[kind] = (summary[kind] ?? 0) + numeric(item.value);
  }
  return Object.fromEntries(
    Object.entries(summary).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function residualDebt(summary: Record<string, number>): number {
  return Object.values(summary).reduce((total, value) => total + value, 0);
}

function inferSchemaHint(payload: JsonRecord): string {
  if (
    "packet_id" in payload &&
    "content_digest" in payload &&
    "content" in payload
  ) {
    return "PacketExchangeEnvelope";
  }
  if ("report_id" in payload && "registry" in payload)
    return "RuntimeStepReport";
  if ("graph_id" in payload && "nodes" in payload && "edges" in payload) {
    return "EffectivePacketGraph";
  }
  if ("message_id" in payload) return "AgentMessageEnvelope";
  if ("decision_id" in payload && "packet_id" in payload)
    return "ALTAdmissionDecision";
  if ("accepted" in payload && "workflow_usable" in payload)
    return "AgentCheckReport";
  return String(payload.schema_hint ?? payload.schema ?? "UnknownPICReport");
}

function inferSourceKind(payload: JsonRecord, schemaHint: string): string {
  if (typeof payload.source_kind === "string") return payload.source_kind;
  const mapping: Record<string, string> = {
    AgentCheckReport: "agent-check",
    AgentMessageEnvelope: "agent-message",
    ALTAdmissionDecision: "alt-admission",
    EffectivePacketGraph: "effective-graph",
    PacketExchangeEnvelope: "packet-exchange",
    RuntimeStepReport: "runtime-step-report",
  };
  return mapping[schemaHint] ?? "unknown-report";
}

function unsafeReasons(
  payload: JsonRecord,
  missing: string[],
  candidateOnlyReasons: string[],
  settledBlockers: string[],
): string[] {
  const text = JSON.stringify(payload).toLowerCase();
  const reasons: string[] = [];
  if (
    [
      "npm install",
      "npx",
      "node ",
      "docker run",
      "kubectl",
      "curl ",
      "bash ",
      "powershell",
      "safe_commands",
    ].some((marker) => text.includes(marker))
  ) {
    reasons.push("embedded command-like text remains inert");
  }
  if (missing.length > 0) reasons.push("missing obligations remain visible");
  if (candidateOnlyReasons.length > 0)
    reasons.push("candidate-only reasons remain visible");
  if (settledBlockers.length > 0)
    reasons.push("settlement blockers remain visible");
  return dedupeSorted(reasons);
}

function eventFromPayload(
  payload: JsonRecord,
  windowId: string,
  sequence: number,
  sourcePath?: string,
  sourceKindOverride?: string,
): JsonRecord {
  const digest = sha256Json(payload);
  const schemaHint = inferSchemaHint(payload);
  const sourceKind = sourceKindOverride ?? inferSourceKind(payload, schemaHint);
  const missing = dedupeSorted([
    ...stringList(payload.missing_obligations),
    ...stringList(payload.unresolved_obligations),
  ]);
  const candidateOnlyReasons = dedupeSorted(
    stringList(payload.candidate_only_reasons),
  );
  const settledBlockers = dedupeSorted([
    ...stringList(payload.settled_blockers),
    ...(payload.settled === true
      ? ["source-settled-ignored-by-phase-lab"]
      : []),
  ]);
  const accepted = payload.accepted === true;
  const candidateOnly =
    payload.candidate_only === true ||
    candidateOnlyReasons.length > 0 ||
    !accepted ||
    [
      "packet-exchange",
      "general-intake",
      "raw-external",
      "phase-dashboard",
    ].includes(sourceKind);
  const reasons = unsafeReasons(
    payload,
    missing,
    candidateOnlyReasons,
    settledBlockers,
  );
  const positiveContributionAllowed =
    accepted && !candidateOnly && reasons.length === 0 && missing.length === 0;
  return {
    accepted,
    candidate_only: candidateOnly,
    candidate_only_reasons: candidateOnlyReasons,
    content_digest: digest,
    event_id: `phase-lab-event:${sequence}:${digest.slice(0, 12)}`,
    missing_obligations: missing,
    operationally_usable: payload.operationally_usable === true,
    payload,
    positive_contribution_allowed: positiveContributionAllowed,
    reasons: dedupeSorted([
      "event content is stored as inert data",
      ...reasons,
      ...(candidateOnly
        ? ["candidate-only event cannot improve phase metrics"]
        : []),
    ]),
    residual_summary: residualSummary(payload),
    safety_boundary: PHASE_LAB_SAFETY,
    schema_hint: schemaHint,
    settled: false,
    settled_blockers: settledBlockers,
    source_kind: sourceKind,
    source_path: sourcePath ? basename(sourcePath) : null,
    window_id: windowId,
    workflow_usable: payload.workflow_usable === true,
  };
}

function readJsonFile(path: string, label = "JSON"): JsonRecord {
  if (!path.toLowerCase().endsWith(".json")) {
    throw new Error(
      `${label} must be a JSON file; YAML input is not enabled in PIC-TS v0.5.0`,
    );
  }
  return parseJsonObject(readFileSync(path, "utf8"), label);
}

interface PhaseLabStorePaths {
  events: string;
  manifest: string;
  windows: string;
}

function storePaths(storeDir: string): PhaseLabStorePaths {
  return {
    events: join(storeDir, "events.jsonl"),
    manifest: join(storeDir, "manifest.json"),
    windows: join(storeDir, "windows"),
  };
}

function windowFileName(windowId: string): string {
  return `${windowId.replace(/[^A-Za-z0-9_.-]/g, "_")}.json`;
}

function readEvents(storeDir: string): JsonRecord[] {
  const eventsPath = storePaths(storeDir).events;
  if (!existsSync(eventsPath)) return [];
  return readFileSync(eventsPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => parseJsonObject(line, "phase lab event"));
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, stableStringify(data), "utf8");
}

function windowIndex(
  windowId: string,
  sequence: number,
  events: JsonRecord[],
): JsonRecord {
  const residual = events.reduce(
    (total, event) => total + residualDebt(numericDict(event.residual_summary)),
    0,
  );
  return {
    accepted: true,
    accepted_event_count: events.filter((event) => event.accepted === true)
      .length,
    candidate_only_event_count: events.filter(
      (event) => event.candidate_only === true,
    ).length,
    event_count: events.length,
    event_ids: events.map((event) => String(event.event_id)),
    missing_obligation_count: events.reduce(
      (total, event) => total + stringList(event.missing_obligations).length,
      0,
    ),
    positive_contribution_event_count: events.filter(
      (event) => event.positive_contribution_allowed === true,
    ).length,
    reasons: ["window index preserves event residuals without settling claims"],
    residual_debt: residual,
    sequence,
    settled: false,
    settled_event_count: 0,
    window_id: windowId,
  };
}

function readWindowIndexes(storeDir: string): JsonRecord[] {
  const windowsDir = storePaths(storeDir).windows;
  if (!existsSync(windowsDir)) return [];
  return readdirSync(windowsDir)
    .filter((name) => name !== "latest.json" && name.endsWith(".json"))
    .sort()
    .map((name) =>
      parseJsonObject(readFileSync(join(windowsDir, name), "utf8"), "window"),
    );
}

function selectWindow(
  storeDir: string,
  selector = "latest",
): { index: JsonRecord; events: JsonRecord[] } {
  const windows = readWindowIndexes(storeDir);
  if (windows.length === 0) throw new Error("phase lab store has no windows");
  let selected: JsonRecord | undefined;
  if (selector === "latest" || selector === "all") {
    selected = windows[windows.length - 1];
  } else if (selector === "previous") {
    selected =
      windows.length > 1
        ? windows[windows.length - 2]
        : windows[windows.length - 1];
  } else {
    selected = windows.find((window) => window.window_id === selector);
  }
  if (!selected)
    throw new Error(`unknown phase lab window ${JSON.stringify(selector)}`);
  const selectedId = String(selected.window_id);
  const events =
    selector === "all"
      ? readEvents(storeDir)
      : readEvents(storeDir).filter((event) => event.window_id === selectedId);
  return { index: selected, events };
}

function writeManifest(storeDir: string): JsonRecord {
  const paths = storePaths(storeDir);
  mkdirSync(paths.windows, { recursive: true });
  const windows = readWindowIndexes(storeDir);
  const events = readEvents(storeDir);
  const manifest = {
    accepted: true,
    database_path: "events.jsonl",
    event_count: events.length,
    latest_window_id:
      windows.length > 0
        ? String(windows[windows.length - 1]?.window_id ?? "")
        : null,
    reasons: ["phase lab store is local and non-executing"],
    safety_invariants: PHASE_LAB_SAFETY,
    schema_version: "phase-lab-store-v1",
    settled: false,
    store_id: "phase-lab-store",
    store_path: basename(storeDir),
    window_count: windows.length,
  };
  writeJson(paths.manifest, manifest);
  return manifest;
}

export function initPhaseLabStore(outputDir: string): JsonRecord {
  const paths = storePaths(outputDir);
  mkdirSync(paths.windows, { recursive: true });
  if (!existsSync(paths.events)) writeFileSync(paths.events, "", "utf8");
  return writeManifest(outputDir);
}

function ingestPayloads(
  storeDir: string,
  payloads: Array<{ payload: JsonRecord; path?: string; sourceKind?: string }>,
): JsonRecord {
  initPhaseLabStore(storeDir);
  const sequence = readWindowIndexes(storeDir).length;
  const offset = readEvents(storeDir).length;
  const windowId = `phase-window:${String(sequence).padStart(4, "0")}`;
  const events = payloads.map((item, index) =>
    eventFromPayload(
      item.payload,
      windowId,
      offset + index,
      item.path,
      item.sourceKind,
    ),
  );
  const index = windowIndex(windowId, sequence, events);
  const paths = storePaths(storeDir);
  const append = events
    .map((event) => JSON.stringify(sortJson(event)))
    .join("\n");
  if (append) {
    writeFileSync(paths.events, `${append}\n`, { encoding: "utf8", flag: "a" });
  }
  writeJson(join(paths.windows, windowFileName(windowId)), index);
  writeJson(join(paths.windows, "latest.json"), index);
  const manifest = writeManifest(storeDir);
  return {
    accepted: events.length > 0,
    content_treated_as_data: true,
    executed_command_count: 0,
    ingested_events: events,
    reasons: [
      "ingested files were stored as inert local data",
      "no embedded command, safe_command, network, repository, or model action was executed",
    ],
    rejected_paths: [],
    report_id: `phase-lab-ingest:${windowId}`,
    settled: false,
    store_manifest: manifest,
    window: index,
    workflow_usable: true,
  };
}

export function ingestPhaseLabReport(
  storeDir: string,
  reportPath: string,
): JsonRecord {
  return ingestPayloads(storeDir, [
    { payload: readJsonFile(reportPath, "phase lab report"), path: reportPath },
  ]);
}

export function ingestPhaseLabPacket(
  storeDir: string,
  packetPath: string,
): JsonRecord {
  return ingestPayloads(storeDir, [
    {
      payload: readJsonFile(packetPath, "phase lab packet"),
      path: packetPath,
      sourceKind: "packet-exchange",
    },
  ]);
}

export function ingestPhaseLabFiles(
  storeDir: string,
  reportPaths: string[] = [],
  packetPaths: string[] = [],
): JsonRecord {
  const payloads = [
    ...reportPaths.map((path) => ({
      payload: readJsonFile(path, "phase lab report"),
      path,
    })),
    ...packetPaths.map((path) => ({
      payload: readJsonFile(path, "phase lab packet"),
      path,
      sourceKind: "packet-exchange",
    })),
  ];
  if (payloads.length === 0) {
    throw new Error("provide at least one Phase Lab report or packet");
  }
  return ingestPayloads(storeDir, payloads);
}

export function ingestPhaseLabDirectory(
  storeDir: string,
  directory: string,
): JsonRecord {
  if (!existsSync(directory))
    throw new Error(`phase lab directory does not exist: ${directory}`);
  const payloads = readdirSync(directory)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .sort()
    .map((name) => {
      const path = join(directory, name);
      return { payload: readJsonFile(path, "phase lab directory item"), path };
    });
  return ingestPayloads(storeDir, payloads);
}

export function listPhaseLabWindows(storeDir: string): JsonRecord {
  return {
    settled: false,
    store_manifest: writeManifest(storeDir),
    windows: readWindowIndexes(storeDir),
  };
}

function eligibilityBlockers(event: JsonRecord): string[] {
  const joined = [
    event.source_kind,
    ...stringList(event.missing_obligations),
    ...stringList(event.candidate_only_reasons),
    ...stringList(event.settled_blockers),
    ...stringList(event.reasons),
  ]
    .join(" ")
    .toLowerCase();
  const blockers: string[] = [];
  const markers: Record<string, string[]> = {
    "authority-invalid": [
      "authority-invalid",
      "missing authority",
      "authority",
    ],
    "candidate-only": ["candidate-only"],
    "hash-invalid": ["hash-invalid", "digest mismatch"],
    "raw-external-volume": ["general-intake", "raw-external"],
    "rollback-missing": ["rollback", "safe abort"],
    "salience-obstruction": ["salience", "queue occupation"],
    stale: ["stale", "expired"],
    "verification-blocked": [
      "missing evidence",
      "missing verifier",
      "verification",
    ],
  };
  for (const [blocker, needles] of Object.entries(markers)) {
    if (needles.some((needle) => joined.includes(needle)))
      blockers.push(blocker);
  }
  if (event.candidate_only === true) blockers.push("candidate-only");
  return dedupeSorted(blockers);
}

function nodeFromEvent(event: JsonRecord): JsonRecord {
  const blockers = eligibilityBlockers(event);
  const eligible =
    event.positive_contribution_allowed === true && blockers.length === 0;
  const status = eligible
    ? "accepted"
    : event.candidate_only === true
      ? "candidate-only"
      : "diagnostic";
  return {
    accepted: event.accepted === true,
    content_digest: String(event.content_digest ?? ""),
    contribution: {
      candidate_only: !eligible,
      non_contributing_reason: eligible
        ? ""
        : "eligibility blockers prevent positive contribution",
      positive_contribution: eligible,
      settled: false,
      status,
    },
    eligibility: {
      accepted_or_certificate_admissible: event.accepted === true,
      agent_text_not_treated_as_evidence:
        event.source_kind !== "agent-text-only",
      authority_valid: !blockers.includes("authority-invalid"),
      blockers,
      eligible,
      hash_valid: !blockers.includes("hash-invalid"),
      not_raw_external_volume: !blockers.includes("raw-external-volume"),
      not_registry_metadata_only: event.source_kind !== "registry-metadata",
      not_salience_blocked: !blockers.includes("salience-obstruction"),
      not_stale: !blockers.includes("stale"),
      not_verification_blocked: !blockers.includes("verification-blocked"),
      residuals_preserved: true,
      retrievable: Boolean(event.content_digest),
      rollback_available_or_not_required:
        !blockers.includes("rollback-missing"),
      within_validity_domain: true,
    },
    missing_obligations: stringList(event.missing_obligations),
    node_id: `node:${String(event.content_digest ?? "").slice(0, 12)}`,
    operationally_usable: event.operationally_usable === true,
    reasons: stringList(event.reasons),
    residual_summary: numericDict(event.residual_summary),
    schema_hint: String(event.schema_hint ?? "UnknownPICReport"),
    settled: false,
    source_event_id: String(event.event_id ?? ""),
    source_kind: String(event.source_kind ?? "unknown-report"),
    workflow_usable: event.workflow_usable === true,
  };
}

function extractEdges(payload: JsonRecord): JsonRecord[] {
  const edges: JsonRecord[] = [];
  for (const key of ["edges", "edge_witnesses", "edge_certificates"]) {
    edges.push(...asRecords(payload[key]));
  }
  const registry = asRecord(payload.registry);
  if (registry) edges.push(...extractEdges(registry));
  const content = asRecord(payload.content);
  if (content) edges.push(...extractEdges(content));
  return edges;
}

function nodeIdForRef(ref: string, nodes: JsonRecord[]): string | undefined {
  if (!ref) return undefined;
  return nodes
    .map((node) => String(node.node_id))
    .find((nodeId) => {
      const node = nodes.find((item) => item.node_id === nodeId);
      return (
        node &&
        [
          node.node_id,
          node.content_digest,
          String(node.content_digest).slice(0, 12),
          node.source_event_id,
        ]
          .map(String)
          .includes(ref)
      );
    });
}

function nodePositive(nodeId: string, nodes: JsonRecord[]): boolean {
  const node = nodes.find((item) => item.node_id === nodeId);
  return asRecord(node?.contribution)?.positive_contribution === true;
}

function edgesFromEvents(
  nodes: JsonRecord[],
  events: JsonRecord[],
): JsonRecord[] {
  const edges: JsonRecord[] = [];
  events.forEach((event, eventIndex) => {
    const node = nodes[eventIndex];
    if (!node) return;
    extractEdges(asRecord(event.payload) ?? {}).forEach((edge, index) => {
      const sourceIds = stringList(edge.source_packet_ids)
        .map((ref) => nodeIdForRef(ref, nodes))
        .filter((item): item is string => Boolean(item));
      const target =
        nodeIdForRef(String(edge.target_packet_id ?? ""), nodes) ??
        String(node.node_id);
      const evidenceRefs = stringList(edge.evidence_refs);
      const accepted = edge.accepted === true || event.accepted === true;
      const evidenceSupported = accepted && evidenceRefs.length > 0;
      const positive =
        evidenceSupported &&
        sourceIds.every((source) => nodePositive(source, nodes)) &&
        nodePositive(target, nodes);
      const edgeId = String(
        edge.edge_id ?? `edge:${String(node.node_id)}:${index}`,
      );
      edges.push({
        accepted,
        contribution: {
          candidate_only: !positive,
          non_contributing_reason: positive
            ? ""
            : "edge lacks accepted evidence support",
          positive_contribution: positive,
          settled: false,
          status: positive ? "accepted" : "diagnostic",
        },
        edge_id: edgeId,
        evidence: {
          edge_certificate_refs: stringList(edge.edge_certificate_refs),
          evidence_refs: evidenceRefs,
          evidence_supported: evidenceSupported,
          missing_evidence: evidenceSupported
            ? []
            : ["edge evidence refs required"],
          verifier_resolution_refs: stringList(edge.verifier_resolution_refs),
        },
        reasons: ["edge extracted from inert report data"],
        relation_type: String(
          edge.edge_type ?? edge.relation_type ?? "semantic-dependency",
        ),
        residual_summary: numericDict(event.residual_summary),
        settled: false,
        source_node_ids:
          sourceIds.length > 0 ? sourceIds : [String(node.node_id)],
        target_node_id: target,
      });
    });
  });
  return edges;
}

export function buildEffectivePacketGraph(
  input:
    | JsonRecord[]
    | { events?: JsonRecord[]; graph_id?: string; source_window_id?: string },
): JsonRecord {
  const events = Array.isArray(input)
    ? input
    : Array.isArray(input.events)
      ? input.events
      : [];
  const graphId = Array.isArray(input)
    ? "effective-packet-graph"
    : String(input.graph_id ?? "effective-packet-graph");
  const sourceWindowId = Array.isArray(input)
    ? "adhoc"
    : String(input.source_window_id ?? "adhoc");
  const normalized = events.map((event, index) =>
    event.event_id
      ? event
      : eventFromPayload(event, sourceWindowId, index, undefined, undefined),
  );
  const nodes = normalized.map(nodeFromEvent);
  const edges = edgesFromEvents(nodes, normalized);
  const nodeCountByStatus: Record<string, number> = {};
  for (const node of nodes) {
    const status = String(asRecord(node.contribution)?.status ?? "diagnostic");
    nodeCountByStatus[status] = (nodeCountByStatus[status] ?? 0) + 1;
  }
  const edgeCountByRelation: Record<string, number> = {};
  for (const edge of edges) {
    const relation = String(edge.relation_type ?? "semantic-dependency");
    edgeCountByRelation[relation] = (edgeCountByRelation[relation] ?? 0) + 1;
  }
  const mergedResidual: Record<string, number> = {};
  for (const node of nodes) {
    for (const [key, value] of Object.entries(
      numericDict(node.residual_summary),
    )) {
      mergedResidual[key] = (mergedResidual[key] ?? 0) + value;
    }
  }
  const acceptedPacketCapital = nodes.filter(
    (node) => asRecord(node.contribution)?.positive_contribution === true,
  ).length;
  return {
    accepted: nodes.length > 0,
    accepted_packet_capital: acceptedPacketCapital,
    candidate_only_packets: nodes.filter(
      (node) => asRecord(node.contribution)?.candidate_only === true,
    ).length,
    edge_count_by_relation: Object.fromEntries(
      Object.entries(edgeCountByRelation).sort(),
    ),
    edges,
    graph_id: graphId,
    graph_safety_boundary: GRAPH_SAFETY,
    missing_edge_evidence: edges
      .filter(
        (edge) =>
          edge.accepted === true &&
          asRecord(edge.evidence)?.evidence_supported !== true,
      )
      .map((edge) => String(edge.edge_id)),
    node_count_by_status: Object.fromEntries(
      Object.entries(nodeCountByStatus).sort(),
    ),
    nodes,
    non_contributing_volume: nodes.filter(
      (node) => asRecord(node.contribution)?.positive_contribution !== true,
    ).length,
    operationally_usable: acceptedPacketCapital > 0,
    reasons: [
      "effective graph separates positive contribution from diagnostic volume",
      "raw packet count does not increase positive phase metrics",
    ],
    rejected_or_quarantined_packets: nodes.filter((node) =>
      ["rejected", "quarantined"].includes(
        String(asRecord(node.contribution)?.status ?? ""),
      ),
    ).length,
    residual_summary: {
      candidate_only_reasons: dedupeSorted(
        normalized.flatMap((event) => stringList(event.candidate_only_reasons)),
      ),
      missing_obligation_count: nodes.reduce(
        (total, node) => total + stringList(node.missing_obligations).length,
        0,
      ),
      residual_debt: residualDebt(mergedResidual),
      residual_summary: Object.fromEntries(
        Object.entries(mergedResidual).sort(),
      ),
      settled_blockers: dedupeSorted(
        normalized.flatMap((event) => [
          ...stringList(event.settled_blockers),
          ...stringList(event.missing_obligations),
        ]),
      ),
    },
    semantic_edge_witnesses: edges
      .map((edge) => asRecord(edge.evidence))
      .filter((evidence): evidence is JsonRecord =>
        Boolean(evidence?.evidence_supported),
      ),
    settled: false,
    source_window_id: sourceWindowId,
    stale_or_unsafe_packets: nodes
      .filter(
        (node) => stringList(asRecord(node.eligibility)?.blockers).length > 0,
      )
      .map((node) => String(node.node_id)),
    workflow_usable: true,
  };
}

function positiveEdges(graph: JsonRecord): JsonRecord[] {
  return asRecords(graph.edges).filter(
    (edge) =>
      asRecord(edge.contribution)?.positive_contribution === true &&
      asRecord(edge.evidence)?.evidence_supported === true,
  );
}

export function observePhaseWindow(
  window: JsonRecord,
  events: JsonRecord[],
  graph: JsonRecord,
): JsonRecord {
  const effectiveNodeCount = numeric(graph.accepted_packet_capital);
  const effectiveEdgeCount = positiveEdges(graph).length;
  const executionAvailablePathCount = detectExecutionAvailablePaths(graph)
    .accepted_path_count as number;
  const closureWitnessCount = asRecords(
    detectAutocatalyticClosure(graph).closure_witnesses,
  ).length;
  const total = Math.max(1, events.length);
  const acceptedPacketCount = events.filter(
    (event) => event.accepted === true,
  ).length;
  const missingObligationCount = events.reduce(
    (sum, event) => sum + stringList(event.missing_obligations).length,
    0,
  );
  const residual = numeric(asRecord(graph.residual_summary)?.residual_debt);
  const candidateOnlyCount = events.filter(
    (event) => event.candidate_only === true,
  ).length;
  const observation = {
    accepted: events.length > 0,
    accepted_packet_count: acceptedPacketCount,
    alt_certified_capital_count: events.filter(
      (event) =>
        String(event.source_kind).includes("alt") &&
        event.positive_contribution_allowed === true,
    ).length,
    alt_liquidity_candidate_count: events.filter((event) =>
      String(event.source_kind).includes("alt"),
    ).length,
    autocatalytic_closure_score:
      effectiveNodeCount > 0 ? closureWitnessCount / effectiveNodeCount : 0,
    basin_reachability_proxy: {
      effective_node_count: effectiveNodeCount,
      execution_available_path_count: executionAvailablePathCount,
      reachability_proxy:
        executionAvailablePathCount / Math.max(1, effectiveNodeCount),
    },
    bottleneck_count_by_type: Object.fromEntries(
      asRecords(graph.nodes)
        .flatMap((node) => stringList(asRecord(node.eligibility)?.blockers))
        .reduce((map, blocker) => {
          map.set(blocker, (map.get(blocker) ?? 0) + 1);
          return map;
        }, new Map<string, number>())
        .entries(),
    ),
    candidate_only_packet_count: candidateOnlyCount,
    closure_witness_count: closureWitnessCount,
    components: [
      {
        component: "accepted_packet_count",
        diagnostic_only: false,
        distance: 0,
        positive_contribution_source: "effective-graph-only",
        threshold: 0,
        value: acceptedPacketCount,
      },
      {
        component: "raw_volume",
        diagnostic_only: true,
        distance: 0,
        positive_contribution_source: "diagnostic-only",
        threshold: 0,
        value: events.length,
      },
    ],
    effective_edge_count: effectiveEdgeCount,
    effective_node_count: effectiveNodeCount,
    execution_available_path_count: executionAvailablePathCount,
    false_liquidity_load: {
      candidate_count: candidateOnlyCount,
      certified_count: 0,
      load: candidateOnlyCount / total,
    },
    missing_obligation_count: missingObligationCount,
    observation_id: "phase-window-observation",
    operationally_usable: effectiveNodeCount > 0,
    oracle_truth_proven: false,
    packet_candidate_count: events.length,
    phase_gap_vector: {
      closure: Math.max(0, 1 - closureWitnessCount),
      effective_edges: Math.max(0, 1 - effectiveEdgeCount),
      effective_nodes: Math.max(0, 1 - effectiveNodeCount),
      execution_paths: Math.max(0, 1 - executionAvailablePathCount),
    },
    physical_truth_proven: false,
    proves_physical_or_oracle_truth: false,
    proves_real_asi: false,
    protocol_relative: true,
    protocol_relative_only: true,
    raw_external_volume_diagnostic_only: true,
    real_asi_proof: false,
    reasons: [
      "window observation is protocol-relative only",
      "raw external volume is diagnostic only",
    ],
    residual_debt: residual,
    salience_obstruction_load: {
      blocked_count: candidateOnlyCount,
      load: candidateOnlyCount / total,
      total_count: events.length,
    },
    settled: false,
    settled_packet_count: 0,
    threshold_distance:
      Math.max(0, 1 - effectiveNodeCount) +
      Math.max(0, 1 - effectiveEdgeCount) +
      Math.max(0, 1 - closureWitnessCount) +
      Math.max(0, 1 - executionAvailablePathCount),
    verification_backlog: missingObligationCount,
    verification_throughput: {
      accepted_count: acceptedPacketCount,
      backlog_count: missingObligationCount,
      throughput_ratio: acceptedPacketCount / total,
    },
    waste_load: {
      load: numeric(graph.non_contributing_volume) / total,
      non_contributing_volume: numeric(graph.non_contributing_volume),
      total_volume: events.length,
    },
    window: {
      event_count: numeric(window.event_count),
      event_ids: stringList(window.event_ids),
      sequence: numeric(window.sequence),
      window_id: String(window.window_id ?? "phase-window"),
    },
    workflow_usable: true,
    workflow_usable_packet_count: events.filter(
      (event) => event.workflow_usable === true,
    ).length,
  };
  return observation;
}

export function comparePhaseWindows(
  baseline: JsonRecord,
  candidate: JsonRecord,
): JsonRecord {
  const metricDelta = {
    closure_witness_count:
      numeric(candidate.closure_witness_count) -
      numeric(baseline.closure_witness_count),
    effective_edge_count:
      numeric(candidate.effective_edge_count) -
      numeric(baseline.effective_edge_count),
    effective_node_count:
      numeric(candidate.effective_node_count) -
      numeric(baseline.effective_node_count),
    execution_available_path_count:
      numeric(candidate.execution_available_path_count) -
      numeric(baseline.execution_available_path_count),
    residual_debt:
      numeric(candidate.residual_debt) - numeric(baseline.residual_debt),
  };
  return {
    accepted: true,
    baseline_window_id: String(asRecord(baseline.window)?.window_id ?? ""),
    candidate_window_id: String(asRecord(candidate.window)?.window_id ?? ""),
    comparison_id: "phase-window-comparison",
    diagnostic_only_components: ["packet_candidate_count", "raw_volume"],
    metric_delta: metricDelta,
    positive_progress_components: Object.entries(metricDelta)
      .filter(([key, value]) => key !== "residual_debt" && value > 0)
      .map(([key]) => key),
    reasons: ["comparison preserves protocol-relative diagnostic status"],
    settled: false,
    workflow_usable: true,
  };
}

export function detectAutocatalyticClosure(graph: JsonRecord): JsonRecord {
  const closureWitnesses: JsonRecord[] = [];
  const defects: JsonRecord[] = [];
  for (const edge of positiveEdges(graph)) {
    const sources = stringList(edge.source_node_ids);
    const target = String(edge.target_node_id ?? "");
    if (sources.includes(target)) {
      const witnessId = `closure-witness:${String(edge.edge_id)}`;
      closureWitnesses.push({
        accepted: true,
        edge_ids: [String(edge.edge_id)],
        evidence_supported: true,
        execution_available: false,
        packet_ids: dedupeSorted([...sources, target]),
        productive: true,
        protocol_relative_only: true,
        reasons: [
          "witness is evidence-supported within the effective graph",
          "witness remains diagnostic until finite threshold checks pass",
        ],
        settled: false,
        witness_id: witnessId,
        witness_kind: "autocatalytic-closure",
      });
    }
  }
  for (const edge of asRecords(graph.edges)) {
    if (
      edge.accepted === true &&
      asRecord(edge.evidence)?.evidence_supported !== true
    ) {
      defects.push({
        defect_id: `closure-defect:${String(edge.edge_id)}`,
        defect_type: "missing-edge-evidence",
        packet_or_edge_id: String(edge.edge_id),
        residual_preserved: true,
      });
    }
  }
  const status =
    closureWitnesses.length > 0 && defects.length === 0
      ? "candidate"
      : "abstain";
  return {
    accepted: status === "candidate",
    certificate_candidate: {
      abstention_reasons:
        closureWitnesses.length > 0
          ? []
          : [
              {
                missing_evidence_refs: [],
                reason: "closure requires evidence-supported accepted edges",
                reason_id: "closure-abstain:no-evidence-supported-cycle",
              },
            ],
      accepted: status === "candidate",
      certificate_id: "closure-certificate-candidate",
      certificate_status: status,
      defects,
      reasons: [
        "closure candidate is not automatically settled",
        "candidate-only cycles do not count",
      ],
      settled: false,
      witness_ids: closureWitnesses.map((witness) =>
        String(witness.witness_id),
      ),
    },
    closure_score:
      closureWitnesses.length / Math.max(1, asRecords(graph.nodes).length),
    closure_witnesses: closureWitnesses,
    defects,
    executable_witnesses: [],
    graph_id: String(graph.graph_id ?? "effective-packet-graph"),
    operationally_usable: status === "candidate",
    productive_witnesses: closureWitnesses.map((witness) => ({
      accepted: true,
      packet_ids: witness.packet_ids,
      productive_edge_ids: witness.edge_ids,
      productivity_lower_bound: 0.1,
      reasons: [
        "self-supporting evidence edge is productive in declared scope",
      ],
      settled: false,
      witness_id: `productive:${String(witness.witness_id)}`,
    })),
    reasons: ["closure detection does not execute or settle paths"],
    report_id: "autocatalytic-closure-report",
    settled: false,
    support_hyperpaths: [],
    workflow_usable: true,
  };
}

export function detectExecutionAvailablePaths(graph: JsonRecord): JsonRecord {
  const paths = positiveEdges(graph).map((edge) => {
    const pathId = `execution-path:${String(edge.edge_id)}`;
    const reasons = [
      "execution authority is not granted by PIC-TS",
      "receiver context and action boundary remain diagnostic",
    ];
    return {
      accepted: false,
      action_boundary_requirements: [
        {
          requirement_id: `${pathId}:authority`,
          requirement_type: "explicit-scope-bounded-authority",
          residual: "host runtime authority required",
          satisfied: false,
        },
      ],
      authority_status: {
        authority_status: "not-granted",
        explicit_scope_bounded: false,
        grants_execution: false,
        reasons,
      },
      blocked: true,
      candidate_only: true,
      edge_ids: [String(edge.edge_id)],
      not_executed: true,
      packet_ids: dedupeSorted([
        ...stringList(edge.source_node_ids),
        String(edge.target_node_id ?? ""),
      ]),
      path_id: pathId,
      reasons,
      receiver_context: {
        evidence_refs: [],
        present: false,
        receiver_context_id: "receiver-context:missing",
      },
      settled: false,
      witness: {
        accepted: false,
        edge_ids: [String(edge.edge_id)],
        packet_ids: dedupeSorted([
          ...stringList(edge.source_node_ids),
          String(edge.target_node_id ?? ""),
        ]),
        reasons,
        settled: false,
        witness_id: `execution-witness:${String(edge.edge_id)}`,
      },
    };
  });
  return {
    accepted: paths.length > 0,
    accepted_path_count: 0,
    authority_requirements: ["explicit-scope-bounded-authority"],
    blocked_path_count: paths.length,
    blocker_reason_by_path: Object.fromEntries(
      paths.map((path) => [String(path.path_id), stringList(path.reasons)]),
    ),
    candidate_only_path_count: paths.length,
    executed_path_count: 0,
    execution_authority_granted: false,
    graph_id: String(graph.graph_id ?? "effective-packet-graph"),
    operationally_usable: false,
    path_count: paths.length,
    path_density: 0,
    paths,
    reasons: ["execution-available path detection never executes paths"],
    report_id: "execution-available-path-density",
    residual_carry_forward: stringList(
      asRecord(graph.residual_summary)?.settled_blockers,
    ),
    rollback_requirements: ["rollback-or-safe-abort"],
    settled: false,
    workflow_usable: true,
  };
}

export function buildPhaseThresholdStatus(
  observation: JsonRecord,
  threshold: JsonRecord,
): JsonRecord {
  const pathDensity = numeric(
    asRecord(observation.basin_reachability_proxy)?.reachability_proxy,
  );
  const checks: Record<string, boolean> = {
    maximum_false_liquidity_load:
      numeric(asRecord(observation.false_liquidity_load)?.load) <=
      numeric(threshold.maximum_false_liquidity_load ?? 0.5),
    maximum_residual_debt:
      numeric(observation.residual_debt) <=
      numeric(threshold.maximum_residual_debt ?? 0),
    maximum_salience_obstruction:
      numeric(asRecord(observation.salience_obstruction_load)?.load) <=
      numeric(threshold.maximum_salience_obstruction ?? 0.5),
    minimum_accepted_packet_count:
      numeric(observation.accepted_packet_count) >=
      numeric(threshold.minimum_accepted_packet_count ?? 1),
    minimum_alt_to_ecpt_lift_count:
      numeric(observation.alt_certified_capital_count) >=
      numeric(threshold.minimum_alt_to_ecpt_lift_count ?? 0),
    minimum_closure_witness_count:
      numeric(observation.closure_witness_count) >=
      numeric(threshold.minimum_closure_witness_count ?? 1),
    minimum_effective_edge_count:
      numeric(observation.effective_edge_count) >=
      numeric(threshold.minimum_effective_edge_count ?? 1),
    minimum_execution_available_path_density:
      pathDensity >=
      numeric(threshold.minimum_execution_available_path_density ?? 0.1),
    minimum_verification_throughput:
      numeric(
        asRecord(observation.verification_throughput)?.throughput_ratio,
      ) >= numeric(threshold.minimum_verification_throughput ?? 0.1),
  };
  const failed = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([key]) => key)
    .sort();
  const status = failed.length === 0 ? "candidate" : "abstain";
  return {
    accepted: status === "candidate",
    abstention_reasons: failed.map(
      (component) => `missing finite threshold component: ${component}`,
    ),
    certificate_status: status,
    component_status: Object.fromEntries(Object.entries(checks).sort()),
    failed_components: failed,
    oracle_truth_proven: false,
    physical_truth_proven: false,
    protocol_relative: true,
    protocol_relative_only: true,
    real_asi_proof: false,
    reasons: [
      "threshold status is protocol-relative only",
      "threshold status does not prove real ASI",
    ],
    rejection_reasons: [],
    settled: false,
    status_id: "asi-proxy-threshold-status",
    threshold,
    threshold_distance: failed.length,
    observation,
  };
}

export function buildCollectivePhaseCertificateCandidate(
  thresholdStatus: JsonRecord,
  graph: JsonRecord,
): JsonRecord {
  const status = String(thresholdStatus.certificate_status ?? "abstain");
  const defects = stringList(thresholdStatus.failed_components).map(
    (component) => ({
      component,
      defect_id: `phase-defect:${component}`,
      defect_type: "threshold-component-missing",
      required_remediation: `provide finite evidence for ${component}`,
      residual_preserved: true,
    }),
  );
  return {
    accepted: status === "candidate",
    abstention_report:
      status === "candidate"
        ? null
        : {
            defects,
            protocol_relative_only: true,
            reasons: ["certificate abstains when finite evidence is missing"],
            report_id: "collective-phase-abstention",
            settled: false,
            threshold_status: thresholdStatus,
          },
    certificate_id: "collective-phase-certificate-candidate",
    certificate_status: status,
    defects,
    execution_authority_granted: false,
    finite_requirements_passed: status === "candidate",
    graph_id: String(graph.graph_id ?? ""),
    observation_id: String(
      asRecord(thresholdStatus.observation)?.observation_id ?? "",
    ),
    operationally_usable: status === "candidate",
    oracle_truth_proven: false,
    physical_truth_proven: false,
    protocol_relative_only: true,
    proves_physical_or_oracle_truth: false,
    proves_real_asi: false,
    reasons: [
      "certificate candidate is protocol-relative only",
      "certificate candidate does not prove real ASI",
      "certificate candidate does not settle diagnostic reports",
    ],
    settled: false,
    threshold_status: thresholdStatus,
    workflow_usable: true,
  };
}

export function loadPhaseLabObservation(
  storeDir: string,
  window = "latest",
): { observation: JsonRecord; graph: JsonRecord } {
  const selected = selectWindow(storeDir, window);
  const graph = buildEffectivePacketGraph({
    events: selected.events,
    graph_id: `effective-graph:${String(selected.index.window_id ?? "window")}`,
    source_window_id: String(selected.index.window_id ?? "window"),
  });
  return {
    observation: observePhaseWindow(selected.index, selected.events, graph),
    graph,
  };
}

export function loadPhaseLabGraph(
  storeDir: string,
  window = "all",
): JsonRecord {
  const selected = selectWindow(storeDir, window);
  return buildEffectivePacketGraph({
    events: selected.events,
    graph_id: `effective-graph:${String(selected.index.window_id ?? "window")}`,
    source_window_id: String(selected.index.window_id ?? "window"),
  });
}

export function exportPhaseLabStore(
  storeDir: string,
  outputDir: string,
): JsonRecord {
  mkdirSync(outputDir, { recursive: true });
  const manifest = writeManifest(storeDir);
  const events = readEvents(storeDir);
  const graph = buildEffectivePacketGraph({
    events,
    graph_id: "phase-lab-export-effective-graph",
    source_window_id: String(manifest.latest_window_id ?? "adhoc"),
  });
  const files: string[] = [];
  const write = (name: string, data: unknown): void => {
    writeJson(join(outputDir, name), data);
    files.push(name);
  };
  write("manifest.json", manifest);
  write("events.json", {
    absolute_paths_sanitized: true,
    events,
    settled: false,
  });
  write("effective_graph.json", graph);
  write("windows.json", {
    settled: false,
    windows: readWindowIndexes(storeDir),
  });
  if (events.length > 0) {
    const { observation } = loadPhaseLabObservation(storeDir, "latest");
    write("phase_window_observation.json", observation);
  }
  return {
    accepted: true,
    absolute_paths_sanitized: true,
    export_id: "phase-lab-export",
    files: files.sort(),
    output_dir: basename(outputDir),
    reasons: ["phase lab export sanitizes local paths and preserves residuals"],
    settled: false,
    store_manifest: manifest,
  };
}
