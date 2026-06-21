import type { Ledger } from "./types.js";

export function emptyLedger(): Ledger {
  return { coordinates: {} };
}

export function residualLedger(
  name: string,
  value = 1,
  description?: string,
): Ledger {
  return {
    coordinates: {
      [name]: {
        name,
        value,
        unit: "dimensionless",
        kind: "residual",
        description: description ?? null,
        evidence_status: "declared",
        evidence_refs: [],
        known: true,
      },
    },
  };
}

export function summarizeLedger(
  ledger: Ledger | undefined,
): Record<string, number> {
  const summary: Record<string, number> = {};
  if (!ledger) {
    return summary;
  }
  for (const coordinate of Object.values(ledger.coordinates ?? {})) {
    const kind = coordinate.kind ?? "residual";
    summary[kind] = (summary[kind] ?? 0) + Number(coordinate.value ?? 0);
  }
  return Object.fromEntries(
    Object.entries(summary).sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function combineLedgers(...ledgers: Array<Ledger | undefined>): Ledger {
  const combined = emptyLedger();
  for (const ledger of ledgers) {
    for (const [name, coordinate] of Object.entries(
      ledger?.coordinates ?? {},
    )) {
      const existing = combined.coordinates[name];
      if (!existing) {
        combined.coordinates[name] = { ...coordinate };
        continue;
      }
      if (
        existing.unit !== coordinate.unit ||
        existing.kind !== coordinate.kind
      ) {
        throw new Error(`coordinate ${name} has incompatible unit or kind`);
      }
      combined.coordinates[name] = {
        ...existing,
        value: existing.value + coordinate.value,
      };
    }
  }
  return combined;
}
