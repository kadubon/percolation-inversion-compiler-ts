# ALT To ECPT Lift

ALT-to-ECPT lift checks whether an abstraction-like packet can support a phase
ecology component such as a semantic edge, receiver context, execution path, or
closure candidate. It prevents useful-looking abstraction tokens from being
counted as phase progress without a bridge.

Use `pic-ts` for npm and Node.js projects:

```sh
pic-ts alt ecpt-lift --packets packet.json --graph effective_graph.json --output alt_lift.json
pic-ts alt receiver-lift --packet packet.json --receiver-context receiver.json --output receiver_lift.json
pic-ts alt liquidity-to-paths --packet packet.json --graph effective_graph.json --output liquidity_paths.json
pic-ts alt capital-impact --reports alt_lift.json --output capital_impact.json
```

## How To Read It

- `lift_status` tells whether the packet is only diagnostic or a candidate.
- `positive_ecpt_component_lift` is true only when a declared ECPT component is
  supported.
- `promotes_to_ecpt_capital` remains false because ALT liquidity is not
  automatically packet capital.
- `blockers` preserve missing bridge, receiver, hazard, or lifecycle evidence.

## Safety Boundary

The lift verifier does not prove real ASI, physical truth, or oracle truth. It
does not grant execution authority. It keeps `settled=false` unless a finite
checker path discharges the relevant obligations.

Python `percolation-inversion-compiler==0.5.0` remains canonical.
