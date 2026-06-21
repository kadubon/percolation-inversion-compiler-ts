#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { Command } from "commander";
import { altAdmit } from "../alt/index.js";
import {
  accelerateAgentPhase,
  buildAgentAutonomyAudit,
  buildAgentRunbook,
  requestFromCli,
  runAgentCheck,
  runAgentIntake,
  runtimeOptionsFromCli,
} from "../agent/index.js";
import {
  agentMessageContract,
  appendAgentMessage,
  createAgentMessage,
  deliveryReport,
  initAgentInbox,
  readAgentInbox,
  readAgentMessage,
  receiveAgentInbox,
  verifyAgentMessage,
} from "../agent/messages.js";
import { parseJsonObject } from "../core/json.js";
import { stableStringify } from "../core/json.js";
import { ecologyPolicy, packetFromText } from "../ecology/index.js";
import {
  fixtureJson,
  portabilityManifest,
  pythonCliFixture,
} from "../io/fixtures.js";
import { fixtureRoot } from "../io/paths.js";
import { verifyPortabilityManifest } from "../io/portability.js";
import {
  schemaBundle,
  schemaByType,
  validateByType,
  writeAllSchemas,
} from "../io/schema.js";
import {
  inspectPacketEnvelope,
  mergePacketEnvelopes,
  packetEnvelopeFromPath,
  packetLineageDigest,
  readPacketEnvelope,
  readPacketOrMerge,
} from "../packet/index.js";
import {
  buildPhaseAccelerationBenchmark,
  buildPhaseAccelerationPlan,
  phaseAccelerationCompactPayload,
  phaseAccelerationRunbook,
} from "../phase/index.js";
import type { PhaseAccelerationRequest } from "../phase/index.js";
import { buildRuntimeStep, runtimeHealth } from "../runtime/index.js";
import { buildSalienceSchedule } from "../sqot/index.js";
import { compileTrc } from "../trc/index.js";

const VERSION = "0.4.4";

function outputJson(data: unknown, output?: string): void {
  const text = stableStringify(data);
  if (output) {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, text, "utf8");
  } else {
    process.stdout.write(text);
  }
}

function readText(
  options: Record<string, unknown>,
  fallback = "Candidate packet: preserve residuals.",
): string {
  if (
    typeof options.text === "string" &&
    typeof options.textFile === "string"
  ) {
    throw new Error("Use either --text or --text-file, not both");
  }
  if (typeof options.text === "string") {
    return options.text;
  }
  if (typeof options.textFile === "string") {
    return readFileSync(options.textFile, "utf8");
  }
  return fallback;
}

function readRequiredText(options: Record<string, unknown>): string {
  if (
    typeof options.text !== "string" &&
    typeof options.textFile !== "string"
  ) {
    throw new Error("message content requires --text or --text-file");
  }
  return readText(options, "");
}

function optionalText(options: Record<string, unknown>): string | undefined {
  if (
    typeof options.text === "string" ||
    typeof options.textFile === "string"
  ) {
    return readText(options, "");
  }
  return undefined;
}

function diagnostic(
  command: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    command,
    accepted: true,
    workflow_usable: true,
    operationally_usable: false,
    execution_authority_granted: false,
    settled: false,
    residual_ledger: {
      coordinates: {
        [`${command}:external-obligation`]: {
          name: `${command}:external-obligation`,
          value: 1,
          unit: "dimensionless",
          kind: "residual",
          description:
            "TypeScript port preserves the public boundary and returns diagnostic residuals for unsupported heavy routes",
        },
      },
    },
    missing_obligations: [`${command}:finite-verifier-route`],
    reasons: [
      "diagnostic-only route; no execution authority granted",
      "settled remains false",
    ],
    ...extra,
  };
}

function recordList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function boolOptionOrRequest(
  optionValue: unknown,
  requestValue: unknown,
): boolean | undefined {
  if (optionValue === false) {
    return false;
  }
  if (typeof requestValue === "boolean") {
    return requestValue;
  }
  return typeof optionValue === "boolean" ? optionValue : undefined;
}

function readPhaseRequest(path: string): Record<string, unknown> {
  return parseJsonObject(readFileSync(path, "utf8"), "phase request");
}

function phaseRequestFromCli(
  options: Record<string, unknown>,
): PhaseAccelerationRequest {
  if (typeof options.request === "string") {
    const request = readPhaseRequest(options.request);
    return {
      request_id: String(request.request_id ?? "phase-cli"),
      profile: String(request.profile ?? options.profile ?? "development"),
      compact: Boolean(options.compact) && !options.full,
      agent_output: optionalString(request.agent_output),
      allow_live_connectors: boolOptionOrRequest(
        options.allowLiveConnectors,
        request.allow_live_connectors,
      ),
      identity_context_path: optionalString(request.identity_context_path),
      general_intake_bridge_reports: recordList(
        request.general_intake_bridge_reports,
      ),
      alt_admission_decisions: recordList(request.alt_admission_decisions),
      runtime_report: optionalRecord(request.runtime_report),
    };
  }
  const runtimeReport =
    typeof options.runtimeReport === "string"
      ? parseJsonObject(
          readFileSync(options.runtimeReport, "utf8"),
          "runtime report",
        )
      : undefined;
  return {
    request_id: "phase-cli",
    profile: String(options.profile ?? "development"),
    compact: Boolean(options.compact) && !options.full,
    agent_output: optionalText(options),
    allow_live_connectors: options.allowLiveConnectors as boolean | undefined,
    identity_context_path: optionalString(options.identityContext),
    runtime_report: runtimeReport,
  };
}

function assertPhaseRequestExclusive(options: Record<string, unknown>): void {
  const otherInputs = [
    options.runtimeReport,
    options.state,
    options.input,
    options.text,
    options.textFile,
    options.identityContext,
  ].filter(Boolean);
  if (options.request && otherInputs.length > 0) {
    throw new Error(
      "--request cannot be combined with runtime/text/state inputs",
    );
  }
}

function addOutputOptions(command: Command): Command {
  return command.option(
    "--output <path>",
    "write JSON to path instead of stdout",
  );
}

function addProfile(command: Command): Command {
  return command.option(
    "--profile <profile>",
    "runtime profile",
    "development",
  );
}

function addTextOptions(command: Command): Command {
  return command
    .option("--text <text>", "literal agent output")
    .option("--text-file <path>", "read agent output from file");
}

const program = new Command();
program
  .name("pic")
  .description(
    "TypeScript port of percolation-inversion-compiler v0.4.4 public CLI contracts.",
  )
  .version(VERSION);
program.exitOverride();

addOutputOptions(
  addProfile(
    program.command("doctor").description("Run operational readiness checks."),
  ),
)
  .option("--fail-on <mode>", "fail mode", "never")
  .action((options) =>
    outputJson(
      options.profile === "development" || options.profile === undefined
        ? pythonCliFixture("doctor_development")
        : diagnostic("doctor", {
            overall_status: options.failOn === "never" ? "warn" : "diagnostic",
          }),
      options.output,
    ),
  );

addOutputOptions(
  program
    .command("schema")
    .description("Emit canonical Python v0.4.4 JSON Schema."),
)
  .option("--type <typeName>", "schema type", "Registry")
  .option(
    "--all",
    "emit the schema bundle or copy all schemas when --output-dir is supplied",
  )
  .option("--output-dir <dir>", "copy all schema files into a directory")
  .action((options) => {
    if (options.all && options.outputDir) {
      writeAllSchemas(options.outputDir);
      return;
    }
    outputJson(
      options.all ? schemaBundle() : schemaByType(options.type),
      options.output,
    );
  });

addOutputOptions(
  program
    .command("validate")
    .requiredOption("--registry <path>", "Registry JSON file")
    .description(
      "Validate a registry-like JSON object against the public schema.",
    ),
).action((options) => {
  const registry = parseJsonObject(
    readFileSync(options.registry, "utf8"),
    "registry",
  );
  const result = validateByType(registry, "Registry");
  outputJson(
    {
      registry: options.registry,
      valid: result.valid,
      errors: result.errors,
    },
    options.output,
  );
  if (!result.valid) {
    process.exitCode = 1;
  }
});

const portability = program
  .command("portability")
  .description("Verify cross-language conformance packs.");
addOutputOptions(
  portability
    .command("verify")
    .requiredOption("--manifest <path>", "manifest path")
    .option("--fail-on <mode>", "exit nonzero on: fail or never", "fail"),
).action((options) => {
  if (!["fail", "never"].includes(options.failOn)) {
    throw new Error("--fail-on must be one of: fail, never");
  }
  const report = verifyPortabilityManifest(options.manifest);
  outputJson(report, options.output);
  if (options.failOn === "fail" && !report.accepted) {
    process.exitCode = 1;
  }
});

const snapshot = program
  .command("snapshot")
  .description("Inspect bundled derived theory snapshots.");
addOutputOptions(snapshot.command("list")).action((options) =>
  outputJson(pythonCliFixture("snapshot_list"), options.output),
);
addOutputOptions(
  snapshot.command("show").requiredOption("--artifact <key>", "artifact key"),
).action((options) =>
  outputJson(
    pythonCliFixture(`snapshot_show_${options.artifact}`),
    options.output,
  ),
);
addOutputOptions(
  snapshot.command("verify").requiredOption("--artifact <key>", "artifact key"),
).action((options) =>
  outputJson(
    pythonCliFixture(`snapshot_verify_${options.artifact}`),
    options.output,
  ),
);
addOutputOptions(snapshot.command("routes")).action((options) =>
  outputJson(pythonCliFixture("snapshot_routes"), options.output),
);

const routes = program
  .command("routes")
  .description("Inspect verifier route bindings.");
addOutputOptions(routes.command("bindings")).action((options) =>
  outputJson(pythonCliFixture("routes_bindings"), options.output),
);
addOutputOptions(
  routes.command("explain").requiredOption("--route <route>", "route id"),
).action((options) => {
  if (options.route === "adapters.domain.replay_trc_physical_trace") {
    outputJson(
      pythonCliFixture("routes_explain_replay_trc_physical_trace"),
      options.output,
    );
    return;
  }
  const routesPayload = pythonCliFixture("snapshot_routes");
  const bindingsPayload = pythonCliFixture("routes_bindings");
  const route = (
    (routesPayload.routes as Array<Record<string, unknown>>) ?? []
  ).find(
    (item) =>
      item.route_id === options.route || item.verifier_route === options.route,
  );
  if (!route) {
    throw new Error(`unknown adapter route ${JSON.stringify(options.route)}`);
  }
  const binding = (
    (bindingsPayload.bindings as Array<Record<string, unknown>>) ?? []
  ).find((item) => item.route_id === route.route_id);
  outputJson(
    {
      route,
      binding: binding ?? null,
      settled_scope: binding?.settlement_scope ?? [],
      finite_scope_usable:
        (binding?.discharge_level ?? route.discharge_level) !==
        "external_domain_required",
      residual_external_obligations:
        binding?.residual_external_obligation_refs ?? [],
      required_evidence_kind: route.required_evidence_kind,
    },
    options.output,
  );
});

const evidence = program
  .command("evidence")
  .description("Verify external evidence envelopes.");
addOutputOptions(
  addProfile(
    evidence.command("verify").option("--envelope <path>", "evidence envelope"),
  ),
).action((options) =>
  outputJson(
    diagnostic("evidence:verify", {
      profile: options.profile,
      envelope: options.envelope ?? null,
    }),
    options.output,
  ),
);
addOutputOptions(
  addProfile(
    evidence
      .command("discharge")
      .option("--envelope <path>", "evidence envelope")
      .option("--obligations <path>", "obligations"),
  ),
).action((options) =>
  outputJson(
    diagnostic("evidence:discharge", {
      profile: options.profile,
      envelope: options.envelope ?? null,
      obligations: options.obligations ?? null,
    }),
    options.output,
  ),
);

const agent = program.command("agent").description("Agent-facing shortcuts.");
agent.command("explain").action(() => {
  process.stdout.write(
    "PIC checks finite agent output routes, preserves residual ledgers, and does not promote accepted output to settled.\n",
  );
});
addOutputOptions(addProfile(addTextOptions(agent.command("intake"))))
  .option("--no-allow-live-connectors", "disable live connector intake")
  .option("--identity-context <path>", "identity context")
  .action((options) =>
    outputJson(
      runAgentIntake({
        ...requestFromCli(options),
        agent_output: optionalText(options),
      }),
      options.output,
    ),
  );
addOutputOptions(addProfile(addTextOptions(agent.command("check"))))
  .option("--compact", "compact output")
  .option("--no-allow-live-connectors", "disable live connector intake")
  .option("--identity-context <path>", "identity context")
  .action((options) =>
    outputJson(
      runAgentCheck(
        { ...requestFromCli(options), agent_output: optionalText(options) },
        Boolean(options.compact),
      ),
      options.output,
    ),
  );
addOutputOptions(addProfile(addTextOptions(agent.command("accelerate"))))
  .option("--compact", "compact output")
  .option("--no-allow-live-connectors", "disable live connector intake")
  .option("--identity-context <path>", "identity context")
  .action((options) =>
    outputJson(
      accelerateAgentPhase(
        { ...requestFromCli(options), agent_output: optionalText(options) },
        Boolean(options.compact),
      ),
      options.output,
    ),
  );
addOutputOptions(addProfile(agent.command("runbook"))).action((options) =>
  outputJson(buildAgentRunbook(options.profile), options.output),
);
addOutputOptions(
  addProfile(
    agent
      .command("autonomy-audit")
      .option("--format <format>", "json or markdown", "json")
      .option("--language <language>", "en or ja", "en"),
  ),
).action((options) => {
  const report = buildAgentAutonomyAudit(options.profile);
  if (options.format === "markdown") {
    process.stdout.write(
      `# Agent Autonomy Audit\n\n- accepted: ${report.accepted}\n- workflow_usable: ${report.workflow_usable}\n- settled: ${report.settled}\n- safe_commands_executable_by_pic: ${report.safe_commands_executable_by_pic}\n`,
    );
    return;
  }
  outputJson(report, options.output);
});
addOutputOptions(addProfile(agent.command("doctor"))).action((options) =>
  outputJson(
    diagnostic("agent:doctor", { profile: options.profile }),
    options.output,
  ),
);
addOutputOptions(addProfile(agent.command("guide"))).action((options) =>
  outputJson(
    {
      ...pythonCliFixture("agent_manifest"),
      profile: options.profile,
      guide_id: "agent-guide",
      accepted: true,
      workflow_usable: true,
      operationally_usable: true,
      settled: false,
    },
    options.output,
  ),
);
addOutputOptions(
  addProfile(
    agent.command("communication-guide").option("--no-allow-live-connectors"),
  ),
).action((options) =>
  outputJson(pythonCliFixture("agent_communication_guide"), options.output),
);
addOutputOptions(addProfile(agent.command("network-readiness"))).action(
  (options) =>
    outputJson(
      diagnostic("agent:network-readiness", {
        profile: options.profile,
        accepted: true,
      }),
      options.output,
    ),
);
addOutputOptions(
  addProfile(agent.command("relay-readiness").option("--inbox <path>")),
).action((options) =>
  outputJson(fixtureJson("agent_relay_readiness_report.json"), options.output),
);
addOutputOptions(addProfile(agent.command("readiness"))).action((options) =>
  outputJson(
    diagnostic("agent:readiness", { profile: options.profile }),
    options.output,
  ),
);
addOutputOptions(
  addProfile(agent.command("next").option("--intake-report <path>")),
).action((options) =>
  outputJson(
    {
      report_id: "agent-next",
      profile: options.profile,
      next_commands: ["pic phase plan --compact"],
      accepted: true,
      operationally_usable: true,
      settled: false,
    },
    options.output,
  ),
);
addOutputOptions(agent.command("manifest")).action((options) =>
  outputJson(pythonCliFixture("agent_manifest"), options.output),
);

const inbox = agent.command("inbox");
addOutputOptions(
  inbox
    .command("init")
    .requiredOption("--inbox <path>")
    .option("--inbox-id <id>", "portable inbox identifier", "agent-inbox"),
).action((options) =>
  outputJson(initAgentInbox(options.inbox, options.inboxId), options.output),
);
addOutputOptions(
  inbox
    .command("append")
    .requiredOption("--inbox <path>")
    .requiredOption("--message <path>"),
).action((options) =>
  outputJson(
    appendAgentMessage(options.inbox, readAgentMessage(options.message)),
    options.output,
  ),
);
addOutputOptions(
  inbox.command("export").requiredOption("--inbox <path>"),
).action((options) =>
  outputJson(readAgentInbox(options.inbox), options.output),
);
addOutputOptions(
  addProfile(
    inbox
      .command("verify")
      .requiredOption("--inbox <path>")
      .option("--identity-context <path>"),
  ),
).action((options) => {
  const report = receiveAgentInbox(options.inbox, {
    profile: options.profile,
    identityContextPath: options.identityContext,
  });
  outputJson(report, options.output);
  if (!report.accepted) {
    process.exitCode = 1;
  }
});

const message = agent.command("message");
addOutputOptions(
  message
    .command("create")
    .requiredOption("--sender <sender>")
    .option("--text <text>", "text")
    .option("--text-file <path>", "read message content from file")
    .option("--receiver <receiver>", "optional receiver agent id")
    .option("--nonce <nonce>", "optional replay nonce"),
).action((options) =>
  outputJson(
    createAgentMessage({
      sender: options.sender,
      text: readRequiredText(options),
      receiver: options.receiver,
      nonce: options.nonce,
    }),
    options.output,
  ),
);
addOutputOptions(
  addProfile(
    message
      .command("send")
      .requiredOption("--inbox <path>")
      .requiredOption("--sender <sender>")
      .option("--text <text>")
      .option("--text-file <path>")
      .option("--receiver <receiver>")
      .option("--nonce <nonce>")
      .option("--identity-context <path>"),
  ),
).action((options) => {
  const envelope = createAgentMessage({
    sender: options.sender,
    text: readRequiredText(options),
    receiver: options.receiver,
    nonce: options.nonce,
  });
  const report = verifyAgentMessage(envelope, {
    profile: options.profile,
    identityContextPath: options.identityContext,
  });
  const inboxRecord =
    report.accepted === true
      ? appendAgentMessage(options.inbox, envelope)
      : existsSync(options.inbox)
        ? readAgentInbox(options.inbox)
        : { inbox_id: "agent-inbox", messages: [], peers: [], seen_nonces: [] };
  const delivery = deliveryReport(
    "send",
    options.inbox,
    inboxRecord,
    [report],
    options.profile,
  );
  outputJson(delivery, options.output);
  if (!delivery.accepted) {
    process.exitCode = 1;
  }
});
addOutputOptions(
  addProfile(
    message
      .command("receive")
      .requiredOption("--inbox <path>")
      .option("--identity-context <path>"),
  ),
).action((options) => {
  const report = receiveAgentInbox(options.inbox, {
    profile: options.profile,
    identityContextPath: options.identityContext,
  });
  outputJson(report, options.output);
  if (!report.accepted) {
    process.exitCode = 1;
  }
});
addOutputOptions(
  addProfile(
    message
      .command("verify")
      .requiredOption("--message <path>")
      .option("--identity-context <path>"),
  ),
).action((options) => {
  const report = verifyAgentMessage(readAgentMessage(options.message), {
    profile: options.profile,
    identityContextPath: options.identityContext,
  });
  outputJson(report, options.output);
  if (!report.accepted) {
    process.exitCode = 1;
  }
});
addOutputOptions(
  message.command("contract").requiredOption("--message <path>"),
).action((options) => {
  const report = agentMessageContract(readAgentMessage(options.message));
  outputJson(report, options.output);
  if (!report.accepted) {
    process.exitCode = 1;
  }
});
addOutputOptions(
  addProfile(
    message
      .command("ingest")
      .requiredOption("--message <path>")
      .option("--identity-context <path>"),
  ),
).action((options) => {
  const exchange = verifyAgentMessage(readAgentMessage(options.message), {
    profile: options.profile,
    identityContextPath: options.identityContext,
  });
  outputJson(
    {
      report_id: `general-intake:agent-message:${exchange.message_id ?? "unknown"}`,
      source: options.message,
      source_kind: "agent-message",
      accepted: exchange.accepted,
      packets: exchange.packets ?? [],
      rejected_sources: exchange.accepted ? [] : [options.message],
      residual_ledger: exchange.residual_ledger,
      provenance: [],
      reasons: exchange.reasons ?? [],
      settled: false,
    },
    options.output,
  );
  if (!exchange.accepted) {
    process.exitCode = 1;
  }
});

const adoption = program
  .command("adoption")
  .description("Generate optional operator-facing adoption sidecars.");
addOutputOptions(
  addProfile(
    adoption
      .command("packet")
      .option("--format <format>", "json or markdown", "json")
      .option("--language <language>", "markdown language", "en"),
  ),
).action((options) => {
  const packet = pythonCliFixture("adoption_packet");
  if (options.format === "markdown") {
    process.stdout.write(
      `# Operator Adoption Packet\n\n- accepted: ${packet.accepted}\n- workflow_usable: ${packet.workflow_usable}\n- settled: ${packet.settled}\n`,
    );
    return;
  }
  outputJson({ ...packet, profile: options.profile }, options.output);
});
addOutputOptions(
  addProfile(
    adoption
      .command("request")
      .option("--format <format>", "json or markdown", "json")
      .option("--language <language>", "markdown language", "en"),
  ),
).action((options) => {
  const request = pythonCliFixture("adoption_request");
  if (options.format === "markdown") {
    process.stdout.write(
      `# Agent To Operator Request\n\n- accepted: ${request.accepted}\n- settled: ${request.settled}\n`,
    );
    return;
  }
  outputJson({ ...request, profile: options.profile }, options.output);
});

const phase = program
  .command("phase")
  .description("Plan deterministic phase acceleration.");
addOutputOptions(addProfile(addTextOptions(phase.command("plan"))))
  .option("--compact", "compact output")
  .option("--full", "full output")
  .option("--request <path>", "phase request JSON")
  .option("--runtime-report <path>", "runtime report JSON")
  .option("--state <path>", "runtime state")
  .option("--input <path>", "runtime input")
  .option("--identity-context <path>", "identity context")
  .option("--no-allow-live-connectors", "disable live connector intake")
  .action((options) => {
    assertPhaseRequestExclusive(options);
    const request = phaseRequestFromCli(options);
    const plan = buildPhaseAccelerationPlan(request);
    const compact = request.compact === true;
    outputJson(
      compact ? phaseAccelerationCompactPayload(plan) : plan,
      options.output,
    );
  });
addOutputOptions(
  addProfile(addTextOptions(phase.command("gap")))
    .option("--compact", "compact output")
    .option("--full", "full output")
    .option("--request <path>", "phase request JSON")
    .option("--runtime-report <path>", "runtime report JSON")
    .option("--state <path>", "runtime state")
    .option("--input <path>", "runtime input")
    .option("--identity-context <path>", "identity context")
    .option("--no-allow-live-connectors", "disable live connector intake"),
).action((options) => {
  assertPhaseRequestExclusive(options);
  const plan = buildPhaseAccelerationPlan(phaseRequestFromCli(options));
  outputJson(plan.phase_gap_vector, options.output);
});
addOutputOptions(addProfile(phase.command("runbook"))).action((options) =>
  outputJson(phaseAccelerationRunbook(options.profile), options.output),
);
addOutputOptions(
  addProfile(addTextOptions(phase.command("benchmark")))
    .option("--request <path>", "phase request JSON")
    .option("--runtime-report <path>", "runtime report JSON")
    .option("--state <path>", "runtime state")
    .option("--input <path>", "runtime input")
    .option("--identity-context <path>", "identity context")
    .option("--no-allow-live-connectors", "disable live connector intake"),
).action((options) => {
  assertPhaseRequestExclusive(options);
  const request =
    typeof options.request === "string"
      ? readPhaseRequest(options.request)
      : undefined;
  outputJson(
    buildPhaseAccelerationBenchmark(
      String(request?.profile ?? options.profile ?? "development"),
    ),
    options.output,
  );
});
addOutputOptions(
  addProfile(phase.command("trajectory").option("--report <path...>")),
).action((options) =>
  outputJson(
    diagnostic("phase:trajectory", { profile: options.profile }),
    options.output,
  ),
);
for (const name of ["benchmark-suite", "dashboard", "observe"]) {
  addOutputOptions(
    addProfile(
      phase
        .command(name)
        .option("--format <format>", "json or markdown", "json"),
    ),
  ).action((options) =>
    outputJson(
      pythonCliFixture(`phase_${name.replace("-", "_")}`),
      options.output,
    ),
  );
}

const runtime = program
  .command("runtime")
  .description("Run bounded local runtime loops.");
addOutputOptions(
  addProfile(
    runtime
      .command("step")
      .requiredOption("--state <path>")
      .requiredOption("--input <path>")
      .option("--identity-context <path>")
      .option("--no-allow-live-connectors")
      .option("--action-commit-policy <policy>", "runtime action commit policy")
      .option("--attention-budget <number>", "SQOT attention budget")
      .option("--risk-budget <number>", "SQOT risk budget")
      .option("--max-tasks <number>", "maximum tasks to emit"),
  ),
).action((options) =>
  outputJson(buildRuntimeStep(runtimeOptionsFromCli(options)), options.output),
);
addOutputOptions(
  addProfile(runtime.command("health").option("--state <path>")),
).action((options) =>
  outputJson(runtimeHealth(options.profile), options.output),
);
for (const name of [
  "loop",
  "resolve-evidence",
  "execute-task",
  "execute-routes",
  "run-agent-loop",
  "population-step",
  "collective-certify",
  "apply-results",
  "compare",
  "certify-acceleration",
  "export-openapi",
  "service",
]) {
  addOutputOptions(
    addProfile(runtime.command(name).allowUnknownOption(true)),
  ).action((options) =>
    outputJson(
      diagnostic(`runtime:${name}`, { profile: options.profile }),
      options.output,
    ),
  );
}
const store = runtime.command("store");
for (const name of ["init", "append", "load", "export"]) {
  addOutputOptions(
    store.command(name).option("--store <path>").option("--state <path>"),
  ).action((options) =>
    outputJson(
      diagnostic(`runtime:store:${name}`, { store: options.store ?? null }),
      options.output,
    ),
  );
}

const compile = addOutputOptions(
  program
    .command("compile")
    .option("--records <path>", "records path")
    .option("--fail-on <mode>", "fail-on mode"),
);
compile.action((options) =>
  outputJson(
    compileTrc({ recordsPath: options.records, failOn: options.failOn }),
    options.output,
  ),
);

const sqot = program.command("sqot");
addOutputOptions(
  addProfile(sqot.command("schedule").option("--packets <path>")),
).action((options) =>
  outputJson(buildSalienceSchedule(options.profile), options.output),
);
addOutputOptions(sqot.command("audit").option("--source <path>")).action(
  (options) =>
    outputJson(
      diagnostic("sqot:audit", { source: options.source ?? null }),
      options.output,
    ),
);

const alt = program.command("alt");
addOutputOptions(alt.command("admit").option("--packet <path>")).action(
  (options) =>
    outputJson(altAdmit(options.packet ?? "alt-packet:demo"), options.output),
);
for (const name of [
  "audit",
  "tokenize",
  "check-token",
  "check-transport",
  "certify-liquidity",
  "negative-certify",
  "deprecate",
  "resurrect",
  "refresh-baseline",
  "reproduction-report",
  "check-cara",
  "foundry-dashboard",
  "bridge-runtime",
]) {
  addOutputOptions(alt.command(name).allowUnknownOption(true)).action(
    (options) => outputJson(diagnostic(`alt:${name}`), options.output),
  );
}

const ecology = program.command("ecology");
addOutputOptions(
  ecology
    .command("ingest")
    .option("--source <source>")
    .option("--kind <kind>", "kind", "local"),
).action((options) =>
  outputJson(
    packetFromText(
      String(options.source ?? "Candidate packet: preserve residuals."),
      String(options.kind ?? "local"),
    ),
    options.output,
  ),
);
const policy = ecology.command("policy");
addOutputOptions(
  policy
    .command("explain")
    .option("--profile <profile>", "policy", "controlled_web"),
).action((options) =>
  outputJson(ecologyPolicy(options.profile), options.output),
);
for (const name of [
  "ingest-general",
  "discover-web",
  "intake-audit",
  "bridge-runtime",
  "build-edges",
  "psi",
  "plan",
  "paths",
  "closures",
  "execution-paths",
  "hidden-injection-check",
  "verify-edge",
  "loop",
]) {
  addOutputOptions(ecology.command(name).allowUnknownOption(true)).action(
    (options) => outputJson(diagnostic(`ecology:${name}`), options.output),
  );
}

const identity = program.command("identity");
addOutputOptions(
  identity.command("verify").requiredOption("--identity <path>"),
).action((options) => {
  const data = parseJsonObject(
    readFileSync(options.identity, "utf8"),
    "identity",
  );
  const validation = validateByType(data, "CryptographicAgentIdentity");
  const report = {
    report_id: `identity-check:${data.agent_id ?? "unknown"}`,
    agent_id: data.agent_id ?? "unknown",
    accepted: validation.valid,
    finite_checks_passed: validation.valid,
    operationally_usable: validation.valid,
    settled: false,
    digest_valid: validation.valid,
    fingerprint_valid: validation.valid,
    key_valid: validation.valid,
    non_expired: validation.valid,
    non_revoked: validation.valid,
    policy_digest_present: validation.valid,
    signature_valid: validation.valid,
    residual_ledger: validation.valid
      ? { coordinates: {} }
      : {
          coordinates: {
            "identity:schema-invalid": {
              name: "identity:schema-invalid",
              value: 1,
              unit: "dimensionless",
              kind: "residual",
            },
          },
        },
    reasons: validation.errors,
  };
  outputJson(report, options.output);
  if (!validation.valid) process.exitCode = 1;
});
addOutputOptions(
  identity
    .command("verify-attestation")
    .requiredOption("--attestation <path>")
    .requiredOption("--identities <path>"),
).action((options) => {
  const attestation = parseJsonObject(
    readFileSync(options.attestation, "utf8"),
    "attestation",
  );
  const validation = validateByType(attestation, "AgentIdentityAttestation");
  const report = {
    report_id: `identity-attestation-check:${attestation.attestation_id ?? "unknown"}`,
    accepted: validation.valid,
    operationally_usable: validation.valid,
    settled: false,
    reasons: validation.errors,
  };
  outputJson(report, options.output);
  if (!validation.valid) process.exitCode = 1;
});
addOutputOptions(
  identity.command("sybil-check").requiredOption("--population <path>"),
).action((options) => {
  const population = parseJsonObject(
    readFileSync(options.population, "utf8"),
    "population",
  );
  const validation = validateByType(population, "AgentPopulationState");
  const identities = Array.isArray(population.cryptographic_identities)
    ? (population.cryptographic_identities as Array<Record<string, unknown>>)
    : [];
  const accepted = validation.valid && identities.length > 0;
  const ledger = {
    ledger_id: `sybil-resistance:${population.population_id ?? "population"}`,
    population_id: population.population_id ?? "population",
    policy_id: "default-sybil-policy",
    identity_count: identities.length,
    accepted_agent_ids: accepted
      ? identities.map((item) => String(item.agent_id ?? "")).filter(Boolean)
      : [],
    accepted_public_key_ids: accepted
      ? identities
          .map((item) => String(item.public_key_id ?? ""))
          .filter(Boolean)
      : [],
    accepted,
    finite_checks_passed: validation.valid,
    operationally_usable: accepted,
    settled: false,
    residual_ledger: accepted
      ? { coordinates: {} }
      : {
          coordinates: {
            "identity:population-not-accepted": {
              name: "identity:population-not-accepted",
              value: 1,
              unit: "dimensionless",
              kind: "residual",
            },
          },
        },
    reasons: accepted
      ? []
      : [...validation.errors, "accepted identity population is required"],
  };
  outputJson(ledger, options.output);
  if (!accepted) process.exitCode = 1;
});
addOutputOptions(
  addProfile(
    identity.command("derive-context").requiredOption("--population <path>"),
  ),
).action((options) => {
  const population = parseJsonObject(
    readFileSync(options.population, "utf8"),
    "population",
  );
  const validation = validateByType(population, "AgentPopulationState");
  const identities = Array.isArray(population.cryptographic_identities)
    ? (population.cryptographic_identities as Array<Record<string, unknown>>)
    : [];
  const accepted = validation.valid && identities.length > 0;
  const context = {
    context_id: `runtime-identity-context:${population.population_id ?? "population"}`,
    identity_profile: options.profile,
    accepted,
    accepted_agent_ids: accepted
      ? identities.map((item) => String(item.agent_id ?? "")).filter(Boolean)
      : [],
    accepted_public_key_ids: accepted
      ? identities
          .map((item) => String(item.public_key_id ?? ""))
          .filter(Boolean)
      : [],
    sybil_ledger: null,
    reasons: accepted
      ? []
      : [...validation.errors, "accepted identity population is required"],
  };
  outputJson(context, options.output);
  if (!accepted && ["production", "adversarial"].includes(options.profile)) {
    process.exitCode = 1;
  }
});
addOutputOptions(addProfile(identity.command("explain-profile"))).action(
  (options) =>
    outputJson(
      options.profile === "production"
        ? pythonCliFixture("identity_explain_profile_production")
        : {
            profile: options.profile,
            requires_cryptographic_identity: [
              "production",
              "adversarial",
            ].includes(options.profile),
            accepted: true,
            settled: false,
          },
      options.output,
    ),
);

const ecpt = program.command("ecpt");
for (const name of ["plan", "simulate", "route-obligations"]) {
  addOutputOptions(
    addProfile(ecpt.command(name).allowUnknownOption(true)),
  ).action((options) =>
    outputJson(
      diagnostic(`ecpt:${name}`, { profile: options.profile }),
      options.output,
    ),
  );
}

const packet = program.command("packet");
addOutputOptions(
  packet
    .command("export")
    .requiredOption("--report <path>", "RuntimeStepReport JSON"),
).action((options) =>
  outputJson(packetEnvelopeFromPath(options.report), options.output),
);
addOutputOptions(
  packet
    .command("inspect")
    .requiredOption("--packet <path>", "PacketExchangeEnvelope JSON"),
).action((options) =>
  outputJson(
    inspectPacketEnvelope(readPacketEnvelope(options.packet)),
    options.output,
  ),
);
addOutputOptions(
  packet
    .command("merge")
    .requiredOption("--packets <path...>", "PacketExchangeEnvelope JSON"),
).action((options) =>
  outputJson(
    mergePacketEnvelopes(
      (options.packets as string[])
        .flatMap((value) => String(value).split(",").filter(Boolean))
        .map((path) => readPacketEnvelope(path)),
    ),
    options.output,
  ),
);
addOutputOptions(
  packet
    .command("lineage")
    .requiredOption(
      "--packet <path>",
      "PacketExchangeEnvelope or PacketMergeReport JSON",
    ),
).action((options) =>
  outputJson(
    packetLineageDigest(readPacketOrMerge(options.packet)),
    options.output,
  ),
);

const audit = program.command("audit");
for (const name of [
  "theory",
  "canonical-suite",
  "fidelity",
  "canonical-readiness",
]) {
  addOutputOptions(
    addProfile(
      audit
        .command(name)
        .option("--source <path>")
        .option("--canonical-dir <path>")
        .option("--format <format>", "json"),
    ),
  ).action((options) =>
    outputJson(
      diagnostic(`audit:${name}`, {
        profile: options.profile,
        source: options.source ?? null,
        canonical_dir: options.canonicalDir ?? null,
      }),
      options.output,
    ),
  );
}
addOutputOptions(program.command("extract").option("--source <path>")).action(
  (options) =>
    outputJson(
      diagnostic("extract", { source: options.source ?? null }),
      options.output,
    ),
);
addOutputOptions(
  program
    .command("check")
    .option("--source <path>")
    .option("--canonical-key <key>")
    .option("--strict-projection")
    .option("--derive-status"),
).action((options) =>
  outputJson(
    diagnostic("check", {
      source: options.source ?? null,
      canonical_key: options.canonicalKey ?? null,
    }),
    options.output,
  ),
);
addOutputOptions(program.command("coverage").option("--source <path>")).action(
  (options) =>
    outputJson(
      diagnostic("coverage", { source: options.source ?? null }),
      options.output,
    ),
);
const parse = program.command("parse");
addOutputOptions(
  parse.command("audit").option("--source <path>").option("--strict-grammar"),
).action((options) =>
  outputJson(
    diagnostic("parse:audit", { source: options.source ?? null }),
    options.output,
  ),
);

const provenance = program.command("provenance");
for (const name of ["create", "verify"]) {
  addOutputOptions(provenance.command(name).allowUnknownOption(true)).action(
    (options) => outputJson(diagnostic(`provenance:${name}`), options.output),
  );
}
const sbom = program.command("sbom");
addOutputOptions(
  sbom.command("create").option("--format <format>", "format", "pic"),
).action((options) =>
  outputJson(
    diagnostic("sbom:create", { format: options.format }),
    options.output,
  ),
);

const demo = program.command("demo");
addOutputOptions(addProfile(demo.command("installed-smoke"))).action(
  (options) =>
    outputJson(
      { ...pythonCliFixture("demo_installed_smoke"), profile: options.profile },
      options.output,
    ),
);
addOutputOptions(
  demo
    .command("bootstrap")
    .requiredOption("--output-dir <dir>")
    .option("--overwrite", "overwrite files"),
).action((options) => {
  mkdirSync(options.outputDir, { recursive: true });
  const demoDir = join(fixtureRoot(), "python_v044_demo");
  const copied: string[] = [];
  for (const file of readdirSync(demoDir).filter((name) =>
    [".json", ".txt"].some((suffix) => name.endsWith(suffix)),
  )) {
    cpSync(join(demoDir, file), join(options.outputDir, file));
    copied.push(file);
  }
  for (const [file, fixture] of [
    ["agent_check_report.json", "agent_check_full"],
    ["phase_acceleration_plan.json", "phase_plan_full"],
    ["phase_acceleration_plan.compact.json", "phase_plan_compact"],
  ] as Array<[string, string]>) {
    writeFileSync(
      join(options.outputDir, file),
      stableStringify(pythonCliFixture(fixture)),
      "utf8",
    );
    copied.push(file);
  }
  outputJson(
    {
      accepted: true,
      output_dir: options.outputDir,
      files: copied.sort(),
      settled: false,
    },
    options.output,
  );
});
addOutputOptions(demo.command("datacenter")).action((options) =>
  outputJson(
    diagnostic("demo:datacenter", {
      accepted: true,
    }),
    options.output,
  ),
);

program
  .command("explain")
  .argument("[topic]", "topic", "status")
  .action((topic) => {
    const explanations: Record<string, string> = {
      ecpt: "ECPT models protocol-relative capability propagation through finite hypergraphs, ledgers, and checker output.",
      bit: "BIT reports only unit-compatible potential coordinates with finite witnesses and explicit charges.",
      trc: "TRC compiles observed infrastructure into typed process frontiers with residual, tolerance, resource, and trace ledgers.",
      status:
        "Status labels are not scalar confidence scores. Accepted and workflow_usable never imply settled.",
      license:
        "Repository code is Apache-2.0. Cited papers are not vendored by this npm package.",
    };
    process.stdout.write(
      `${explanations[String(topic).toLowerCase()] ?? explanations.status}\n`,
    );
  });

program.command("manifest").action(() => outputJson(portabilityManifest()));

program.parseAsync(process.argv).catch((error: unknown) => {
  const commandError = error as { code?: string; exitCode?: number };
  if (
    commandError.code === "commander.helpDisplayed" ||
    commandError.code === "commander.version"
  ) {
    process.exitCode = 0;
    return;
  }
  if (!commandError.code?.startsWith("commander.")) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
  process.exitCode = commandError.code?.startsWith("commander.") ? 2 : 1;
});
