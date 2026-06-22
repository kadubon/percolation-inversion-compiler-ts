# BIT Bottleneck Inversion Engine

The BIT engine reads an effective packet graph and reports practical blockers:
missing evidence, missing verifier routes, missing semantic edges, missing
rollback support, missing authority, stale packets, salience obstruction, and
similar issues.

Use `pic-ts` for npm and Node.js projects:

```sh
pic-ts bit diagnose --graph effective_graph.json --output bottlenecks.json
pic-ts bit invert --bottlenecks bottlenecks.json --output inversion_candidates.json
pic-ts bit certificate --candidate inversion_candidates.json --output inversion_certificate.json
```

## How To Read It

- A bottleneck is a reason a packet or edge cannot currently contribute.
- A minimal enabling condition is a small, finite check that would reduce the
  blocker if supplied.
- An inversion candidate is a recommendation for what to verify next.
- A certificate is still a candidate unless all scoped obligations are
  discharged by a finite checker.

## Safety Boundary

BIT reports are recommendation-only in PIC-TS. They preserve residual work,
return `settled=false`, and keep `execution_authority_granted=false`. They do
not execute plans, mutate repositories, call external services, or claim that a
bottleneck has been solved without evidence.

Python `percolation-inversion-compiler==0.5.0` remains canonical.
