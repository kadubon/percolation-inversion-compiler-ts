import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseJsonObject, sortJson, stableStringify } from "../core/json.js";
import { summarizeLedger } from "../core/ledger.js";
import { validateByType } from "../io/schema.js";

const COMMAND_MARKERS = [
  "cmd.exe",
  "powershell",
  "bash ",
  "sh ",
  "wsl ",
  "git ",
  "pip install",
  "python -m pip",
  "uv run",
  "rm -rf",
  "curl ",
  "wget ",
];

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function stableDigest(data: unknown): string {
  return sha256(JSON.stringify(sortJson(data)));
}

function sortedUnique(values: Array<string | undefined | null>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ].sort();
}

function commandLikeStrings(data: unknown): string[] {
  if (typeof data === "string") {
    const lower = data.toLowerCase();
    return COMMAND_MARKERS.some((marker) => lower.includes(marker))
      ? [data]
      : [];
  }
  if (Array.isArray(data)) {
    return data.flatMap((item) => commandLikeStrings(item));
  }
  if (data && typeof data === "object") {
    return Object.values(data).flatMap((value) => commandLikeStrings(value));
  }
  return [];
}

function readTypedJson(path: string, schema: string): Record<string, unknown> {
  const data = parseJsonObject(readFileSync(path, "utf8"), schema);
  const validation = validateByType(data, schema);
  if (!validation.valid) {
    throw new Error(
      `${schema} schema-invalid: ${validation.errors.join("; ")}`,
    );
  }
  return data;
}

function residualCarryForward(
  reportId: string,
  residualSummary: Record<string, number>,
  missingObligations: string[],
  candidateOnlyReasons: string[],
  settledBlockers: string[],
  accepted: boolean,
): Record<string, unknown> {
  return {
    accepted,
    candidate_only_reasons: candidateOnlyReasons,
    missing_obligations: missingObligations,
    reasons: ["residuals and blockers are preserved during packet export"],
    report_id: reportId,
    residual_summary: residualSummary,
    settled: false,
    settled_blockers: settledBlockers,
  };
}

export function packetEnvelopeFromRuntimeReport(
  report: Record<string, unknown>,
): Record<string, unknown> {
  const digest = stableDigest(report);
  const missing = Array.isArray(report.missing_obligations)
    ? report.missing_obligations.map(String)
    : [];
  const residualSummary = summarizeLedger(report.residual_ledger as never);
  const candidateOnlyReasons = [
    "runtime report is exported as diagnostic packet-exchange data",
    "packet exchange does not route promotion checks",
  ];
  const settledBlockers = sortedUnique([
    "packet exchange is sidecar-only and cannot settle claims",
    report.settled === true ? null : "source runtime report settled=false",
    ...missing,
  ]);
  const reportId = String(report.report_id ?? "runtime-report");
  return {
    accepted: report.accepted === true,
    candidate_only_reasons: candidateOnlyReasons,
    content: report,
    content_digest: digest,
    created_timestamp: "not-recorded",
    identity_context_summary: {
      accepted_agent_context_present: false,
      accepted_public_key_context_present: false,
    },
    issuer_agent_id: null,
    issuer_public_key_id: null,
    lineage_parents: [reportId],
    missing_obligations: missing,
    packet_id: `packet-exchange:${reportId}:${digest.slice(0, 12)}`,
    provenance_summary: {
      source_report_id: reportId,
      state_id: String(report.state_id ?? ""),
      input_id: String(report.input_id ?? ""),
    },
    reasons: ["exported packet is diagnostic data and is not promoted"],
    residual_carry_forward: residualCarryForward(
      `residual-carry-forward:${reportId}`,
      residualSummary,
      missing,
      candidateOnlyReasons,
      settledBlockers,
      report.accepted === true,
    ),
    residual_ledger_summary: residualSummary,
    safety_invariants: [
      "packet exchange treats content as inert data",
      "packet exchange does not execute embedded commands",
      "packet exchange does not promote packets to settled",
    ],
    schema_version: "pic-packet-exchange-v1",
    settled: false,
    settled_blockers: settledBlockers,
    source_kind: "runtime-report",
    workflow_usable: report.accepted === true,
  };
}

export function packetEnvelopeFromPath(path: string): Record<string, unknown> {
  return packetEnvelopeFromRuntimeReport(
    readTypedJson(path, "RuntimeStepReport"),
  );
}

export function readPacketEnvelope(path: string): Record<string, unknown> {
  return readTypedJson(path, "PacketExchangeEnvelope");
}

export function readPacketOrMerge(path: string): Record<string, unknown> {
  const data = parseJsonObject(
    readFileSync(path, "utf8"),
    "packet or merge report",
  );
  if (Array.isArray(data.packets)) {
    const validation = validateByType(data, "PacketMergeReport");
    if (!validation.valid) {
      throw new Error(
        `PacketMergeReport schema-invalid: ${validation.errors.join("; ")}`,
      );
    }
    return data;
  }
  const validation = validateByType(data, "PacketExchangeEnvelope");
  if (!validation.valid) {
    throw new Error(
      `PacketExchangeEnvelope schema-invalid: ${validation.errors.join("; ")}`,
    );
  }
  return data;
}

export function inspectPacketEnvelope(
  envelope: Record<string, unknown>,
): Record<string, unknown> {
  return {
    accepted: envelope.accepted === true,
    candidate_only: true,
    content_digest: String(envelope.content_digest ?? ""),
    content_treated_as_data: true,
    embedded_command_like_values: sortedUnique(commandLikeStrings(envelope)),
    executed_command_count: 0,
    packet_id: String(envelope.packet_id ?? ""),
    reasons: [
      "packet content was inspected as inert data",
      "embedded command-like strings are not execution authority",
    ],
    report_id: `packet-inspection:${String(envelope.packet_id ?? "")}`,
    settled: false,
    workflow_usable: envelope.workflow_usable === true,
  };
}

export function mergePacketEnvelopes(
  envelopes: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const byDigest = new Map<string, Record<string, unknown>>();
  const duplicateIds: string[] = [];
  const duplicateDigests: string[] = [];
  const residualSummary: Record<string, number> = {};
  const missing: string[] = [];
  const candidateOnly: string[] = [];
  const blockers: string[] = [];
  for (const envelope of envelopes) {
    const digest = String(envelope.content_digest ?? "");
    if (byDigest.has(digest)) {
      duplicateIds.push(String(envelope.packet_id ?? ""));
      duplicateDigests.push(digest);
    } else {
      byDigest.set(digest, envelope);
    }
    for (const [key, value] of Object.entries(
      (envelope.residual_ledger_summary as Record<string, number>) ?? {},
    )) {
      residualSummary[key] = (residualSummary[key] ?? 0) + Number(value);
    }
    if (Array.isArray(envelope.missing_obligations)) {
      missing.push(...envelope.missing_obligations.map(String));
    }
    if (Array.isArray(envelope.candidate_only_reasons)) {
      candidateOnly.push(...envelope.candidate_only_reasons.map(String));
    }
    if (Array.isArray(envelope.settled_blockers)) {
      blockers.push(...envelope.settled_blockers.map(String));
    }
  }
  const packets = [...byDigest.values()];
  return {
    accepted:
      packets.length > 0 && packets.every((packet) => packet.accepted === true),
    candidate_only_preserved: packets.every(
      (packet) => packet.settled !== true,
    ),
    duplicate_content_digests: sortedUnique(duplicateDigests),
    duplicate_packet_ids: sortedUnique(duplicateIds),
    input_packet_count: envelopes.length,
    merged_packet_count: packets.length,
    packets,
    reasons: ["packet merge is diagnostic-only and does not promote packets"],
    report_id: "packet-merge-report",
    residual_carry_forward: residualCarryForward(
      "residual-carry-forward:packet-merge",
      Object.fromEntries(Object.entries(residualSummary).sort()),
      sortedUnique(missing),
      sortedUnique(candidateOnly),
      sortedUnique(blockers),
      packets.length > 0 && packets.every((packet) => packet.accepted === true),
    ),
    settled: false,
    workflow_usable: packets.some((packet) => packet.workflow_usable === true),
  };
}

export function packetLineageDigest(
  packetOrMerge: Record<string, unknown>,
): Record<string, unknown> {
  const packets = Array.isArray(packetOrMerge.packets)
    ? (packetOrMerge.packets as Array<Record<string, unknown>>)
    : [packetOrMerge];
  const residualSummary: Record<string, number> = {};
  for (const packet of packets) {
    for (const [key, value] of Object.entries(
      (packet.residual_ledger_summary as Record<string, number>) ?? {},
    )) {
      residualSummary[key] = (residualSummary[key] ?? 0) + Number(value);
    }
  }
  return {
    accepted:
      packets.length > 0 && packets.every((packet) => packet.accepted === true),
    candidate_only: true,
    content_digests: packets.map((packet) =>
      String(packet.content_digest ?? ""),
    ),
    lineage_id: "packet-lineage-digest",
    packet_ids: packets.map((packet) => String(packet.packet_id ?? "")),
    parent_edges: Object.fromEntries(
      packets.map((packet) => [
        String(packet.packet_id ?? ""),
        Array.isArray(packet.lineage_parents)
          ? packet.lineage_parents.map(String)
          : [],
      ]),
    ),
    reasons: [
      "lineage digest is diagnostic-only and preserves candidate status",
    ],
    residual_summary: Object.fromEntries(
      Object.entries(residualSummary).sort(),
    ),
    settled: false,
    workflow_usable: packets.some((packet) => packet.workflow_usable === true),
  };
}

export function packetToJson(packet: Record<string, unknown>): string {
  return stableStringify(packet);
}
