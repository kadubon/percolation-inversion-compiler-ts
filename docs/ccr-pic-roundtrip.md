# CCR PIC Roundtrip

The v0.8.0 roundtrip keeps PIC/PIC-TS and CCR separated by an explicit data boundary.
PIC emits candidate tasks and residuals; CCR may import and schedule them; PIC
can later inspect returned reports without treating them as settlement.

```sh
pic-ts phase plan --compact --emit ccr-tasks > tasks.jsonl
pic-ts phase gap --compact --emit ccr-residuals > residuals.jsonl
```

The JSONL records intentionally set `constraints.allowed_commands=[]`,
`network_policy="none"`, and `side_effect_policy="dry_run_only"`. Any runtime
that decides to execute a provider operation must supply its own explicit
authority, provider config, rollback plan, and witness policy.

Example files are packaged under:

- `examples/interop/ccr_tasks.example.jsonl`
- `examples/interop/pic_to_ccr_roundtrip/phase_plan.compact.json`
- `examples/asi_proxy_benchmark_bundle/trc_agent_trace.json`

Python `percolation-inversion-compiler==0.8.0` remains canonical. PIC-TS tracks
the public JSON, CLI, schema, and safety meaning for npm and Node.js runtimes.

For v0.8 CARA and operation checks, use
`examples/asi_proxy_acceleration_bundle/`. PIC-TS mirrors Python PIC public JSON
for phase acceleration, capital witness, operation gate, MCP descriptor, A2A
handoff, SQOT protocol integrity, and BIT MEC reports. Python PIC remains
canonical; `pic-ts` is the preferred command name in Node projects.

CCR can consume PIC-TS `pic.phase_response_control_step.v1` output with
`ccr foundry allocate --strategy phase-response --response-report <json>`.
That allocation is advisory; it does not execute providers, promote settlement,
or consume all diagnostic reserve.
