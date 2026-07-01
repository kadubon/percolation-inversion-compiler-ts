# Changelog

## v0.8.0

- Mirrors the Python `percolation-inversion-compiler==0.8.0` public v0.8 JSON
  layer for target-valid ASI-proxy/CARA acceleration, MCP descriptor reports,
  MCP invocation preflight, A2A agent-card and task-handoff reports, SQOT
  protocol/resource diagnostics, BIT MEC frontier extraction, and TRC physical
  gate freshness checks.
- Adds v0.7/v0.8 conformance tests and keeps `pic-ts` as the preferred command
  name when the Python `pic` CLI is also installed.
- Keeps all outputs non-executing and residual-preserving: accepted reports do
  not imply settlement, provider dispatch readiness is not dispatch, and
  physical dispatch readiness is not physical outcome proof.
- Mirrors Python fail-closed CARA and MCP semantics: blocked target/baseline or
  capital evidence sets phase acceleration `ok=false`, and descriptors changed
  after approval are rejected before invocation.

## v0.7.0

- Tracks the Python `percolation-inversion-compiler==0.7.0` TRC operation gate
  and ALT capital admission semantics for npm and JavaScript agent runtimes.
- Adds `pic-ts trc operation-gate` and `operationGateReport()` with authority,
  provider-dispatch, physical-dispatch, MCP, and A2A gates.
- Blocks expired, time-unknown, scope-mismatched, untrusted, and fixture-only
  authority envelopes from operation readiness while keeping `executed=false`
  and `settled=false`.
- Separates ALT bridge `accepted` from `capital_admitted` and preserves signed
  surplus bounds plus capital admission blockers.

## v0.6.0

- Tracks the Python `percolation-inversion-compiler==0.6.0` CCR interop and TRC operation-readiness public surfaces for npm and JavaScript agent runtimes.
- Adds CCR JSONL emissions from `phase plan`, `phase gap`, BIT witness registries, and SQOT queue diagnostics.
- Adds TRC `trace-normalize`, `trace-check`, and `trace-to-packet` commands plus the `interop/ccr` SDK subpath.
- Adds the ASI-proxy benchmark bundle, CCR roundtrip examples, interop schemas, and v0.6 audit documentation.
- Preserves the public boundary: operation-ready means required scoped planning fields are present; PIC-TS does not execute provider actions or mark reports settled.

## v0.5.0

- Tracks the Python `percolation-inversion-compiler==0.5.0` public JSON, CLI, schema, examples, and safety semantics for npm and JavaScript agent runtimes.
- Adds Phase Ecology Lab support with a local JSON/JSONL store, effective packet graphs, window observations, closure checks, execution-available path detection, threshold status, and certificate candidates.
- Adds Node-friendly SDK and CLI surfaces for BIT, SQOT, ALT lift, TRC adapter, and ecology graph/path diagnostics.
- Adds Python v0.5.0-derived schemas, examples, portability fixtures, snapshot fixtures, installed smoke coverage, and package safety checks.
- Keeps candidate-only, diagnostic, and execution-path outputs inert: they do not run commands, grant execution authority, or mark reports as settled.

## v0.4.5

- Fixes `agent_output_digest` to use a real SHA-256 digest.
- Improves Markdown renderers for adoption, dashboard, benchmark, observe, and autonomy-audit outputs.
- Adds Node.js/npm-oriented command-like string detection for packet inspection while keeping packet content inert.
- Clarifies that `pic-ts` is the recommended npm CLI command and `pic` is a compatibility alias.
- Preserves the v0.4.4 public contract: TypeScript compatibility for public JSON, CLI, schema, conformance, and safety semantics, with Python remaining canonical.
