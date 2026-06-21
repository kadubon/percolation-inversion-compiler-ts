export const claimStatuses = [
  "rejected",
  "expired",
  "diagnostic",
  "relaxed",
  "risk-provisional",
  "speculative",
  "provisional",
  "partial",
  "settled",
] as const;

export type ClaimStatus = (typeof claimStatuses)[number];

const statusRank: Record<ClaimStatus, number> = {
  rejected: 0,
  expired: 1,
  diagnostic: 2,
  relaxed: 3,
  "risk-provisional": 4,
  speculative: 5,
  provisional: 6,
  partial: 6,
  settled: 7,
};

export interface StatusDecision {
  status: ClaimStatus;
  accepted: boolean;
  reasons: string[];
  missing_obligations: string[];
}

export interface StatusRule {
  required_for_settled?: string[];
  required_for_provisional?: string[];
  required_for_speculative?: string[];
  hard_domain_obligations?: string[];
  allow_empty_settled_rule?: boolean;
}

export function rankStatus(status: ClaimStatus): number {
  return statusRank[status];
}

export function noWorseStatus(left: ClaimStatus, right: ClaimStatus): boolean {
  return rankStatus(left) >= rankStatus(right);
}

export function decideStatus(
  rule: StatusRule,
  presentInput: Iterable<string>,
  expiredInput: Iterable<string> = [],
): StatusDecision {
  const present = new Set(presentInput);
  const expired = new Set(expiredInput);
  const missing = (values: Iterable<string>) =>
    [
      ...new Set(
        [...values].filter((item) => !present.has(item) || expired.has(item)),
      ),
    ].sort();

  const hardMissing = missing(rule.hard_domain_obligations ?? []);
  if (hardMissing.length > 0) {
    return {
      status: "rejected",
      accepted: false,
      reasons: ["hard-domain obligation absent or expired"],
      missing_obligations: hardMissing,
    };
  }

  let settledMissing = missing(rule.required_for_settled ?? []);
  if (
    (rule.required_for_settled ?? []).length === 0 &&
    !rule.allow_empty_settled_rule
  ) {
    settledMissing = ["settled-rule:nonempty-obligations"];
  }
  if (settledMissing.length === 0) {
    return {
      status: "settled",
      accepted: true,
      reasons: [],
      missing_obligations: [],
    };
  }

  const provisionalMissing = missing(rule.required_for_provisional ?? []);
  if (provisionalMissing.length === 0) {
    return {
      status: "provisional",
      accepted: true,
      reasons: ["settled obligations missing; no status promotion"],
      missing_obligations: settledMissing,
    };
  }

  const speculativeMissing = missing(rule.required_for_speculative ?? []);
  if (speculativeMissing.length === 0) {
    return {
      status: "speculative",
      accepted: true,
      reasons: ["only speculative transition ledgers are complete"],
      missing_obligations: [
        ...new Set([...settledMissing, ...provisionalMissing]),
      ].sort(),
    };
  }

  return {
    status: "diagnostic",
    accepted: false,
    reasons: [
      "insufficient obligations for settled, provisional, or speculative claim",
    ],
    missing_obligations: [
      ...new Set([
        ...settledMissing,
        ...provisionalMissing,
        ...speculativeMissing,
      ]),
    ].sort(),
  };
}
