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
pic-ts trc operation-gate --trace trace_nf.json --provider-profile provider_profile.json
pic-ts trc trace-to-packet --trace trace_nf.json
```

`real_world_operation_gate.operation_ready=true` means the trace has explicit
authority, resource, rollback, witness, schedule, and tolerance data for the
scoped provider handoff. It still reports `executed=false` and `settled=false`.
The stricter `operation-gate` report adds authority freshness, scope, provider
dispatch, physical dispatch, MCP, and A2A gates.

Authority must be approved/active, unexpired relative to the operation
evaluation clock, and scoped to the validity domain and provider target.
`expires_at: 1970-01-01T00:00:00Z` is diagnostic-only when explicitly marked as
fixture dry-run and otherwise blocks readiness. `physical_dispatch_ready` is not
physical outcome proof.

ALT bridge reports separate `accepted` from `capital_admitted`; proxy-only or
negative evidence can be accepted as report data while contributing no safe
capital.

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
