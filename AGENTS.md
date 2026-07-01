# PIC-TS Agent Guide

PIC-TS mirrors Python PIC public JSON for JavaScript and TypeScript agent
runtimes. It is Python-free at runtime and local-first.

Use:

```sh
npx pic-ts agent check --compact --text "Candidate packet: preserve residuals." --profile development
npx pic-ts token extract-pipeline --trace trace.json --compact
npx pic-ts token admissibility --token token.json --compact
npx pic-ts trc operation-gate --trace trace_nf.json --provider-profile provider.json
npx pic-ts performance report --json
```

Safety contract:

- `accepted=true` does not imply `settled=true`.
- Token extraction is not settlement.
- Token admissibility is not capital admission.
- `provider_dispatch_ready` is not dispatch.
- `physical_dispatch_ready` is not physical outcome proof.
- Safe commands are hints, not authority.
- Duplicate mass cannot increase support.
- Cache hits are not proof.

Use `examples/asi_proxy_loop_bundle/` for the smallest v0.9 cross-repo fixture
set. All files are inert JSON examples.
