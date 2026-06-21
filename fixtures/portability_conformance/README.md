# Portability Conformance Pack

This directory contains stable JSON outputs for cross-language implementations.
Each file is intended to validate against the public schema named in
`manifest.json`. Manifest SHA-256 values are computed over LF-normalized bytes
so Windows and Unix checkouts validate the same examples.

The examples are protocol-relative and intentionally keep `settled=false` where
external or route-level obligations remain. Ports should preserve the separate
meanings of `accepted`, `operationally_usable`, `finite_checks_passed`, and
`settled` rather than collapsing them into one success flag.

The phase acceleration examples add the compact planning contract for ports:
`PhaseAccelerationPlan` ranks finite gaps, bottlenecks, and safe next actions,
while `PhaseAccelerationBenchmarkReport` checks that candidate-only volume does
not reduce phase gaps and that planner output does not grant execution
authority.
