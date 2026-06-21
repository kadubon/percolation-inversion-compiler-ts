import { readFileSync } from "node:fs";
import { parseJsonObject } from "../core/json.js";
import { residualLedger } from "../core/ledger.js";
import { pythonCliFixture } from "../io/fixtures.js";
import { runtimeIdentityContextAccepted } from "../io/identity.js";
import { validateByType } from "../io/schema.js";

export interface RuntimeStepOptions {
  profile?: string;
  agentOutput?: string;
  allowLiveConnectors?: boolean;
  statePath?: string;
  inputPath?: string;
  identityContextPath?: string;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function minimalRuntimeState(): Record<string, unknown> {
  return {
    state_id: "runtime-state:minimal",
    profile: "development",
    candidate_registry: { packets: [], edges: [] },
    residual_ledger: residualLedger(
      "runtime:minimal-state",
      1,
      "minimal state carries unresolved verifier debt",
    ),
    accepted_agent_ids: [],
    accepted_public_key_ids: [],
    identity_mode: "development",
  };
}

export function minimalRuntimeStepInput(
  agentOutput = "Candidate packet: preserve residuals.",
): Record<string, unknown> {
  return {
    input_id: "runtime-step-input:minimal",
    agent_output: agentOutput,
    allow_live_connectors: true,
    candidate_only: true,
  };
}

export function buildRuntimeStep(
  options: RuntimeStepOptions = {},
): Record<string, unknown> {
  const report = clone(pythonCliFixture("runtime_step_demo"));
  const profile = options.profile ?? "development";
  const reasons = new Set(
    (Array.isArray(report.reasons)
      ? report.reasons.map(String)
      : []) as string[],
  );

  if (options.agentOutput) {
    report.agent_output_digest = `sha256:${Buffer.from(options.agentOutput, "utf8").toString("hex").slice(0, 16)}`;
  }
  if (options.statePath) {
    const state = parseJsonObject(
      readFileSync(options.statePath, "utf8"),
      "runtime state",
    );
    const validation = validateByType(state, "RuntimeState");
    if (!validation.valid) {
      throw new Error(
        `runtime state schema-invalid: ${validation.errors.join("; ")}`,
      );
    }
  }
  if (options.inputPath) {
    const input = parseJsonObject(
      readFileSync(options.inputPath, "utf8"),
      "runtime input",
    );
    const validation = validateByType(input, "RuntimeStepInput");
    if (!validation.valid) {
      throw new Error(
        `runtime input schema-invalid: ${validation.errors.join("; ")}`,
      );
    }
    if (typeof input.allow_live_connectors === "boolean") {
      report.allow_live_connectors = input.allow_live_connectors;
    }
  }
  if (typeof options.allowLiveConnectors === "boolean") {
    report.allow_live_connectors = options.allowLiveConnectors;
  }
  if (options.identityContextPath) {
    const identity = parseJsonObject(
      readFileSync(options.identityContextPath, "utf8"),
      "identity context",
    );
    const validation = validateByType(identity, "RuntimeIdentityContext");
    const accepted = runtimeIdentityContextAccepted(identity);
    report.identity_context_accepted = accepted;
    report.identity_verified = accepted;
    if (!accepted) {
      reasons.add("identity context is missing or not accepted");
      report.operationally_usable = false;
    }
  }
  if (profile === "production" || profile === "adversarial") {
    if (!options.identityContextPath) {
      reasons.add(
        "production/adversarial identity context is missing or not accepted",
      );
      report.operationally_usable = false;
      report.identity_verified = false;
    }
  }

  report.accepted = true;
  report.finite_checks_passed = true;
  report.settled = false;
  report.reasons = [...reasons].sort();
  return report;
}

export function runtimeHealth(
  profile = "development",
): Record<string, unknown> {
  return {
    report_id: "runtime-health",
    profile,
    accepted: true,
    operationally_usable: profile === "development",
    settled: false,
    checks: {
      command_execution_allowed: false,
      background_crawling_allowed: false,
      hidden_promotion_allowed: false,
      residual_ledgers_preserved: true,
    },
    reasons:
      profile === "development"
        ? []
        : [
            "production profile requires explicit identity and provenance context",
          ],
  };
}
