# percolation-inversion-compiler-ts

AI agent output checker and workflow report generator for Node.js.

`percolation-inversion-compiler-ts` helps a JavaScript or TypeScript agent turn
draft output, local runtime files, agent messages, and packet sidecars into
structured JSON reports. The reports show what is accepted, what is usable for a
workflow, what still needs checking, and what must not be treated as completed
work.

This npm package is a TypeScript port of the public JSON, CLI, schema,
conformance fixture, and safety behavior of
`percolation-inversion-compiler` v0.4.4. The Python package remains the
canonical implementation:

- Canonical repository:
  [kadubon/percolation-inversion-compiler](https://github.com/kadubon/percolation-inversion-compiler)
- Canonical wiki:
  [percolation-inversion-compiler Wiki](https://github.com/kadubon/percolation-inversion-compiler/wiki)

## What It Does

Use this package when an agent output should be checked before it is reused,
sent to another agent, turned into a packet, or used to plan the next workflow
step.

In plain terms, it answers:

- What did the agent claim?
- Is the JSON envelope accepted by the checker?
- Can this report guide the next safe workflow step?
- What evidence, identity, or verification work is still missing?
- Which command or SDK call can inspect the next step?
- Which content must remain candidate-only and not be promoted to completed
  work?

The package is local-first and Python-free at runtime. It does not execute
arbitrary shell commands, mutate repositories, crawl in the background, or prove
real-world truth.

## Quick Start

Install from npm:

```sh
npm install percolation-inversion-compiler-ts
```

Run a compact agent check:

```sh
npx pic-ts agent check --compact --text "Candidate packet: preserve residuals." --profile development
```

Plan the next workflow step:

```sh
npx pic-ts phase plan --compact --text "Candidate packet: preserve residuals." --profile development
```

The package exposes two command names:

- `pic-ts`: recommended for npm and Node.js projects.
- `pic`: compatibility bin matching the Python CLI command name.

## Run The Node-Only Agent Loop

This loop works without Python. It creates demo input files, checks one runtime
step, exports the result as inert packet data, inspects that packet without
executing embedded text, and builds a phase plan from a request JSON file.

```sh
npx pic-ts demo bootstrap --output-dir .pic-demo --overwrite
npx pic-ts agent check --compact --text "Candidate packet: preserve residuals." --profile development
npx pic-ts runtime step --state .pic-demo/runtime_state.json --input .pic-demo/runtime_step_input.json --output .pic-demo/runtime_step_report.generated.json
npx pic-ts packet export --report .pic-demo/runtime_step_report.generated.json --output .pic-demo/packet.json
npx pic-ts packet inspect --packet .pic-demo/packet.json
npx pic-ts phase plan --request .pic-demo/asi_proxy_phase_request.json --compact
npx pic-ts agent accelerate --compact --text "Candidate packet: preserve residuals." --profile development
```

This is the practical npm version of the ASI-proxy loop: verified candidate work
is preserved, missing work is kept visible, and bottlenecks are routed to finite
checks. It is not a claim that real ASI, physical outcomes, simulator truth, or
oracle truth has been proven.

## Common Commands

Check agent output:

```sh
npx pic-ts agent check --compact --text "Candidate packet: route evidence and preserve residuals." --profile development
npx pic-ts agent intake --text "Candidate packet: route evidence and preserve residuals." --profile development
npx pic-ts agent runbook --profile development
```

Plan workflow repair:

```sh
npx pic-ts phase plan --compact --profile development
npx pic-ts phase gap --compact --profile development
npx pic-ts phase runbook --profile development
```

Run the bundled runtime fixture:

```sh
npx pic-ts runtime step --state fixtures/python_v044_demo/runtime_state.json --input fixtures/python_v044_demo/runtime_step_input.json
```

Work with packets as data:

```sh
npx pic-ts packet export --report fixtures/python_v044_demo/runtime_step_report.json --output packet.json
npx pic-ts packet inspect --packet packet.json
```

Inspect schemas and conformance fixtures:

```sh
npx pic-ts schema --type PhaseAccelerationPlan
npx pic-ts portability verify --manifest fixtures/portability_conformance/manifest.json
npx pic-ts snapshot list
```

## Use From JavaScript

Root import:

```ts
import {
  buildPhaseAccelerationPlan,
  phaseAccelerationCompactPayload,
  runAgentCheck,
  schemaByType,
  verifyPortabilityManifest,
} from "percolation-inversion-compiler-ts";

const check = runAgentCheck(
  { agent_output: "Candidate packet: preserve residuals." },
  true,
);

const plan = phaseAccelerationCompactPayload(
  buildPhaseAccelerationPlan({ compact: true }),
);

const schema = schemaByType("PhaseAccelerationPlan");
```

Subpath imports for agent runtimes:

```ts
import { schemaByType } from "percolation-inversion-compiler-ts/schema";
import { createAgentMessage } from "percolation-inversion-compiler-ts/agent/messages";
import { packetEnvelopeFromRuntimeReport } from "percolation-inversion-compiler-ts/packet";
```

## How To Read The JSON

The JSON fields are intentionally separate:

| Field                  | Plain meaning                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `accepted`             | The input envelope passed the finite checks for this command.                        |
| `workflow_usable`      | The report can guide the next workflow step. This is not settlement.                 |
| `operationally_usable` | The deeper runtime result can be used under the selected profile.                    |
| `settled`              | All scoped finite obligations are discharged. This is often `false`.                 |
| `missing_obligations`  | Work that is still missing, such as evidence, identity, route, or verifier checks.   |
| `residual_ledger`      | Remaining debt, limits, or unresolved work that must stay visible.                   |
| `safe_commands`        | Suggested inspection commands. They are not permission to execute arbitrary actions. |

`settled=false` is not a command failure. It usually means the checker preserved
unfinished work instead of hiding it.

## Safety Limits

This package is designed for safe local inspection and agent workflow routing.

It does not:

- prove real ASI or general intelligence;
- prove physical, simulator, policy, legal, or oracle outcomes;
- grant shell, repository, network, or model-mutation authority;
- treat agent text, registry metadata, or queue priority as verified evidence;
- silently promote unresolved obligations to `settled=true`;
- execute packet content or command-like strings embedded in messages.

Heavy routes that would require Python-only services, live connectors, local
runtime stores, repository mutation, or external verifier authority are exposed
as safe diagnostic compatibility routes. They fail closed with
`operationally_usable=false`, `settled=false`,
`execution_authority_granted=false`, visible residual ledgers, and visible
missing obligations.

## Python Canonical Implementation

The canonical implementation is the Python package
`percolation-inversion-compiler==0.4.4`.

Use the Python project when you need the canonical source implementation,
Python SDK behavior, optional Python sidecars, or the full project
documentation:

- Repository:
  [https://github.com/kadubon/percolation-inversion-compiler](https://github.com/kadubon/percolation-inversion-compiler)
- Wiki:
  [https://github.com/kadubon/percolation-inversion-compiler/wiki](https://github.com/kadubon/percolation-inversion-compiler/wiki)

This TypeScript package keeps the same public JSON meaning for npm and Node.js
agent runtimes. It does not vendor the canonical TeX or PDF papers, and it does
not copy Python internals line by line.

## Compatibility

| Command family                                                                                                                                                                                        | Compatibility claim                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `agent check`, `agent intake`, `agent runbook`, `agent autonomy-audit`, `agent manifest`, `agent communication-guide`                                                                                 | Exact Python v0.4.4 golden JSON for bundled fixture-backed modes.                                           |
| `phase plan`, `phase gap`, `phase runbook`, `phase benchmark`, `phase benchmark-suite`, `phase dashboard`, `phase observe`                                                                            | Exact Python v0.4.4 golden JSON for static fixtures; dynamic `--request` preserves public v0.4.4 semantics. |
| `runtime step`, `schema`, `snapshot`, `routes`, `portability`, `adoption`, `identity`, `demo installed-smoke`                                                                                         | Python v0.4.4 golden JSON or bundled canonical schema and fixture semantics.                                |
| `agent message`, `agent inbox`, `packet`, Node-only demo bootstrap                                                                                                                                    | npm/Node sidecar implementation with the same non-promotion and residual-preservation rules.                |
| evidence heavy routes, runtime service/store/heavy actions, SQOT audit, ALT heavy routes, ecology heavy routes, ECPT heavy routes, audit/extract/check/coverage/parse/provenance/sbom/demo datacenter | Safe diagnostic compatibility only.                                                                         |

## Development And Publishing Checks

Run the local gate before publishing:

```sh
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run conformance
npm run pack:check
npm run installed:smoke
npm run publint
npm run attw
npm audit --audit-level=high
npm run prepublishOnly
```

The package uses a `files` whitelist. The publish safety check rejects local
paths, obvious secrets, TeX/PDF sources, archives, source maps, model weights,
private keys, dependency folders, and private data paths.

## Search Terms

AI agent output checker, workflow report generator, Node.js agent runtime, npm
agent checker, LLM output validation, AI workflow verification, JSON report,
safe reuse check, evidence routing, verifier routing, residual ledger,
unresolved work ledger, missing obligations, packet export, packet inspection,
agent-to-agent message checking, runtime step report, phase planning, workflow
bottleneck planning, portability conformance, JSON schema validation,
percolation inversion compiler, PIC, ECPT, BIT, TRC, SQOT, ALT, ASI-proxy
workflow loop.
