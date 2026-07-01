# MCP And A2A Safety

PIC-TS v0.8 mirrors Python PIC structured MCP and A2A reports. Descriptors,
calls, cards, and handoffs are candidate evidence until checked. They do not
grant delegated tool authority or settlement.

Use:

```sh
pic-ts mcp descriptor-check --descriptor descriptor.json --profile development
pic-ts mcp invocation-preflight --descriptor descriptor.json --call call.json --profile development
pic-ts a2a card-check --card card.json --profile development
pic-ts a2a handoff-check --handoff handoff.json --profile development
```

MCP reports preserve descriptor hash, version, canonical tool name, side-effect
class, auth scope, egress policy, budgets, schema hashes, provenance/signature
requirements, rug-pull blockers, and argument-escalation blockers. A2A reports
preserve identity, endpoint provenance, task schema, declared authority, nonce,
idempotency key, and the non-claim that handoff evidence is not settlement.

Search terms: PIC-TS, MCP descriptor report, MCP invocation preflight, A2A agent
card, A2A handoff, tool safety.

## v0.9/v1.4 Agent Loop Addendum

Structured MCP descriptor and invocation-preflight reports, and A2A agent-card and handoff reports, are finite gate evidence only. MCP invocation preflight is not tool dispatch. A2A handoff does not imply delegated tool execution.

When structured and legacy booleans disagree, gates fail closed. Hash or ref mismatch stays a blocker and residual.
