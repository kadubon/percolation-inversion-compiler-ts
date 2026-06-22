# PIC-TS CLI Reference

`percolation-inversion-compiler-ts` is an npm and Node.js companion for the
Python `percolation-inversion-compiler==0.5.0` public JSON and CLI surface. Use
`pic-ts` in Node projects. `pic` is kept only as a compatibility alias and may
conflict with the Python command.

## Common Checks

```sh
pic-ts agent check --compact --text "Candidate packet: preserve residuals." --profile development
pic-ts demo bootstrap --output-dir .pic-demo --overwrite
pic-ts runtime step --state .pic-demo/runtime_state.json --input .pic-demo/runtime_step_input.json --output .pic-demo/runtime_step_report.generated.json
pic-ts packet export --report .pic-demo/runtime_step_report.generated.json --output .pic-demo/packet.json
pic-ts packet inspect --packet .pic-demo/packet.json
pic-ts phase plan --request .pic-demo/asi_proxy_phase_request.json --compact
```

These commands inspect JSON and report missing work. They do not run packet
content, grant shell authority, or turn accepted work into settled work.

## Phase Ecology Lab

```sh
pic-ts phase lab init --output-dir pic-phase-lab
pic-ts phase lab ingest --store pic-phase-lab --report examples/phase_lab/runtime_report_1.json
pic-ts phase lab ingest --store pic-phase-lab --report examples/phase_lab/runtime_report_2.json
pic-ts phase lab list-windows --store pic-phase-lab
pic-ts phase lab observe --store pic-phase-lab --window latest --output observation.json
pic-ts phase lab graph --store pic-phase-lab --output effective_graph.json
pic-ts phase lab closure --store pic-phase-lab --output closure_report.json
pic-ts phase lab executable-paths --store pic-phase-lab --output executable_paths.json
pic-ts phase lab threshold-status --store pic-phase-lab --threshold examples/thresholds/asi_proxy_development.json
pic-ts phase lab certify --store pic-phase-lab --threshold examples/thresholds/asi_proxy_development.json --output certificate.json
pic-ts phase lab compare-window --store pic-phase-lab --baseline previous --candidate latest
```

The lab uses a local JSON/JSONL store. It saves source basenames, not absolute
local paths. YAML input, live connectors, shell execution, repository mutation,
and hidden settlement are outside the required npm runtime surface.

## v0.5.0 Diagnostic Commands

```sh
pic-ts ecology effective-graph --reports examples/phase_lab/runtime_report_1.json --reports examples/phase_lab/runtime_report_2.json --output effective_graph.json
pic-ts ecology execution-available-paths --graph effective_graph.json
pic-ts bit diagnose --graph effective_graph.json --output bottlenecks.json
pic-ts bit invert --bottlenecks bottlenecks.json --output inversion_candidates.json
pic-ts bit mec --bottlenecks bottlenecks.json --bottleneck bottleneck:example
pic-ts bit certificate --candidate inversion_candidates.json
pic-ts bit compare-baseline --baseline examples/phase_lab/phase_window_observation.example.json --candidate examples/phase_lab/phase_window_observation.example.json
pic-ts sqot diagnose-queue --graph effective_graph.json
pic-ts sqot salience-obstruction --graph effective_graph.json
pic-ts sqot rebalance --graph effective_graph.json
pic-ts sqot quarantine --graph effective_graph.json
pic-ts sqot reserve-check --graph effective_graph.json
pic-ts alt ecpt-lift --packets examples/packet_exchange/packet_envelope.example.json --graph effective_graph.json
pic-ts alt receiver-lift --packet examples/packet_exchange/packet_envelope.example.json --receiver-context examples/packet_exchange/packet_envelope.example.json
pic-ts alt liquidity-to-paths --packet examples/packet_exchange/packet_envelope.example.json --graph effective_graph.json
pic-ts alt capital-impact --reports examples/alt_lift/alt_ecpt_lift.example.json
pic-ts trc trace-adapter --input examples/trc_adapter/tool_trace_input.example.json
pic-ts trc tool-trace --events examples/trc_adapter/tool_trace_input.example.json
pic-ts trc action-boundary --report fixtures/python_v044_demo/runtime_step_report.json
```

All of these routes are diagnostic or recommendation outputs. They keep
`settled=false` unless a finite verifier path has actually discharged the
scoped obligations.
