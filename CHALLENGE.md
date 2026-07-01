# Challenge Harness

PIC-TS challenge checks are diagnostic. They verify that the Node package emits
Python-compatible public JSON shapes for finite bottlenecks, residuals, TRC
operation gates, target-valid CARA acceleration, MCP/A2A reports, SQOT protocol
integrity, and BIT MEC frontier extraction.

PIC-TS does not prove real ASI, run provider actions, perform uncontrolled
physical actuation, mutate model weights, or infer delegated tool authority.

Minimal run:

```sh
pic-ts phase acceleration-report --target examples/asi_proxy_acceleration_bundle/target.json --baseline examples/asi_proxy_acceleration_bundle/baseline_upper_envelope.json --capital examples/asi_proxy_acceleration_bundle/capital_witnesses.jsonl
pic-ts mcp descriptor-check --descriptor examples/asi_proxy_acceleration_bundle/mcp_descriptor.good.json --profile development
pic-ts a2a handoff-check --handoff examples/asi_proxy_acceleration_bundle/a2a_handoff.good.json --profile development
pic-ts sqot protocol-integrity --state examples/asi_proxy_acceleration_bundle/sqot_protocol_integrity.missing_root.json
pic-ts bit mec-frontier --certificates examples/asi_proxy_acceleration_bundle/bit_mec_certificates.jsonl
```

`settled=false` is normal. `capital_admitted`, `provider_dispatch_ready`, and
`physical_dispatch_ready` do not authorize execution or prove a physical
outcome.
