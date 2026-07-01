# CCR Interop

PIC-TS v0.6.0 emits CCR-oriented JSON and JSONL for Node.js agent runtimes.
These records are data-only handoff material. They do not grant shell,
network, provider, repository, or physical authority.

## Phase Plan To CCR

```sh
pic-ts phase plan --compact --emit ccr-tasks
pic-ts phase gap --compact --emit ccr-residuals
```

Task records use `schema_version="ccr.task.v0.1"`. Residual records use
`schema_version="ccr.residual.v0.1"`. Both preserve PIC blockers and keep
`candidate_only_until_checked=true`.

## TRC Operation Readiness

```sh
pic-ts trc trace-normalize --input examples/asi_proxy_benchmark_bundle/trc_agent_trace.json --output trace_nf.json
pic-ts trc trace-check --trace trace_nf.json
pic-ts trc trace-to-packet --trace trace_nf.json
```

`real_world_operation_gate.operation_ready=true` means the trace has explicit
authority, resource, rollback, witness, schedule, and tolerance data for the
scoped provider handoff. It still reports `executed=false` and `settled=false`.

## SDK

```ts
import {
  ccrTasksFromPhasePlan,
  traceCheckReport,
  traceNormalFormReport,
} from "percolation-inversion-compiler-ts/interop/ccr";
```

Use these helpers when a JavaScript runtime needs to route finite repair work to
CCR while preserving residual ledgers.
