import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cacheInvalidationReport,
  duplicateInflationReport,
  ecptQuotientReport,
  evidenceProductReport,
  fcuCheckReport,
  leakageAuditReport,
  missionValidityReport,
  performanceReport,
  resourceTensorReport,
  tokenAdmissibilityReport,
  tokenDedupReport,
  tokenExtractionPipelineReport,
  transportCertificateReport,
  trcObservationConsistencyReport,
  trcResourceFlowReport,
  unseenFrontierReport,
} from "../src/interop/ccr.js";
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

function writeJsonl(dir: string, name: string, rows: unknown[]): string {
  const path = join(dir, name);
  writeFileSync(
    path,
    rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
    "utf8",
  );
  return path;
}

describe("v0.9 public report surfaces", () => {
  it("keeps token extraction candidate-only and token admissibility separate from capital", () => {
    const extracted = tokenExtractionPipelineReport({
      trace_id: "trace:v090",
      steps: [{ tool: "read" }],
    });
    const admissibility = tokenAdmissibilityReport({ token_id: "token:v090" });
    const leakage = leakageAuditReport({
      answer_key: "heldout benchmark solution",
      token_id: "token:leaky",
    });

    expect(extracted.settled).toBe(false);
    expect(
      (extracted.candidate_token as Record<string, unknown>).candidate_only,
    ).toBe(true);
    expect(admissibility.capital_admitted).toBe(false);
    expect(admissibility.blockers).toContain(
      "mechanism_mediated_reuse_required",
    );
    expect(leakage.blockers).toContain("benchmark_answer_leakage");
  });

  it("fails closed for mission, transport, FCU, and evidence gaps", () => {
    const mission = missionValidityReport({
      generated_law_gain: true,
      mission_law: {},
      packet_id: "packet:v090",
      target_scope: "target",
    });
    const transport = transportCertificateReport(
      { scope: "source" },
      { scope: "target" },
      { certificate_id: "transport:v090", support_miss: true },
    );
    const fcu = fcuCheckReport({ cost_id: "cost:v090" });
    const evidence = evidenceProductReport([
      { evidence_id: "e:v090", e_value: 2 },
    ]);

    expect(mission.accepted).toBe(false);
    expect(mission.blockers).toContain("generated_law_bridge_required");
    expect(transport.blockers).toContain("support_miss");
    expect(fcu.blockers).toContain("missing_upper_bounds");
    expect(evidence.blockers).toContain("conditional_witness_required");
  });

  it("preserves duplicate, SQOT, TRC, BIT, cache, and performance non-claims", () => {
    const packets = [
      { packet_id: "packet:1", claim: "same claim" },
      { packet_id: "packet:2", claim: "same claim" },
    ];
    const dedup = tokenDedupReport(packets);
    const quotient = ecptQuotientReport(packets);
    const duplicate = duplicateInflationReport(packets);
    const sqot = resourceTensorReport({
      state_id: "sqot:v090",
      unknown_budget_is_zero: true,
    });
    const observation = trcObservationConsistencyReport({
      observer: "verifier",
      postcondition_observed: false,
      resource_use_observed: false,
      window_id: "window:v090",
    });
    const flow = trcResourceFlowReport({
      resource_flows: [{ rollback_compensation_free: true }],
      trace_id: "trace:v090",
    });
    const frontier = unseenFrontierReport([
      { duplicate_mass: 1, false_entry_bound: 0.5, unseen_mass: 2 },
    ]);
    const cache = cacheInvalidationReport({ coordinates: ["coord:a"] });
    const perf = performanceReport({ cache_entries: 2 });

    expect(
      (dedup.duplicate_mass_report as Record<string, unknown>)
        .duplicate_mass_count,
    ).toBe(1);
    expect(quotient.blockers).toContain("held_out_or_uniform_ledger_required");
    expect(duplicate.inflated_support_allowed).toBe(false);
    expect(sqot.blockers).toContain("unknown_budget_cannot_be_zero");
    expect(observation.blockers).toContain("postcondition_not_observed");
    expect(flow.blockers).toContain("rollback_compensation_not_free");
    expect(frontier.unseen_frontier_mass).toBe(2);
    expect(cache.dirty_set).toEqual(["coord:a"]);
    expect(perf.schema_version).toBe("pic.performance_report.v1");
  });

  it("exposes CLI routes and generated assets", () => {
    const dir = mkdtempSync(join(tmpdir(), "pic-ts-v090-public-"));
    const trace = writeJson(dir, "trace.json", {
      provenance: { source: "fixture" },
      steps: [{ step: "inspect" }],
      task_context: "local",
      trace_id: "trace:v090",
    });
    const token = writeJson(dir, "token.json", { token_id: "token:v090" });
    const tokens = writeJsonl(dir, "tokens.jsonl", [
      { claim: "same claim", token_id: "token:1" },
      { claim: "same claim", token_id: "token:2" },
    ]);

    expect(
      cli(["token", "extract-pipeline", "--trace", trace, "--compact"])
        .schema_version,
    ).toBe("pic-ts.compact_report.v1");
    expect(
      cli(["token", "admissibility", "--token", token, "--compact"])
        .source_schema_version,
    ).toBe("pic.token_admissibility_report.v1");
    expect(
      (
        cli(["token", "dedup", "--tokens", tokens])
          .duplicate_mass_report as Record<string, unknown>
      ).duplicate_mass_count,
    ).toBe(1);
    expect(cli(["performance", "report", "--json"]).schema_version).toBe(
      "pic.performance_report.v1",
    );

    for (const relative of [
      "schemas/token-extraction-pipeline-report.schema.json",
      "schemas/observation-window-report.schema.json",
      "examples/asi_proxy_loop_bundle/target.json",
      "docs/cross-repo-loop-conformance.md",
    ]) {
      expect(existsSync(join(packageRoot(), relative))).toBe(true);
    }
  });
});
