import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

type MarkdownLanguage = "en" | "ja";

function lang(language?: string): MarkdownLanguage {
  return language?.toLowerCase().startsWith("ja") ? "ja" : "en";
}

function value(data: Record<string, unknown>, key: string): string {
  const raw = data[key];
  if (raw === undefined || raw === null) {
    return "not-recorded";
  }
  if (typeof raw === "string" || typeof raw === "number") {
    return String(raw);
  }
  if (typeof raw === "boolean") {
    return raw ? "true" : "false";
  }
  return JSON.stringify(raw);
}

function count(data: Record<string, unknown>, key: string): number {
  const raw = data[key];
  if (Array.isArray(raw)) {
    return raw.length;
  }
  if (raw && typeof raw === "object") {
    return Object.keys(raw).length;
  }
  return 0;
}

function boolRows(data: Record<string, unknown>, keys: string[]): string {
  return keys.map((key) => `- \`${key}\`: ${value(data, key)}`).join("\n");
}

function safetyBoundary(language?: string): string {
  if (lang(language) === "ja") {
    return [
      "## 安全境界",
      "",
      "- これは実行権限ではありません。",
      "- 実 ASI、物理結果、外部オラクルの真理を証明しません。",
      "- `settled=false` は未解決の確認事項が見える状態で残ることを意味します。",
      "- packet の内容と `safe_commands` は検査用データであり、自動実行されません。",
    ].join("\n");
  }
  return [
    "## Safety Boundary",
    "",
    "- This is not execution authority.",
    "- This is not proof of real ASI, physical truth, or oracle truth.",
    "- `settled=false` means unresolved obligations remain visible.",
    "- Packet content and `safe_commands` are inspection data, not automatic actions.",
  ].join("\n");
}

export function writeTextOutput(text: string, outputPath?: string): void {
  const finalText = text.endsWith("\n") ? text : `${text}\n`;
  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, finalText, "utf8");
  } else {
    process.stdout.write(finalText);
  }
}

export function renderAdoptionPacketMarkdown(
  data: Record<string, unknown>,
  language?: string,
): string {
  if (lang(language) === "ja") {
    return [
      "# オペレーター採用パケット",
      "",
      "PIC-TS は Node.js で AI agent の出力を JSON として検査し、未解決の確認事項を隠さず残します。",
      "",
      "## 最初のコマンド",
      "",
      "```sh",
      "npm install percolation-inversion-compiler-ts",
      "npx pic-ts agent check --compact",
      "```",
      "",
      "## 状態の読み方",
      "",
      boolRows(data, ["accepted", "workflow_usable", "settled"]),
      "- `residual_ledger`: 残っている確認作業の台帳です。",
      "- `safe_commands`: オペレーターが確認するための候補であり、自動実行権限ではありません。",
      "",
      "## レビューチェック",
      "",
      "- packet を主 workflow の gate として扱わない。",
      "- 未解決 obligation を `settled=true` に昇格しない。",
      "",
      safetyBoundary(language),
    ].join("\n");
  }
  return [
    "# Operator Adoption Packet",
    "",
    "PIC-TS checks AI agent output for Node.js workflows and keeps unfinished verification work visible.",
    "",
    "## First Commands",
    "",
    "```sh",
    "npm install percolation-inversion-compiler-ts",
    "npx pic-ts agent check --compact",
    "```",
    "",
    "## How To Read The Report",
    "",
    boolRows(data, ["accepted", "workflow_usable", "settled"]),
    "- `residual_ledger`: remaining verification work that must stay visible.",
    "- `safe_commands`: inspection hints for an operator, not permission to run actions.",
    "",
    "## Operator Review Checklist",
    "",
    "- Confirm adoption sidecars do not gate the main workflow.",
    "- Confirm unresolved obligations are not promoted to settlement.",
    "",
    safetyBoundary(language),
  ].join("\n");
}

export function renderAdoptionRequestMarkdown(
  data: Record<string, unknown>,
  language?: string,
): string {
  if (lang(language) === "ja") {
    return [
      "# Agent から Operator へのリクエスト",
      "",
      "agent は PIC-TS を見つけましたが、install や tool 実行の権限は operator の確認が必要です。",
      "",
      "## 依頼",
      "",
      "- npm package の採用可否を確認してください。",
      "- 初回確認として `npx pic-ts agent check --compact` を実行してください。",
      "- PIC-TS は action 実行や policy 回避を行いません。",
      "",
      "## 状態",
      "",
      boolRows(data, ["accepted", "workflow_usable", "settled"]),
      "",
      safetyBoundary(language),
    ].join("\n");
  }
  return [
    "# Agent-To-Operator Request",
    "",
    "The agent found PIC-TS, but it does not have install or tool authority by itself.",
    "",
    "## Request",
    "",
    "- Review whether this npm package should be available to the workflow.",
    "- Start with `npx pic-ts agent check --compact`.",
    "- PIC-TS does not execute actions, bypass policy, or grant runtime authority.",
    "",
    "## Status",
    "",
    boolRows(data, ["accepted", "workflow_usable", "settled"]),
    "",
    safetyBoundary(language),
  ].join("\n");
}

export function renderAgentAutonomyAuditMarkdown(
  data: Record<string, unknown>,
  language?: string,
): string {
  const lines =
    lang(language) === "ja"
      ? [
          "# Agent 自律性監査",
          "",
          "この監査は agent workflow の候補状態と残作業を表示します。",
          "",
          "## 状態",
        ]
      : [
          "# Agent Autonomy Audit",
          "",
          "This audit shows candidate workflow status and remaining work for an agent runtime.",
          "",
          "## Status",
        ];
  return [
    ...lines,
    "",
    boolRows(data, [
      "accepted",
      "workflow_usable",
      "operationally_usable",
      "settled",
      "safe_commands_executable_by_pic",
    ]),
    "",
    `- missing obligation count: ${count(data, "missing_obligations")}`,
    `- blocker count: ${count(data, "blockers")}`,
    "",
    safetyBoundary(language),
  ].join("\n");
}

export function renderPhaseBenchmarkSuiteMarkdown(
  data: Record<string, unknown>,
  language?: string,
): string {
  if (lang(language) === "ja") {
    return [
      "# Phase Benchmark Suite",
      "",
      "この benchmark は protocol 内の相対指標です。score は claim の settlement ではありません。",
      "",
      "## Summary",
      "",
      boolRows(data, ["accepted", "workflow_usable", "settled"]),
      `- case count: ${count(data, "cases")}`,
      `- residual count: ${count(data, "residual_summary")}`,
      "",
      safetyBoundary(language),
    ].join("\n");
  }
  return [
    "# Phase Benchmark Suite",
    "",
    "These are protocol-relative metrics. A benchmark score does not settle claims.",
    "",
    "## Summary",
    "",
    boolRows(data, ["accepted", "workflow_usable", "settled"]),
    `- case count: ${count(data, "cases")}`,
    `- residual count: ${count(data, "residual_summary")}`,
    "",
    "False-promotion prevention and residual preservation are diagnostic outputs.",
    "",
    safetyBoundary(language),
  ].join("\n");
}

export function renderPhaseDashboardMarkdown(
  data: Record<string, unknown>,
  language?: string,
): string {
  if (lang(language) === "ja") {
    return [
      "# Phase Dashboard",
      "",
      "dashboard metrics は進行状況の表示であり、settlement や実 ASI の証明ではありません。",
      "",
      "## Counts",
      "",
      `- candidate count: ${value(data, "candidate_count")}`,
      `- accepted count: ${value(data, "accepted_count")}`,
      `- workflow usable count: ${value(data, "workflow_usable_count")}`,
      `- settled count: ${value(data, "settled_count")}`,
      `- residual entries: ${count(data, "residual_summary")}`,
      `- blocker entries: ${count(data, "blockers")}`,
      "",
      safetyBoundary(language),
    ].join("\n");
  }
  return [
    "# Phase Dashboard",
    "",
    "Dashboard metrics show workflow status. They do not imply real ASI or settlement.",
    "",
    "## Counts",
    "",
    `- candidate count: ${value(data, "candidate_count")}`,
    `- accepted count: ${value(data, "accepted_count")}`,
    `- workflow usable count: ${value(data, "workflow_usable_count")}`,
    `- settled count: ${value(data, "settled_count")}`,
    `- residual entries: ${count(data, "residual_summary")}`,
    `- blocker entries: ${count(data, "blockers")}`,
    "",
    safetyBoundary(language),
  ].join("\n");
}

export function renderPhaseObserveMarkdown(
  data: Record<string, unknown>,
  language?: string,
): string {
  if (lang(language) === "ja") {
    return [
      "# Phase Observation",
      "",
      "観測値は candidate 状態と残作業を示します。未解決 work は保持されます。",
      "",
      "## Summary",
      "",
      boolRows(data, ["accepted", "workflow_usable", "settled"]),
      `- observation count: ${count(data, "observations")}`,
      `- blocker count: ${count(data, "blockers")}`,
      "",
      safetyBoundary(language),
    ].join("\n");
  }
  return [
    "# Phase Observation",
    "",
    "Observation output shows candidate status and remaining work. Unresolved work is preserved.",
    "",
    "## Summary",
    "",
    boolRows(data, ["accepted", "workflow_usable", "settled"]),
    `- observation count: ${count(data, "observations")}`,
    `- blocker count: ${count(data, "blockers")}`,
    "",
    safetyBoundary(language),
  ].join("\n");
}
