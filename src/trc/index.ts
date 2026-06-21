import { readFileSync } from "node:fs";

export function compileTrc(
  options: { recordsPath?: string; failOn?: string } = {},
): Record<string, unknown> {
  let records: unknown[] = [];
  const reasons: string[] = [];
  if (options.recordsPath) {
    const parsed = JSON.parse(
      readFileSync(options.recordsPath, "utf8"),
    ) as unknown;
    records = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { records?: unknown[] }).records)
        ? (parsed as { records: unknown[] }).records
        : [];
  }
  const invalidMainTrace = records.some((record) => {
    const obj = record as Record<string, unknown>;
    return obj.stratum === "main" && !obj.trace_id && !obj.trace;
  });
  if (invalidMainTrace) {
    reasons.push(
      "main frontier record lacks accepted executable trace normal form",
    );
  }
  const accepted = !invalidMainTrace;
  return {
    result_id: "trc-compile-result",
    accepted,
    operationally_usable: accepted && !invalidMainTrace,
    settled: false,
    main_frontier_count: invalidMainTrace ? 0 : records.length,
    diagnostic_count: invalidMainTrace ? 1 : 0,
    residual_ledger: invalidMainTrace
      ? {
          coordinates: {
            "trc:trace-normal-form": {
              name: "trc:trace-normal-form",
              value: 1,
              unit: "dimensionless",
              kind: "residual",
              description:
                "main-frontier records require executable trace normal forms",
            },
          },
        }
      : { coordinates: {} },
    reasons,
  };
}
