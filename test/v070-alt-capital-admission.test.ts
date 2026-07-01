import { describe, expect, it } from "vitest";
import { altEcptBridgeReport } from "../src/interop/ccr.js";

describe("v0.7 ALT capital admission compatibility", () => {
  it("does not admit proxy-only or negative-liquidity packets as capital", () => {
    const proxyOnly = altEcptBridgeReport({
      baseline_ref: "baseline:demo",
      hazard_envelope: ["hazard:demo"],
      liquidity_certificate: {
        cost_ledger: { formation_cost: 1 },
        signed_surplus_lower_bound: 3,
        value_evidence_level: "proxy-only",
      },
      packet_id: "packet:proxy",
      receiver_family: ["receiver:demo"],
      transport_scope: ["receiver:demo"],
    });
    const negative = altEcptBridgeReport({
      baseline_ref: "baseline:demo",
      hazard_envelope: ["hazard:demo"],
      liquidity_certificate: {
        cost_ledger: { formation_cost: 1 },
        signed_surplus_lower_bound: 3,
      },
      negative_liquidity_certificate: { reason: "duplicate mass" },
      packet_id: "packet:negative",
      receiver_family: ["receiver:demo"],
      transport_scope: ["receiver:demo"],
    });

    expect(proxyOnly.capital_admitted).toBe(false);
    expect(proxyOnly.candidate_only_reasons).toContain(
      "proxy-only value evidence cannot increase safe capital",
    );
    expect(negative.capital_admitted).toBe(false);
    expect(negative.settled_blockers).toContain(
      "negative liquidity signal preserved",
    );
  });
});
