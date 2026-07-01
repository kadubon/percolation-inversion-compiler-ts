# percolation-inversion-compiler-ts Wiki

`percolation-inversion-compiler-ts` is the TypeScript-compatible, Python-free
runtime port of Python PIC public JSON and CLI semantics. The current local
implementation target is v0.8.0.

Use it when a JavaScript or TypeScript agent needs to check candidate output,
packet sidecars, CCR interop files, TRC operation gates, MCP/A2A evidence, or
target-valid ASI-proxy/CARA acceleration reports without running Python at
runtime.

## Fastest Start

```sh
npm install percolation-inversion-compiler-ts
npx pic-ts agent check --compact --text "Candidate packet: preserve residuals." --profile development
npx pic-ts demo bootstrap --output-dir .pic-demo --overwrite
```

`pic-ts` is the preferred command name when Python PIC is also installed.

## What v0.8.0 Adds

PIC-TS mirrors Python PIC v0.8 public JSON for:

- phase acceleration reports;
- runtime capital witness reports;
- stricter TRC operation and physical gate checks;
- MCP descriptor reports and invocation preflight;
- A2A agent-card and handoff reports;
- SQOT protocol/resource/probe diagnostics;
- BIT MEC frontier, compiler, CEGAR, and dynamic-regime reports;
- shared fixtures in `examples/asi_proxy_acceleration_bundle/`.

Python PIC remains canonical. PIC-TS conformance checks compare required keys,
status booleans, blockers, non-claims, residual kinds, and rounded numeric
coordinates.

PIC-TS mirrors Python fail-closed behavior. Non-accepted target laws,
unapproved authority, stale baselines, absent admitted capital witnesses,
proxy-only capital, and MCP descriptor rug-pulls return explicit blockers rather
than silent promotion.

## Safety Boundary

PIC-TS does not prove real ASI, physical truth, simulator truth, oracle truth,
legal authority, policy success, or arbitrary agent correctness.

PIC-TS does not grant authority to run shell commands, mutate repositories,
call providers, use credentials, change model weights, or self-rewrite.

`provider_dispatch_ready` is not dispatch. `physical_dispatch_ready` is not
physical outcome proof. MCP descriptors and A2A handoffs are candidate evidence
until checked.

## Search Terms

TypeScript PIC, Node agent checker, PIC-TS, Python PIC parity, ASI-proxy
acceleration, CARA, runtime capital witness, baseline upper envelope, MCP
descriptor report, A2A handoff report, CCR interop, TRC operation gate,
`settled=false`.
