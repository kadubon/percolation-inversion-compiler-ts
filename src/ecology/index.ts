import { createHash } from "node:crypto";

export function packetFromText(
  text: string,
  outputId = "agent-output",
): Record<string, unknown> {
  const sha256 = createHash("sha256").update(text, "utf8").digest("hex");
  return {
    packet_id: `candidate:${outputId}`,
    source_kind: "agent-output",
    content_sha256: sha256,
    candidate_only: true,
    accepted: true,
    workflow_usable: true,
    settled: false,
    reasons: ["candidate packet requires verifier routes before promotion"],
  };
}

export function ecologyPolicy(
  profile = "controlled_web",
): Record<string, unknown> {
  return {
    profile,
    explicit_source_required: true,
    candidate_only_by_default: true,
    background_crawling_allowed: false,
    arbitrary_execution_allowed: false,
    accepted: true,
    operationally_usable: profile !== "production_network",
    settled: false,
  };
}
