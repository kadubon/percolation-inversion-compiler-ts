# PIC to CCR Roundtrip

This directory contains fixed-output examples for the PIC-to-CCR contract.

Use the task JSONL with:

```bash
ccr task import --file tasks.jsonl --provider pic --json
```

Use the residual JSONL with:

```bash
ccr residual import --file residuals.jsonl --provider pic --json
```

All records are candidate-only and keep `allowed_commands` empty.
