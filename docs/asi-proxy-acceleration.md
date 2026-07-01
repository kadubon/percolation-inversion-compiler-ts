# ASI-Proxy Acceleration

v0.8.0 treats ASI-proxy/CARA acceleration as a target-valid comparison:
the target set, baseline upper envelope, and runtime capital witnesses must be
declared before outcome observation. A report can become a certified
acceleration candidate only when admitted lower-bound capital crosses the
declared target with positive margin before a resource-matched baseline upper
envelope.

Search terms: ASI-proxy acceleration, CARA, runtime capital witness, baseline
upper envelope, target-validity certificate, phase acceleration report, PIC-TS,
Python PIC parity, CCR, residual ledger, MCP, A2A, SQOT, BIT, TRC.

PIC-TS uses ASI-proxy language in the same protocol-relative sense as the
Python package: it routes finite workflow bottlenecks, packet checks, queue
diagnostics, trace normalization, and residual repair. It does not establish
real ASI, model-weight change, physical outcome truth, or oracle truth.

In v0.8.0, a Node.js agent can accelerate the practical proxy loop by:

1. creating or checking a phase plan;
2. emitting CCR task JSONL for finite repair work;
3. normalizing a TRC trace;
4. checking whether the trace is operation-ready for a scoped provider handoff;
5. checking target/baseline/capital witnesses, MCP descriptors, A2A handoffs,
   SQOT protocol integrity, and BIT MEC frontier reports;
6. converting the trace to a candidate packet while keeping `settled=false`.

```sh
pic-ts phase plan --request examples/asi_proxy_benchmark_bundle/pic_phase_request.json --compact
pic-ts phase plan --request examples/asi_proxy_benchmark_bundle/pic_phase_request.json --compact --emit ccr-tasks
pic-ts trc trace-normalize --input examples/asi_proxy_benchmark_bundle/trc_agent_trace.json --output trace_nf.json
pic-ts trc trace-check --trace trace_nf.json
pic-ts phase acceleration-report --target examples/asi_proxy_acceleration_bundle/target.json --baseline examples/asi_proxy_acceleration_bundle/baseline_upper_envelope.json --capital examples/asi_proxy_acceleration_bundle/capital_witnesses.jsonl
```

The operation-readiness gate is intentionally strict. Missing authority,
resource ledger, rollback escrow, witness, schedule, or tolerance data becomes a
visible blocker instead of being silently promoted.

`capital_admitted=true` is lower-bound evidence, not settlement. Proxy-only
evidence cannot increase safe capital. `provider_dispatch_ready` is not dispatch
and `physical_dispatch_ready` is not physical outcome proof.

PIC-TS mirrors Python PIC fail-closed behavior: non-accepted target laws,
unapproved authority, stale or missing baselines, absent admitted runtime
capital witnesses, proxy-only capital, raw-net floor failures, and MCP
descriptor rug-pulls become explicit blockers. Blocked CARA reports return
`ok=false` while preserving `settled=false`.
