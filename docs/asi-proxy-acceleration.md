# ASI-Proxy Acceleration

PIC-TS uses ASI-proxy language in the same protocol-relative sense as the
Python package: it routes finite workflow bottlenecks, packet checks, queue
diagnostics, trace normalization, and residual repair. It does not establish
real ASI, model-weight change, physical outcome truth, or oracle truth.

In v0.6.0, a Node.js agent can accelerate the practical proxy loop by:

1. creating or checking a phase plan;
2. emitting CCR task JSONL for finite repair work;
3. normalizing a TRC trace;
4. checking whether the trace is operation-ready for a scoped provider handoff;
5. converting the trace to a candidate packet while keeping `settled=false`.

```sh
pic-ts phase plan --request examples/asi_proxy_benchmark_bundle/pic_phase_request.json --compact
pic-ts phase plan --request examples/asi_proxy_benchmark_bundle/pic_phase_request.json --compact --emit ccr-tasks
pic-ts trc trace-normalize --input examples/asi_proxy_benchmark_bundle/trc_agent_trace.json --output trace_nf.json
pic-ts trc trace-check --trace trace_nf.json
```

The operation-readiness gate is intentionally strict. Missing authority,
resource ledger, rollback escrow, witness, schedule, or tolerance data becomes a
visible blocker instead of being silently promoted.
