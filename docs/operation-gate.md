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
