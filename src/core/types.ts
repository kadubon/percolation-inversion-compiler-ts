export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue | undefined };

export interface LedgerCoordinate {
  name: string;
  value: number;
  unit: string;
  kind:
    | "benefit"
    | "burden"
    | "residual"
    | "tolerance"
    | "resource"
    | "metadata";
  description?: string | null;
  evidence_status?: "verified" | "declared" | "unknown";
  evidence_refs?: string[];
  known?: boolean;
}

export interface Ledger {
  coordinates: Record<string, LedgerCoordinate>;
}

export interface CheckLike {
  accepted: boolean;
  workflow_usable?: boolean;
  finite_checks_passed?: boolean;
  operationally_usable?: boolean;
  settled: boolean;
  reasons?: string[];
}
