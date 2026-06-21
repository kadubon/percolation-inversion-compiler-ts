import { fixtureJson } from "../io/fixtures.js";

export function altAdmit(
  packetId = "alt-packet:demo",
): Record<string, unknown> {
  const decision = structuredClone(fixtureJson("alt_admission_decision.json"));
  decision.packet_id = packetId;
  decision.accepted = Boolean(decision.accepted ?? false);
  decision.settled = false;
  decision.reasons = [
    ...((Array.isArray(decision.reasons)
      ? decision.reasons.map(String)
      : []) as string[]),
    "ALT admission remains candidate-only until value, transport, hazard, and baseline obligations are discharged",
  ].sort();
  return decision;
}
