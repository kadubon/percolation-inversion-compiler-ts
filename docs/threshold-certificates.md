# Threshold Status And Certificate Candidates

Threshold status compares a Phase Lab observation against a local JSON
threshold. Certificate candidate output explains whether the available finite
checks are enough for a candidate report or whether the tool must abstain.

Use `pic-ts` for npm and Node.js projects:

```sh
pic-ts phase lab threshold-status --store .pic-lab --threshold threshold.json --output threshold_status.json
pic-ts phase lab certify --store .pic-lab --threshold threshold.json --output certificate.json
```

## How To Read It

- `certificate_status = "candidate"` means the finite threshold fields passed
  inside the declared protocol window.
- `certificate_status = "abstain"` means evidence or obligations are missing.
- `failed_components`, `defects`, and `abstention_report` show what remains.
- `real_asi_proof`, `physical_truth_proven`, and `oracle_truth_proven` remain
  false.

## Safety Boundary

Threshold reports are protocol-relative. A candidate certificate is not real
world proof, not execution permission, and not hidden settlement. PIC-TS keeps
`execution_authority_granted=false` and generally keeps `settled=false` for
these v0.5.0 diagnostic routes.

Python `percolation-inversion-compiler==0.5.0` remains canonical.
