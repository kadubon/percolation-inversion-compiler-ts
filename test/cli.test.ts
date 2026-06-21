import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { stableStringify } from "../src/core/json.js";
import { packageRoot } from "../src/io/paths.js";

function pic(args: string[]): Record<string, unknown> {
  const stdout = execFileSync(
    process.execPath,
    [join(packageRoot(), "dist", "cli", "main.js"), ...args],
    {
      cwd: packageRoot(),
      encoding: "utf8",
    },
  );
  return JSON.parse(stdout) as Record<string, unknown>;
}

function picFailure(args: string[]): { status: number; stderr: string } {
  try {
    execFileSync(
      process.execPath,
      [join(packageRoot(), "dist", "cli", "main.js"), ...args],
      {
        cwd: packageRoot(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    throw new Error(`expected command to fail: ${args.join(" ")}`);
  } catch (error) {
    const err = error as { status?: number; stderr?: Buffer | string };
    return {
      status: Number(err.status ?? 1),
      stderr: String(err.stderr ?? ""),
    };
  }
}

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      join(packageRoot(), "fixtures", "python_v044_cli", `${name}.json`),
      "utf8",
    ),
  ) as Record<string, unknown>;
}

describe("CLI golden parity", () => {
  it("matches Python v0.4.4 agent and phase compact payloads", () => {
    expect(pic(["agent", "intake", "--profile", "development"])).toEqual(
      fixture("agent_intake"),
    );
    expect(pic(["agent", "check", "--profile", "development"])).toEqual(
      fixture("agent_check_full"),
    );
    expect(
      pic(["agent", "check", "--compact", "--profile", "development"]),
    ).toEqual(fixture("agent_check_compact"));
    expect(
      pic(["phase", "plan", "--compact", "--profile", "development"]),
    ).toEqual(fixture("phase_plan_compact"));
  });

  it("passes phase request JSON through candidate-only, ALT, and identity semantics", () => {
    const dir = mkdtempSync(join(tmpdir(), "pic-ts-phase-request-"));
    const requestPath = join(dir, "request.json");
    const request = {
      request_id: "phase-request-test",
      profile: "production",
      compact: true,
      allow_live_connectors: false,
      general_intake_bridge_reports: [{ accepted: true, candidate_only: true }],
      alt_admission_decisions: [
        { accepted: true, missing_obligations: ["alt:hazard"] },
      ],
      runtime_report: {
        accepted: true,
        identity_context: { accepted: true },
        residual_ledger: { coordinates: {} },
        settled: false,
      },
    };
    writeFileSync(requestPath, stableStringify(request), "utf8");

    const plan = pic(["phase", "plan", "--request", requestPath, "--compact"]);
    const gap = pic(["phase", "gap", "--request", requestPath, "--compact"]);
    const baseGap = pic(["phase", "gap", "--compact"]);

    expect(plan.request_id).toBe("phase-request-test");
    expect(plan.profile).toBe("production");
    expect(plan.operationally_usable).toBe(false);
    expect(plan.settled).toBe(false);
    expect(plan.candidate_only_reasons).toEqual(
      expect.arrayContaining([
        "candidate-only external volume cannot reduce phase gaps",
        "ALT admission is candidate-only until missing obligations are discharged",
      ]),
    );
    expect(plan.cannot_promote_because).toEqual(
      expect.arrayContaining([
        "production/adversarial identity context is missing or not accepted",
      ]),
    );
    expect(gap).toEqual(baseGap);
    expect(
      picFailure(["phase", "gap", "--request", requestPath, "--text", "x"])
        .status,
    ).toBe(1);
    expect(pic(["phase", "benchmark", "--request", requestPath]).profile).toBe(
      "production",
    );
  });

  it("runs runtime step with required state/input and matches demo payload", () => {
    expect(
      pic([
        "runtime",
        "step",
        "--state",
        "fixtures/python_v044_demo/runtime_state.json",
        "--input",
        "fixtures/python_v044_demo/runtime_step_input.json",
      ]),
    ).toEqual(fixture("runtime_step_demo"));
  });

  it("matches schema, snapshot, phase gap, benchmark, and adoption shapes", () => {
    expect(pic(["schema", "--type", "PhaseAccelerationPlan"]).title).toBe(
      "PhaseAccelerationPlan",
    );
    expect(pic(["snapshot", "list"])).toEqual(fixture("snapshot_list"));
    expect(pic(["snapshot", "verify", "--artifact", "trc"])).toEqual(
      fixture("snapshot_verify_trc"),
    );
    expect(
      pic(["phase", "gap", "--compact", "--profile", "development"]),
    ).toEqual(fixture("phase_gap"));
    expect(pic(["phase", "benchmark", "--profile", "development"])).toEqual(
      fixture("phase_benchmark"),
    );
    expect(pic(["adoption", "packet", "--profile", "development"])).toEqual(
      fixture("adoption_packet"),
    );
  });

  it("matches fixture-backed secondary commands", () => {
    expect(pic(["agent", "runbook", "--profile", "development"])).toEqual(
      fixture("agent_runbook"),
    );
    expect(
      pic(["agent", "autonomy-audit", "--profile", "development"]),
    ).toEqual(fixture("agent_autonomy_audit"));
    expect(pic(["agent", "manifest"])).toEqual(fixture("agent_manifest"));
    expect(pic(["agent", "communication-guide"])).toEqual(
      fixture("agent_communication_guide"),
    );
    expect(pic(["phase", "runbook", "--profile", "development"])).toEqual(
      fixture("phase_runbook"),
    );
    expect(
      pic(["phase", "benchmark-suite", "--profile", "development"]),
    ).toEqual(fixture("phase_benchmark_suite"));
    expect(pic(["phase", "dashboard", "--profile", "development"])).toEqual(
      fixture("phase_dashboard"),
    );
    expect(pic(["phase", "observe", "--profile", "development"])).toEqual(
      fixture("phase_observe"),
    );
    expect(pic(["routes", "bindings"])).toEqual(fixture("routes_bindings"));
    expect(
      pic([
        "routes",
        "explain",
        "--route",
        "adapters.domain.replay_trc_physical_trace",
      ]),
    ).toEqual(fixture("routes_explain_replay_trc_physical_trace"));
    expect(pic(["adoption", "request", "--profile", "development"])).toEqual(
      fixture("adoption_request"),
    );
    expect(
      pic(["demo", "installed-smoke", "--profile", "development"]),
    ).toEqual(fixture("demo_installed_smoke"));
  });

  it("matches snapshot show and verify fixtures for all bundled artifacts", () => {
    for (const artifact of ["trc", "bit", "ecpt", "sqot", "alt"]) {
      expect(pic(["snapshot", "show", "--artifact", artifact])).toEqual(
        fixture(`snapshot_show_${artifact}`),
      );
      expect(pic(["snapshot", "verify", "--artifact", artifact])).toEqual(
        fixture(`snapshot_verify_${artifact}`),
      );
    }
    expect(pic(["snapshot", "routes"])).toEqual(fixture("snapshot_routes"));
  });

  it("verifies bundled portability manifest with Python status semantics", () => {
    const data = pic([
      "portability",
      "verify",
      "--manifest",
      "fixtures/portability_conformance/manifest.json",
    ]);
    expect(data.accepted).toBe(true);
    expect(
      Object.values(data.checked_examples as Record<string, string>),
    ).toContain("valid");
    expect(data.unexpected_failure_count).toBe(0);
    expect(
      Object.keys(data.schema_names as Record<string, string>),
    ).toHaveLength(19);
  });

  it("keeps known diagnostic fallback commands fail-closed", () => {
    const commands = [
      ["doctor", "--profile", "production"],
      ["evidence", "verify"],
      ["evidence", "discharge"],
      ["agent", "doctor"],
      ["agent", "network-readiness"],
      ["agent", "readiness"],
      ["phase", "trajectory"],
      ["runtime", "loop"],
      ["runtime", "resolve-evidence"],
      ["runtime", "execute-task"],
      ["runtime", "execute-routes"],
      ["runtime", "run-agent-loop"],
      ["runtime", "population-step"],
      ["runtime", "collective-certify"],
      ["runtime", "apply-results"],
      ["runtime", "compare"],
      ["runtime", "certify-acceleration"],
      ["runtime", "export-openapi"],
      ["runtime", "service"],
      ["runtime", "store", "init"],
      ["runtime", "store", "append"],
      ["runtime", "store", "load"],
      ["runtime", "store", "export"],
      ["sqot", "audit"],
      ["alt", "audit"],
      ["alt", "tokenize"],
      ["alt", "check-token"],
      ["alt", "check-transport"],
      ["alt", "certify-liquidity"],
      ["alt", "negative-certify"],
      ["alt", "deprecate"],
      ["alt", "resurrect"],
      ["alt", "refresh-baseline"],
      ["alt", "reproduction-report"],
      ["alt", "check-cara"],
      ["alt", "foundry-dashboard"],
      ["alt", "bridge-runtime"],
      ["ecology", "ingest-general"],
      ["ecology", "discover-web"],
      ["ecology", "intake-audit"],
      ["ecology", "bridge-runtime"],
      ["ecology", "build-edges"],
      ["ecology", "psi"],
      ["ecology", "plan"],
      ["ecology", "paths"],
      ["ecology", "closures"],
      ["ecology", "execution-paths"],
      ["ecology", "hidden-injection-check"],
      ["ecology", "verify-edge"],
      ["ecology", "loop"],
      ["ecpt", "plan"],
      ["ecpt", "simulate"],
      ["ecpt", "route-obligations"],
      ["audit", "theory"],
      ["audit", "canonical-suite"],
      ["audit", "fidelity"],
      ["audit", "canonical-readiness"],
      ["extract"],
      ["check"],
      ["coverage"],
      ["parse", "audit"],
      ["provenance", "create"],
      ["provenance", "verify"],
      ["sbom", "create"],
      ["demo", "datacenter"],
    ];
    for (const args of commands) {
      const data = pic(args);
      expect(data.settled, args.join(" ")).toBe(false);
      expect(data.operationally_usable, args.join(" ")).toBe(false);
      expect(data.execution_authority_granted, args.join(" ")).toBe(false);
      expect(data.missing_obligations, args.join(" ")).toEqual(
        expect.arrayContaining([`${data.command}:finite-verifier-route`]),
      );
      expect(data.residual_ledger, args.join(" ")).toBeTruthy();
    }
  }, 120_000);

  it("matches expected failure behavior for invalid CLI input", () => {
    expect(
      picFailure(["runtime", "step", "--profile", "development"]).status,
    ).toBe(2);
    expect(
      picFailure([
        "portability",
        "verify",
        "--manifest",
        "fixtures/portability_conformance/manifest.json",
        "--fail-on",
        "sometimes",
      ]).status,
    ).toBe(1);
    expect(
      picFailure(["routes", "explain", "--route", "missing.route"]).stderr,
    ).toContain("unknown adapter route");
  });

  it("supports local message, inbox, and packet sidecar workflows", () => {
    const dir = mkdtempSync(join(tmpdir(), "pic-ts-cli-"));
    const messagePath = join(dir, "message.json");
    const inboxPath = join(dir, "inbox.json");
    const packetPath = join(dir, "packet.json");
    const mergePath = join(dir, "merge.json");
    const message = pic([
      "agent",
      "message",
      "create",
      "--sender",
      "agent-a",
      "--text",
      "hello",
      "--nonce",
      "n1",
    ]);
    writeFileSync(messagePath, stableStringify(message), "utf8");
    expect(
      pic(["agent", "message", "verify", "--message", messagePath]).accepted,
    ).toBe(true);
    pic(["agent", "inbox", "init", "--inbox", inboxPath]);
    expect(
      pic([
        "agent",
        "inbox",
        "append",
        "--inbox",
        inboxPath,
        "--message",
        messagePath,
      ]).messages,
    ).toHaveLength(1);
    expect(
      pic(["agent", "inbox", "verify", "--inbox", inboxPath]).settled,
    ).toBe(false);
    const packet = pic([
      "packet",
      "export",
      "--report",
      "fixtures/python_v044_demo/runtime_step_report.json",
    ]);
    writeFileSync(packetPath, stableStringify(packet), "utf8");
    expect(
      pic(["packet", "inspect", "--packet", packetPath]).executed_command_count,
    ).toBe(0);
    const merge = pic(["packet", "merge", "--packets", packetPath]);
    writeFileSync(mergePath, stableStringify(merge), "utf8");
    expect(
      pic(["packet", "lineage", "--packet", mergePath]).candidate_only,
    ).toBe(true);
  });
});
