# PIC-TS/PIC/CCR Interoperability

PIC-TS mirrors the Python PIC public JSON and CLI semantics for JavaScript and
TypeScript agent runtimes. Python PIC remains canonical; use `pic-ts` when both
the npm package and the Python `pic` command are installed.

CCR can import the JSON/JSONL outputs as candidate work. The boundary is
explicit:

- PIC-TS `accepted=true` does not imply CCR `settled=true`.
- `capital_admitted=true` is lower-bound evidence, not settlement.
- `provider_dispatch_ready` is not dispatch.
- `physical_dispatch_ready` is not physical outcome proof.
- Safe command hints are data for operators, not authority.
- MCP descriptors and A2A handoffs are untrusted until checked.

Use `examples/asi_proxy_acceleration_bundle/` for v0.8 target/baseline/capital,
MCP/A2A, SQOT, BIT, TRC, preflight, and foundry fixture shapes.
