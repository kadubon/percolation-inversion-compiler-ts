# Operation Gate

PIC-TS mirrors Python PIC non-executing TRC operation gate reports.
`operation_ready` means a finite trace has the required authority, resource,
rollback, tolerance, schedule, lifecycle, and observation structure for a scoped
handoff candidate. It does not execute anything.

`provider_dispatch_ready` is not dispatch. `physical_dispatch_ready` is not
physical outcome proof. Physical readiness requires accepted/fresh domain,
authority, emergency-stop, runtime-assurance, shield, rollback, hazard,
observation, resource, tolerance, lifecycle, MCP, and A2A gate evidence when
those routes apply.

Search terms: PIC-TS, TRC operation gate, physical_dispatch_ready, provider
dispatch, certificate freshness, observation verifier.

## v0.9/v1.4 Agent Loop Addendum

Operation gates keep operation readiness, provider dispatch readiness, physical dispatch readiness, execution, and physical outcome proof separate. `operation_ready` is not executed; `provider_dispatch_ready` is not dispatched; `physical_dispatch_ready` is not physical outcome proof.

Structured MCP/A2A reports are primary when supplied; legacy boolean fields are preserved only for backward compatibility.
