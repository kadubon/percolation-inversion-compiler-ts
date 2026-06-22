# Effective Packet Graph

The effective packet graph is a local JSON report that separates useful packet
records from packet traffic that is only diagnostic. It helps an agent see which
reports can support later checks, which edges still need evidence, and which
items must not count as progress.

Use `pic-ts` for npm and Node.js projects:

```sh
pic-ts phase lab graph --store .pic-lab --output effective_graph.json
pic-ts ecology effective-graph --reports report-a.json --reports report-b.json --output effective_graph.json
```

## How To Read It

- `nodes` are packet or report records stored as inert data.
- `edges` are claimed relationships between records.
- `accepted_packet_capital` counts only accepted, retrievable, non-blocked
  records.
- `candidate_only_packets`, `missing_edge_evidence`, and `residual_summary`
  explain why some material is not counted.
- `positive_phase_contribution` is false for raw external volume, registry
  metadata, agent text alone, stale records, and candidate-only records.

## Safety Boundary

The graph builder does not run packet content, shell text, `safe_commands`, npm
commands, Docker commands, or Kubernetes commands. It does not grant execution
authority and does not turn `accepted` or `workflow_usable` into `settled`.
Diagnostic graph reports keep `settled=false`.

Python `percolation-inversion-compiler==0.5.0` remains the canonical
implementation. PIC-TS mirrors the public JSON boundary for JavaScript agent
runtimes.
