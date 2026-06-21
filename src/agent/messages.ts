import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseJsonObject, stableStringify } from "../core/json.js";
import { emptyLedger, residualLedger } from "../core/ledger.js";
import { runtimeIdentityContextAccepted } from "../io/identity.js";
import { validateByType } from "../io/schema.js";

export interface AgentMessageCreateOptions {
  sender: string;
  text: string;
  receiver?: string;
  nonce?: string;
}

export interface MessagePolicyOptions {
  profile?: string;
  seenNonces?: string[];
  identityContextPath?: string;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function sortedUnique(values: Array<string | undefined | null>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ].sort();
}

function acceptedIdentityContext(path: string | undefined): boolean {
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

export function createAgentMessage(
  options: AgentMessageCreateOptions,
): Record<string, unknown> {
  const digest = sha256(options.text);
  return {
    audience: [],
    content: options.text,
    content_sha256: digest,
    declared_packet_kind: "capability-packet-candidate",
    declared_receiver_family: ["agent", "verifier"],
    declared_routes: [],
    declared_validity_domain: "protocol-relative-finite",
    evidence_refs: [],
    expires_at: null,
    issued_at: null,
    issuer_attestation_id: null,
    issuer_public_key_id: null,
    message_id: `agent-message:${digest.slice(0, 12)}`,
    metadata: {},
    nonce: options.nonce ?? null,
    protocol_version: "pic-agent-message-v1",
    receiver_agent_id: options.receiver ?? null,
    reply_to: null,
    route_request_refs: [],
    sender_agent_id: options.sender,
    signature_ref: null,
    tags: ["agent-message"],
    thread_id: null,
  };
}

export function readAgentMessage(path: string): Record<string, unknown> {
  const message = parseJsonObject(readFileSync(path, "utf8"), "agent message");
  const validation = validateByType(message, "AgentMessageEnvelope");
  if (!validation.valid) {
    throw new Error(
      `agent message schema-invalid: ${validation.errors.join("; ")}`,
    );
  }
  return message;
}

export function agentMessageContract(
  message: Record<string, unknown>,
): Record<string, unknown> {
  const content = String(message.content ?? "");
  const digestValid = sha256(content) === message.content_sha256;
  const declaredReceiverFamily = Array.isArray(message.declared_receiver_family)
    ? message.declared_receiver_family.map(String)
    : [];
  const evidenceRefs = Array.isArray(message.evidence_refs)
    ? message.evidence_refs.map(String)
    : [];
  const routeRefs = Array.isArray(message.route_request_refs)
    ? message.route_request_refs.map(String)
    : [];
  const reasons = digestValid ? [] : ["message content digest mismatch"];
  return {
    accepted: digestValid,
    candidate_only: true,
    declared_packet_kind:
      message.declared_packet_kind ?? "capability-packet-candidate",
    declared_receiver_family: declaredReceiverFamily,
    declared_validity_domain:
      message.declared_validity_domain ?? "protocol-relative-finite",
    evidence_refs: evidenceRefs,
    message_contract_valid: digestValid,
    message_id: message.message_id ?? null,
    protocol_version: message.protocol_version ?? "pic-agent-message-v1",
    reasons,
    receiver_agent_id: message.receiver_agent_id ?? null,
    report_id: `agent-message-contract:${sha256(stableStringify(message)).slice(0, 12)}`,
    residual_ledger: digestValid
      ? emptyLedger()
      : residualLedger(
          `agent-message:${String(message.message_id ?? "unknown")}:digest-mismatch`,
          1,
          "message content digest mismatch",
        ),
    route_request_refs: routeRefs,
    sender_agent_id: message.sender_agent_id ?? null,
    settled: false,
  };
}

export function verifyAgentMessage(
  message: Record<string, unknown>,
  options: MessagePolicyOptions = {},
): Record<string, unknown> {
  const profile = options.profile ?? "development";
  const contract = agentMessageContract(message);
  const content = String(message.content ?? "");
  const digest = String(message.content_sha256 ?? sha256(content));
  const nonce = typeof message.nonce === "string" ? message.nonce : null;
  const replayDetected = Boolean(nonce && options.seenNonces?.includes(nonce));
  const signaturePresent = Boolean(
    message.signature_ref &&
    message.issuer_public_key_id &&
    message.issuer_attestation_id,
  );
  const signatureRequired = ["production", "adversarial"].includes(
    profile.toLowerCase(),
  );
  const identityRequired = signatureRequired;
  const identityAccepted = acceptedIdentityContext(options.identityContextPath);
  const reasons: string[] = [
    ...((contract.reasons as string[] | undefined) ?? []),
  ];
  const identityReasons: string[] = [];
  if (replayDetected) {
    reasons.push("message replay nonce was already seen");
  }
  if (signatureRequired && !signaturePresent) {
    reasons.push("signed agent message required by profile");
  }
  if (identityRequired && !identityAccepted) {
    identityReasons.push("accepted identity context required by profile");
  }
  reasons.push(...identityReasons);
  const accepted = contract.accepted === true && reasons.length === 0;
  const packetId = `packet:agent-message:${String(message.message_id ?? "unknown")}`;
  const packets =
    contract.accepted === true
      ? [
          {
            authority_granted: false,
            authority_requested: false,
            authority_required: false,
            claim: content,
            content_sha256: digest,
            dependencies: [],
            evidence_hash_valid: true,
            evidence_refs: sortedUnique([
              ...(Array.isArray(message.evidence_refs)
                ? message.evidence_refs.map(String)
                : []),
              `sha256:${digest}`,
              `agent-message:${String(message.message_id ?? "unknown")}`,
            ]),
            expected_downstream_gain: 0.00125,
            expires_at: null,
            freshness: 1,
            hazard_charge: 0,
            identity_contribution_status: "provisional",
            issuer_agent_id: message.sender_agent_id ?? null,
            issuer_attestation_id: message.issuer_attestation_id ?? null,
            issuer_public_key_id: message.issuer_public_key_id ?? null,
            issuer_signature_ref: message.signature_ref ?? null,
            packet_id: packetId,
            receiver_family: Array.isArray(message.declared_receiver_family)
              ? message.declared_receiver_family.map(String)
              : ["agent", "verifier"],
            residual_charge: 0,
            reuse_context: "general",
            rollback_available: true,
            route_safe: true,
            salience_class: "packet",
            source_kind: "agent-message",
            source_ref: String(message.message_id ?? "unknown"),
            status: "provisional",
            tags: sortedUnique([
              ...(Array.isArray(message.tags) ? message.tags.map(String) : []),
              "agent-message",
              "external-candidate",
              "general",
            ]),
            verification_cost: 0.005,
            verifier_routes: Array.isArray(message.declared_routes)
              ? message.declared_routes.map(String)
              : [],
          },
        ]
      : [];
  return {
    accepted,
    candidate_packet_ids: packets.map((packet) => packet.packet_id),
    consumed_nonces: accepted && nonce ? [nonce] : [],
    identity_reasons: sortedUnique(identityReasons),
    identity_status: identityAccepted
      ? "verified"
      : identityRequired
        ? "required"
        : "not-required",
    identity_verified: identityAccepted,
    message_contract_valid: contract.accepted === true,
    message_id: message.message_id ?? null,
    next_safe_commands: [
      "uv run pic agent message contract --message <message.json>",
      "uv run pic ecology bridge-runtime --report <general-intake-report.json>",
    ],
    nonce_ledger: {
      accepted,
      consumed_nonces: accepted && nonce ? [nonce] : [],
      ledger_id: "agent-message-nonce-ledger",
      reasons: sortedUnique(reasons),
      rejected_message_ids: accepted
        ? []
        : [String(message.message_id ?? "unknown")],
      replayed_nonces: replayDetected && nonce ? [nonce] : [],
    },
    nonce_status: replayDetected
      ? "replayed"
      : nonce && accepted
        ? "consumed"
        : "not-provided",
    packets,
    quarantine_recommended: reasons.length > 0,
    reasons: sortedUnique(reasons),
    replay_detected: replayDetected,
    report_id: `agent-message-check:${String(message.message_id ?? "unknown")}`,
    residual_ledger:
      reasons.length === 0
        ? emptyLedger()
        : residualLedger(
            `agent-message:${String(message.message_id ?? "unknown")}:verification-residual`,
            reasons.length,
            "agent message verification residual",
          ),
    sender_agent_id: message.sender_agent_id ?? null,
    settled: false,
    signature_present: signaturePresent,
    signature_required: signatureRequired,
  };
}

export function initAgentInbox(
  path: string,
  inboxId = "agent-inbox",
): Record<string, unknown> {
  const record = {
    inbox_id: inboxId,
    messages: [],
    peers: [],
    seen_nonces: [],
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stableStringify(record), "utf8");
  return record;
}

export function readAgentInbox(path: string): Record<string, unknown> {
  const text = readFileSync(path, "utf8").trim();
  if (text.includes("\n") && !text.startsWith("{")) {
    return {
      inbox_id: "agent-inbox",
      messages: text
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => parseJsonObject(line, "agent inbox line")),
      peers: [],
      seen_nonces: [],
    };
  }
  const inbox = parseJsonObject(text, "agent inbox");
  const validation = validateByType(inbox, "AgentInboxRecord");
  if (!validation.valid) {
    throw new Error(
      `agent inbox schema-invalid: ${validation.errors.join("; ")}`,
    );
  }
  return inbox;
}

export function writeAgentInbox(
  path: string,
  inbox: Record<string, unknown>,
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stableStringify(inbox), "utf8");
}

export function appendAgentMessage(
  inboxPath: string,
  message: Record<string, unknown>,
): Record<string, unknown> {
  const inbox = existsSync(inboxPath)
    ? readAgentInbox(inboxPath)
    : { inbox_id: "agent-inbox", messages: [], peers: [], seen_nonces: [] };
  const messages = Array.isArray(inbox.messages) ? inbox.messages : [];
  const updated = {
    ...inbox,
    messages: [...messages, message],
  };
  writeAgentInbox(inboxPath, updated);
  return updated;
}

export function deliveryReport(
  action: string,
  inboxRef: string,
  inbox: Record<string, unknown>,
  reports: Array<Record<string, unknown>>,
  profile = "development",
): Record<string, unknown> {
  const accepted = reports.every((report) => report.accepted === true);
  const delivered = accepted
    ? reports.map((report) => String(report.message_id ?? "unknown"))
    : [];
  const rejected = accepted
    ? []
    : reports.map((report) => String(report.message_id ?? "unknown"));
  const consumed = sortedUnique(
    reports.flatMap((report) =>
      Array.isArray(report.consumed_nonces)
        ? report.consumed_nonces.map(String)
        : [],
    ),
  );
  const reasons = sortedUnique(
    reports.flatMap((report) =>
      Array.isArray(report.reasons) ? report.reasons.map(String) : [],
    ),
  );
  return {
    accepted,
    action,
    candidate_only: true,
    candidate_packet_ids: sortedUnique(
      reports.flatMap((report) =>
        Array.isArray(report.candidate_packet_ids)
          ? report.candidate_packet_ids.map(String)
          : [],
      ),
    ),
    delivered_message_ids: delivered,
    exchange_reports: reports,
    identity_context_accepted: false,
    inbox_id: inbox.inbox_id ?? "agent-inbox",
    inbox_ref: inboxRef,
    message_ids: reports.map((report) =>
      String(report.message_id ?? "unknown"),
    ),
    next_safe_commands: [
      "uv run pic agent inbox verify --inbox <inbox.json>",
      "uv run pic ecology bridge-runtime --report <general-intake-report.json>",
    ],
    nonce_ledger: {
      accepted,
      consumed_nonces: consumed,
      ledger_id: "agent-message-nonce-ledger",
      reasons,
      rejected_message_ids: rejected,
      replayed_nonces: [],
    },
    operationally_usable: accepted,
    profile,
    reasons,
    rejected_message_ids: rejected,
    report_id: `agent-message-delivery:${action}:${String(inbox.inbox_id ?? "agent-inbox")}`,
    settled: false,
  };
}

export function receiveAgentInbox(
  inboxPath: string,
  options: MessagePolicyOptions = {},
): Record<string, unknown> {
  const inbox = readAgentInbox(inboxPath);
  const seen = Array.isArray(inbox.seen_nonces)
    ? inbox.seen_nonces.map(String)
    : [];
  const messages = Array.isArray(inbox.messages)
    ? (inbox.messages as Array<Record<string, unknown>>)
    : [];
  const reports = messages.map((message) =>
    verifyAgentMessage(message, { ...options, seenNonces: seen }),
  );
  return deliveryReport(
    "receive",
    inboxPath,
    inbox,
    reports,
    options.profile ?? "development",
  );
}
