import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { traceNormalFormReport } from "../src/interop/ccr.js";
import { packageRoot } from "../src/io/paths.js";

function cli(args: string[]): Record<string, unknown> {
  const stdout = execFileSync(
    process.execPath,
    [join(packageRoot(), "dist", "cli", "main.js"), ...args],
    { cwd: packageRoot(), encoding: "utf8" },
  );
  return JSON.parse(stdout) as Record<string, unknown>;
}

function writeJson(dir: string, name: string, payload: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(payload), "utf8");
  return path;
}

function expectCompact(
  payload: Record<string, unknown>,
  sourceSchema: string,
): void {
  expect(payload.schema_version).toBe("pic-ts.compact_report.v1");
  expect(payload.source_schema_version).toBe(sourceSchema);
  expect(payload).toHaveProperty("ok");
  expect(payload).toHaveProperty("settled");
  expect(payload).toHaveProperty("blockers");
  expect(payload).toHaveProperty("residual_count");
  expect(payload).toHaveProperty("next_safe_action");
  expect(payload).toHaveProperty("non_claims");
}

describe("v0.9 compact CLI outputs", () => {
  it("emits compact interop command summaries", () => {
    const dir = mkdtempSync(join(tmpdir(), "pic-ts-compact-"));
    const descriptor = writeJson(dir, "descriptor.json", {
      auth_scope: ["read"],
      descriptor_version: "1",
      egress_policy: "none",
      server_id: "srv",
      server_trust_status: "trusted",
      side_effect_class: "read_only",
      tool_name: "read",
    });
    const call = writeJson(dir, "call.json", {
      arguments: { path: "README.md" },
      canonical_tool_name: "read",
      output_redaction_policy: "none",
      trace_logging_enabled: true,
    });
    const handoff = writeJson(dir, "handoff.json", {
      agent_card_ref: "agent:srv",
      declared_authority: { scope: "read" },
      handoff_scope: "read-only",
      idempotency_key: "idem-1",
      replay_nonce: "nonce-1",
      task_schema: { type: "object" },
    });
    const trace = writeJson(
      dir,
      "trace.json",
      traceNormalFormReport({
        fixture_mode: true,
        side_effect_policy: "dry_run_only",
        trace_id: "trace:compact",
        steps: [{ step_id: "s1", tool: "read" }],
      }),
    );

    expectCompact(
      cli([
        "mcp",
        "invocation-preflight",
        "--descriptor",
        descriptor,
        "--call",
        call,
        "--compact",
      ]),
      "pic.mcp_tool_invocation_preflight.v1",
    );
    expectCompact(
      cli(["a2a", "handoff-check", "--handoff", handoff, "--compact"]),
      "pic.a2a_task_handoff_report.v1",
    );
    expectCompact(
      cli(["trc", "operation-gate", "--trace", trace, "--compact"]),
      "pic.trc_operation_gate_report.v1",
    );
  });
});
