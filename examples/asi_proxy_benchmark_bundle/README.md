# ASI-Proxy Benchmark Bundle

This dry-run bundle compares unstructured candidate sharing with PIC-guided
finite routing. It reports routing visibility, residual visibility, and
protocol-relative phase gaps only.

No file in this bundle claims real ASI detection, creation, or settlement.

The request fixture is executable with:

```bash
pic phase plan --request examples/asi_proxy_benchmark_bundle/pic_phase_request.json --compact
pic phase plan --request examples/asi_proxy_benchmark_bundle/pic_phase_request.json --compact --emit ccr-tasks
pic trc trace-normalize --input examples/asi_proxy_benchmark_bundle/trc_agent_trace.json --output trace_nf.json
pic trc trace-check --trace trace_nf.json --output trc_trace_report.json
```

The expected plan remains candidate-only and preserves settlement blockers for
CCR import. The TRC trace fixture can become execution-available only as a
checked operation candidate; PIC still does not execute it or prove a physical
outcome.
