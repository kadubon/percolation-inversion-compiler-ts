# Phase Ecology Lab

Phase Ecology Lab is the v0.5.0 local workspace for inspecting groups of agent
reports as JSON records. It answers practical questions:

- Which packets are accepted?
- Which packets are only candidates?
- Which edges have evidence?
- Which obligations, blockers, or residual work remain?
- Which execution paths are only available as typed data?

The Python package `percolation-inversion-compiler==0.5.0` is canonical. PIC-TS
implements the npm and JavaScript runtime companion surface.

## Store Layout

The TypeScript package uses a JSON/JSONL store:

```text
manifest.json
events.jsonl
windows/latest.json
windows/<window-id>.json
exports/
```

The store is local and deterministic. Source paths are saved as basenames only.
Absolute local paths are not part of public reports.

## Positive Progress

Raw packet count and raw external volume are diagnostic only. A packet can
contribute to positive phase metrics only when it is accepted, retrievable,
within scope, not stale, not blocked by salience, not missing semantic evidence,
not missing authority, and not carrying unresolved residuals that prevent
promotion.

Candidate-only packets remain visible in the graph, but their positive
contribution is false and `settled` remains false.

## Closure And Execution Paths

Closure reports and execution-available path reports are inspection records.
They do not execute paths. They do not prove real-world outcomes. They preserve
authority requirements, rollback requirements, blockers, and residual carry
forward.
