# TRC Typed Trace Adapter

The TRC adapter turns agent and tool-call logs into typed JSON trace records.
It is meant for inspection, replay planning, and boundary checks. It treats
trace content as data, not as commands to run.

Use `pic-ts` for npm and Node.js projects:

```sh
pic-ts trc trace-adapter --input trace.json --output typed_trace.json
pic-ts trc tool-trace --events events.jsonl --output tool_trace.json
pic-ts trc action-boundary --report runtime_report.json --output action_boundary.json
```

## How To Read It

- `typed_trace.events` lists source, receiver, action kind, authority status,
  rollback status, and evidence references.
- `frontier_debt` lists missing physical or oracle obligations.
- `normal_form` gives a stable trace summary for later checking.
- `executed_action_count` is always zero in PIC-TS.

## Safety Boundary

Embedded text such as `npm install`, `npx`, `node`, `docker run`, `kubectl`,
`curl`, `bash`, or `powershell` is reported only as data. PIC-TS does not run
trace content, does not grant authority, and does not settle physical or oracle
claims.

Python `percolation-inversion-compiler==0.5.0` remains canonical.
