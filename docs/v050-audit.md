# v0.5.0 npm Audit Notes

This page records the release boundary for
`percolation-inversion-compiler-ts@0.5.0`.

Canonical source:

- Python package: `percolation-inversion-compiler==0.5.0`
- Repository: https://github.com/kadubon/percolation-inversion-compiler
- Wiki: https://github.com/kadubon/percolation-inversion-compiler/wiki

PIC-TS is a TypeScript-compatible port of the Python v0.5.0 public JSON, CLI,
schema, conformance, and safety semantics for npm and JavaScript agent
runtimes. It does not claim internal equivalence to the Python implementation.

## Theory Boundary

The papers behind PIC share the same operational boundary. PIC-TS keeps that
boundary at the JSON interface:

| Theory idea        | Plain meaning                                                   | PIC-TS implementation boundary                                                                                             |
| ------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| finite witness     | A claim needs a bounded checkable record.                       | Commands return JSON records with explicit status fields and schema validation.                                            |
| residual ledger    | Unfinished work must stay visible.                              | Outputs preserve residual summaries, missing obligations, blockers, and candidate-only reasons.                            |
| non-promotion      | A candidate is not completed work.                              | Candidate-only packets, raw traffic volume, queue pressure, and diagnostic traces do not increase accepted phase progress. |
| execution boundary | Detecting a possible path is not permission to run it.          | Packet content, trace content, and suggested commands remain inert data; execution counters stay at zero.                  |
| strict settlement  | Settlement requires scoped finite obligations to be discharged. | Diagnostic and recommendation routes keep `settled=false` unless a verifier path explicitly supports settlement.           |

These rules apply across ECPT, BIT, TRC, SQOT, and ALT records. They also apply
to the v0.5.0 Phase Ecology Lab.

## Status Fields

The public JSON status fields are intentionally independent:

| Field                         | Meaning                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `accepted`                    | The command accepted the envelope or report for this bounded check.                                |
| `workflow_usable`             | The output can guide the next workflow step. This does not settle the underlying claim.            |
| `operationally_usable`        | The runtime result can be used under the selected profile. This is still separate from settlement. |
| `settled`                     | Scoped finite obligations have been discharged. Most diagnostic routes keep this false.            |
| `execution_authority_granted` | Whether the report grants authority to execute actions. PIC-TS diagnostic routes keep this false.  |

## npm Runtime Rules

- Runtime use does not require Python.
- Required npm inputs are JSON.
- Phase Lab uses a local JSON/JSONL store instead of Python SQLite.
- Store and export records save source basenames, not absolute local paths.
- Live network connectors are not enabled by default.
- Shell commands, packet content, trace content, and suggested inspection
  commands are not executed by PIC-TS.
- YAML convenience, repository mutation, model mutation, hidden settlement, and
  automatic quarantine or deletion are outside the required npm runtime surface.

## Compatibility Boundary

| Surface                                | Compatibility claim                                                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| schemas                                | `schemas/index.json`, `bundle.schema.json`, and individual schemas are generated from Python `percolation-inversion-compiler==0.5.0` public schema output.               |
| snapshot commands                      | `fixtures/python_v050_snapshots/manifest.json` lists snapshot files with exact JSON parity.                                                                              |
| v0.5.0 Phase Lab and subsystem records | `fixtures/python_v050_cli/manifest.json` lists files used for public-shape and safety compatibility, not exact store equality.                                           |
| v0.4.x compatibility fixtures          | v0.4.4/v0.4.5 fixtures remain packaged where conformance tests still use them.                                                                                           |
| SDK subpaths                           | Root, `./schema`, `./agent/messages`, `./packet`, `./phase-lab`, `./bit-engine`, `./sqot-controller`, `./alt-lift`, and `./trc-adapter` are Python-free npm entrypoints. |

The Phase Lab storage layer is intentionally different: Python uses SQLite for
its local store, while PIC-TS uses JSON/JSONL for npm portability. The public
records keep the same non-promotion and residual-preservation rules.

## Command Families

| Command family                                                                                                             | Audit status                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `agent`, `runtime step`, `schema`, `snapshot`, `routes`, `portability`, `adoption`, `identity`, `packet`                   | Covered by existing CLI, conformance, and installed-smoke tests.                                                                       |
| `phase plan/gap/runbook/benchmark/dashboard/observe`                                                                       | Preserves candidate-only reasons, identity blockers, residual ledgers, and `settled=false` for non-discharged paths.                   |
| `phase lab init/ingest/list-windows/export/observe/graph/closure/executable-paths/threshold-status/certify/compare-window` | Covered by v0.5.0 tests, including output files, directory ingest, YAML fail-closed behavior, and basename source storage.             |
| `bit`, `sqot`, `alt`, `trc`, `ecology`                                                                                     | Diagnostic or recommendation-only. They report blockers, residuals, or candidate paths without granting execution authority.           |
| Python-only heavy routes                                                                                                   | Exposed only as safe diagnostic compatibility routes when present. They fail closed with visible residual and missing-obligation data. |

## Agent Usability Boundary

The recommended npm entrypoint is `pic-ts`. The `pic` command is kept as a
compatibility alias and may be ambiguous on machines that also install the
Python package.

A Node-only agent loop should use file-driven commands:

```sh
pic-ts demo bootstrap --output-dir .pic-demo --overwrite
pic-ts runtime step --state .pic-demo/runtime_state.json --input .pic-demo/runtime_step_input.json --output .pic-demo/runtime_step_report.generated.json
pic-ts packet export --report .pic-demo/runtime_step_report.generated.json --output .pic-demo/packet.json
pic-ts packet inspect --packet .pic-demo/packet.json
pic-ts phase plan --request .pic-demo/asi_proxy_phase_request.json --compact
```

This loop checks and routes JSON. It does not run embedded commands, mutate a
repository, or convert candidate work into settled work.

## Package Safety

The package whitelist includes `dist/`, `schemas/`, `fixtures/`, `examples/`,
`docs/`, `README.md`, `CHANGELOG.md`, `LICENSE`, `NOTICE`, and
`agent-manifest.json`.

The publish safety scan rejects TeX/PDF files, archives, source maps, local
paths, tokens, private keys, model files, vendored Python packages, stale shell
glob examples, and unsupported package content. Snapshot JSON may contain TeX
artifact labels as metadata, but TeX or PDF source files are not packaged.

## Required Release Gate

Run the full local gate before publishing:

```sh
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run conformance
npm run publish:safety
npm run installed:smoke
npm run publint
npm run attw
npm audit --audit-level=high
npm run prepublishOnly
```
