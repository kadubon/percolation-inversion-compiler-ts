# v0.6.0 npm Audit Notes

Scope: `percolation-inversion-compiler-ts@0.6.0`.

PIC-TS v0.6.0 tracks the Python `percolation-inversion-compiler==0.6.0`
public CCR interop and TRC operation-readiness surfaces for npm and JavaScript
agent runtimes.

## New Public Surfaces

- `pic-ts phase plan --emit ccr-tasks`
- `pic-ts phase gap --emit ccr-residuals`
- `pic-ts bit extract-registry`
- `pic-ts bit verify-witnesses`
- `pic-ts bit emit-ccr-tasks`
- `pic-ts sqot diagnose-queue --state <state.json> --emit ccr-tasks`
- `pic-ts alt bridge-ecpt`
- `pic-ts trc trace-normalize`
- `pic-ts trc trace-check`
- `pic-ts trc trace-to-packet`
- SDK subpath: `percolation-inversion-compiler-ts/interop/ccr`

## Safety Boundary

The new outputs are inert JSON or JSONL. They do not execute embedded commands,
provider calls, packet text, traces, or safe command hints. `operation_ready`
means required operation-planning fields are present for the scoped trace;
`executed` remains false and `settled` remains false.

## Release Gates

Run before npm release:

```sh
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run conformance
npm run pack:check
npm run publint
npm run attw
npm run installed:smoke
npm audit --audit-level=high
```

The package whitelist includes built ESM, declarations, schemas, examples,
docs, and agent manifest only. It rejects local paths, secrets, private keys,
archives, source maps, TeX/PDF sources, model weights, and dependency folders.
