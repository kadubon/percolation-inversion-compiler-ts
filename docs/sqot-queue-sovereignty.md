# SQOT Queue Sovereignty

SQOT reports how an agent's attention or verification queue is occupied. It is
useful when many candidate packets exist but only some are worth review.

Use `pic-ts` for npm and Node.js projects:

```sh
pic-ts sqot diagnose-queue --graph effective_graph.json --output queue_report.json
pic-ts sqot salience-obstruction --graph effective_graph.json --output obstruction.json
pic-ts sqot rebalance --graph effective_graph.json --output rebalance_plan.json
pic-ts sqot quarantine --graph effective_graph.json --output quarantine_decisions.json
pic-ts sqot reserve-check --graph effective_graph.json --output reserve_report.json
```

## How To Read It

- `queue_occupation` shows how much review capacity is taken by blocked or
  candidate-only material.
- `verification_queue_pressure` shows whether missing obligations are piling up.
- `rebalance` and `quarantine` outputs are labels for human or agent review.
- `applied_action_count` stays zero unless an external system explicitly acts
  outside PIC-TS.

## Safety Boundary

PIC-TS does not delete packets, move files, change priorities in an external
queue, or automatically quarantine anything. SQOT output is inert JSON, not an
instruction stream. It does not imply settlement.

Python `percolation-inversion-compiler==0.5.0` remains canonical.
