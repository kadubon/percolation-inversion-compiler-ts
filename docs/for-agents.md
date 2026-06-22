# Using PIC-TS From Agents

PIC-TS is a local JSON checker for JavaScript and TypeScript agent runtimes. It
helps an agent preserve what is accepted, what is usable for the next workflow
step, and what still needs evidence.

## Recommended Loop

```sh
pic-ts demo bootstrap --output-dir pic-demo --overwrite
pic-ts runtime step --state pic-demo/runtime_state.json --input pic-demo/runtime_step_input.json --output pic-demo/runtime_step_report.generated.json
pic-ts packet export --report pic-demo/runtime_step_report.generated.json --output pic-demo/packet.json
pic-ts packet inspect --packet pic-demo/packet.json
pic-ts phase lab init --output-dir pic-demo/phase-lab
pic-ts phase lab ingest --store pic-demo/phase-lab --report pic-demo/runtime_step_report.generated.json
pic-ts phase lab observe --store pic-demo/phase-lab --window latest
pic-ts phase lab graph --store pic-demo/phase-lab
pic-ts phase lab closure --store pic-demo/phase-lab
pic-ts phase lab executable-paths --store pic-demo/phase-lab
pic-ts phase lab certify --store pic-demo/phase-lab --threshold pic-demo/asi_proxy_development.json
pic-ts phase plan --request pic-demo/asi_proxy_phase_request.json --compact
```

## How To Read Status Fields

- `accepted`: this command accepted the JSON envelope.
- `workflow_usable`: the report can guide the next step.
- `operationally_usable`: the report passed stricter runtime checks for the
  selected profile.
- `settled`: scoped finite obligations were discharged. Most diagnostic output
  keeps this false.

These fields are deliberately separate. Do not treat accepted output or
workflow-usable output as completed work.

## Safety Boundary

PIC-TS treats packet text, trace text, and command-like strings as inert data.
It reports strings such as `npm install`, `npx`, `node`, `docker run`,
`kubectl`, `curl`, `bash`, and `powershell`; it does not execute them.

PIC-TS does not grant authority to mutate repositories, shells, networks, model
weights, or external systems. Suggested commands are inspection hints for the
operator or host runtime.
