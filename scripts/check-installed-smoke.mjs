import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = new URL("..", import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  "$1",
);
const node = process.execPath;
const npmCli = process.env.npm_execpath;
const tmp = mkdtempSync(join(tmpdir(), "pic-ts-installed-"));

function runNpm(args, options = {}) {
  if (npmCli) {
    return execFileSync(node, [npmCli, ...args], options);
  }
  return execFileSync("npm", args, { ...options, shell: true });
}

function runPackageBin(name, args) {
  return runNpm(["exec", "--", name, ...args], {
    cwd: tmp,
    encoding: "utf8",
  });
}

const packJson = runNpm(
  ["pack", "--json", "--ignore-scripts", "--pack-destination", tmp],
  { cwd: root, encoding: "utf8" },
);
const pack = JSON.parse(packJson)[0];
const tarball = join(tmp, pack.filename);

runNpm(["init", "-y"], { cwd: tmp, stdio: "ignore" });
runNpm(["install", tarball, "--ignore-scripts"], {
  cwd: tmp,
  stdio: "ignore",
});

const importCheck = `
import { schemaByType, runAgentCheck } from "percolation-inversion-compiler-ts";
import { schemaByType as schemaByTypeSubpath } from "percolation-inversion-compiler-ts/schema";
import { createAgentMessage } from "percolation-inversion-compiler-ts/agent/messages";
import { packetEnvelopeFromRuntimeReport } from "percolation-inversion-compiler-ts/packet";
import { buildEffectivePacketGraph } from "percolation-inversion-compiler-ts/phase-lab";
import { diagnoseBottlenecks } from "percolation-inversion-compiler-ts/bit-engine";
import { diagnoseQueueOccupation } from "percolation-inversion-compiler-ts/sqot-controller";
import { verifyAltEcptLift } from "percolation-inversion-compiler-ts/alt-lift";
import { adaptToolTrace } from "percolation-inversion-compiler-ts/trc-adapter";
const schema = schemaByType("PhaseAccelerationPlan");
const schemaFromSubpath = schemaByTypeSubpath("RuntimeStepReport");
const graphSchema = schemaByType("EffectivePacketGraph");
const check = runAgentCheck({}, true);
const message = createAgentMessage({ sender: "agent-a", text: "candidate" });
const packet = packetEnvelopeFromRuntimeReport({
  accepted: true,
  report_id: "installed-smoke-runtime",
  residual_ledger: { coordinates: {} },
  settled: false
});
const graph = buildEffectivePacketGraph([{ accepted: true, report_id: "sdk-smoke", settled: false }]);
const bit = diagnoseBottlenecks(graph);
const sqot = diagnoseQueueOccupation(graph);
const alt = verifyAltEcptLift([{ accepted: true, positive_ecpt_component_lift: true }], graph);
const trc = adaptToolTrace({ tool_calls: [{ name: "npm install inert-data-only" }] });
if (schema.title !== "PhaseAccelerationPlan") throw new Error("schema import failed");
if (schemaFromSubpath.title !== "RuntimeStepReport") throw new Error("schema subpath import failed");
if (graphSchema.title !== "EffectivePacketGraph") throw new Error("v0.5.0 schema import failed");
if (check.accepted !== true || check.settled !== false) throw new Error("SDK check failed");
if (!String(message.message_id).startsWith("agent-message:")) throw new Error("agent/messages subpath import failed");
if (packet.settled !== false || packet.workflow_usable !== true) throw new Error("packet subpath import failed");
if (graph.settled !== false || bit.settled !== false || sqot.settled !== false) throw new Error("v0.5.0 SDK non-promotion failed");
if (alt.settled !== false || trc.execution_authority_granted !== false) throw new Error("v0.5.0 SDK safety boundary failed");
`;
writeFileSync(join(tmp, "check.mjs"), importCheck, "utf8");
execFileSync(node, ["check.mjs"], { cwd: tmp, stdio: "inherit" });

const pkgRoot = join(tmp, "node_modules", "percolation-inversion-compiler-ts");
const demoDir = join(tmp, ".pic-demo");
const schemaOut = runPackageBin("pic-ts", [
  "schema",
  "--type",
  "PhaseAccelerationPlan",
]);
if (JSON.parse(schemaOut).title !== "PhaseAccelerationPlan") {
  throw new Error("installed CLI schema command failed");
}
const graphSchemaOut = runPackageBin("pic-ts", [
  "schema",
  "--type",
  "EffectivePacketGraph",
]);
if (JSON.parse(graphSchemaOut).title !== "EffectivePacketGraph") {
  throw new Error("installed CLI v0.5.0 schema command failed");
}
const agentOut = runPackageBin("pic", ["agent", "check", "--compact"]);
const agent = JSON.parse(agentOut);
if (agent.accepted !== true || agent.settled !== false) {
  throw new Error("installed CLI agent check failed");
}
const smokeOut = runPackageBin("pic-ts", ["demo", "installed-smoke"]);
if (JSON.parse(smokeOut).settled !== false) {
  throw new Error("installed CLI demo smoke failed");
}
const bootstrapOut = runPackageBin("pic-ts", [
  "demo",
  "bootstrap",
  "--output-dir",
  demoDir,
  "--overwrite",
]);
const bootstrap = JSON.parse(bootstrapOut);
if (bootstrap.accepted !== true || bootstrap.settled !== false) {
  throw new Error("installed CLI demo bootstrap failed");
}
const runtimeOut = runPackageBin("pic-ts", [
  "runtime",
  "step",
  "--state",
  join(demoDir, "runtime_state.json"),
  "--input",
  join(demoDir, "runtime_step_input.json"),
]);
const runtime = JSON.parse(runtimeOut);
if (runtime.accepted !== true || runtime.settled !== false) {
  throw new Error("installed CLI runtime step failed");
}
const generatedRuntimePath = join(tmp, "runtime_step_report.generated.json");
writeFileSync(generatedRuntimePath, JSON.stringify(runtime, null, 2), "utf8");
const portabilityOut = runPackageBin("pic-ts", [
  "portability",
  "verify",
  "--manifest",
  join(pkgRoot, "fixtures", "portability_conformance", "manifest.json"),
]);
const portability = JSON.parse(portabilityOut);
if (portability.accepted !== true || portability.settled !== false) {
  throw new Error("installed CLI portability verify failed");
}
const portabilityV050Out = runPackageBin("pic-ts", [
  "portability",
  "verify",
  "--manifest",
  join(pkgRoot, "fixtures", "portability_conformance_v050", "manifest.json"),
]);
const portabilityV050 = JSON.parse(portabilityV050Out);
if (portabilityV050.accepted !== true || portabilityV050.settled !== false) {
  throw new Error("installed CLI v0.5.0 portability verify failed");
}
const packetOut = runPackageBin("pic-ts", [
  "packet",
  "export",
  "--report",
  generatedRuntimePath,
]);
const packet = JSON.parse(packetOut);
if (packet.accepted !== true || packet.settled !== false) {
  throw new Error("installed CLI packet export failed");
}
const packetPath = join(tmp, "packet.json");
writeFileSync(packetPath, JSON.stringify(packet, null, 2), "utf8");
const packetInspectOut = runPackageBin("pic-ts", [
  "packet",
  "inspect",
  "--packet",
  packetPath,
]);
const packetInspect = JSON.parse(packetInspectOut);
if (
  packetInspect.executed_command_count !== 0 ||
  packetInspect.settled !== false
) {
  throw new Error("installed CLI packet inspect failed");
}
const phasePlanOut = runPackageBin("pic-ts", [
  "phase",
  "plan",
  "--request",
  join(demoDir, "asi_proxy_phase_request.json"),
  "--compact",
]);
const phasePlan = JSON.parse(phasePlanOut);
if (
  phasePlan.request_id !== "asi-proxy-node-only-loop" ||
  phasePlan.settled !== false ||
  !phasePlan.candidate_only_reasons?.includes(
    "candidate-only external volume cannot reduce phase gaps",
  )
) {
  throw new Error("installed CLI phase plan request failed");
}
const phaseGapOut = runPackageBin("pic-ts", [
  "phase",
  "gap",
  "--request",
  join(demoDir, "asi_proxy_phase_request.json"),
  "--compact",
]);
const phaseGap = JSON.parse(phaseGapOut);
if (!phaseGap.components || typeof phaseGap.components !== "object") {
  throw new Error("installed CLI phase gap request failed");
}
const accelerateOut = runPackageBin("pic-ts", [
  "agent",
  "accelerate",
  "--compact",
  "--text",
  "Candidate-packet-preserve-residuals",
  "--profile",
  "development",
]);
const accelerate = JSON.parse(accelerateOut);
if (accelerate.accepted !== true || accelerate.settled !== false) {
  throw new Error("installed CLI agent accelerate failed");
}
const phaseLabStore = join(tmp, "phase-lab-store");
const phaseReport = join(
  pkgRoot,
  "examples",
  "phase_lab",
  "runtime_report_1.json",
);
const phaseReport2 = join(
  pkgRoot,
  "examples",
  "phase_lab",
  "runtime_report_2.json",
);
const phaseThreshold = join(
  pkgRoot,
  "examples",
  "thresholds",
  "asi_proxy_development.json",
);
const phaseLabInit = JSON.parse(
  runPackageBin("pic-ts", [
    "phase",
    "lab",
    "init",
    "--output-dir",
    phaseLabStore,
  ]),
);
if (phaseLabInit.settled !== false) {
  throw new Error("installed CLI phase lab init failed");
}
const phaseLabIngest = JSON.parse(
  runPackageBin("pic-ts", [
    "phase",
    "lab",
    "ingest",
    "--store",
    phaseLabStore,
    "--report",
    phaseReport,
  ]),
);
if (phaseLabIngest.accepted !== true || phaseLabIngest.settled !== false) {
  throw new Error("installed CLI phase lab ingest failed");
}
const phaseLabIngest2 = JSON.parse(
  runPackageBin("pic-ts", [
    "phase",
    "lab",
    "ingest",
    "--store",
    phaseLabStore,
    "--report",
    phaseReport2,
  ]),
);
if (phaseLabIngest2.accepted !== true || phaseLabIngest2.settled !== false) {
  throw new Error("installed CLI phase lab second ingest failed");
}
const phaseLabWindows = JSON.parse(
  runPackageBin("pic-ts", [
    "phase",
    "lab",
    "list-windows",
    "--store",
    phaseLabStore,
  ]),
);
if (
  !Array.isArray(phaseLabWindows.windows) ||
  phaseLabWindows.windows.length < 2
) {
  throw new Error("installed CLI phase lab list-windows failed");
}
const phaseLabGraph = JSON.parse(
  runPackageBin("pic-ts", ["phase", "lab", "graph", "--store", phaseLabStore]),
);
if (phaseLabGraph.settled !== false || !Array.isArray(phaseLabGraph.nodes)) {
  throw new Error("installed CLI phase lab graph failed");
}
const phaseLabObserve = JSON.parse(
  runPackageBin("pic-ts", [
    "phase",
    "lab",
    "observe",
    "--store",
    phaseLabStore,
  ]),
);
if (
  phaseLabObserve.protocol_relative_only !== true ||
  phaseLabObserve.proves_real_asi !== false ||
  phaseLabObserve.settled !== false
) {
  throw new Error("installed CLI phase lab observe failed");
}
const phaseLabClosure = JSON.parse(
  runPackageBin("pic-ts", [
    "phase",
    "lab",
    "closure",
    "--store",
    phaseLabStore,
  ]),
);
if (phaseLabClosure.settled !== false) {
  throw new Error("installed CLI phase lab closure failed");
}
const phaseLabPaths = JSON.parse(
  runPackageBin("pic-ts", [
    "phase",
    "lab",
    "executable-paths",
    "--store",
    phaseLabStore,
  ]),
);
if (
  phaseLabPaths.execution_authority_granted !== false ||
  phaseLabPaths.executed_path_count !== 0 ||
  phaseLabPaths.settled !== false
) {
  throw new Error("installed CLI phase lab executable paths failed");
}
const phaseLabThresholdStatus = JSON.parse(
  runPackageBin("pic-ts", [
    "phase",
    "lab",
    "threshold-status",
    "--store",
    phaseLabStore,
    "--threshold",
    phaseThreshold,
  ]),
);
if (
  phaseLabThresholdStatus.settled !== false ||
  phaseLabThresholdStatus.protocol_relative_only !== true ||
  phaseLabThresholdStatus.real_asi_proof !== false
) {
  throw new Error("installed CLI phase lab threshold-status failed");
}
const phaseLabCertify = JSON.parse(
  runPackageBin("pic-ts", [
    "phase",
    "lab",
    "certify",
    "--store",
    phaseLabStore,
    "--threshold",
    phaseThreshold,
  ]),
);
if (phaseLabCertify.settled !== false) {
  throw new Error("installed CLI phase lab certify failed");
}
const phaseLabCompare = JSON.parse(
  runPackageBin("pic-ts", [
    "phase",
    "lab",
    "compare-window",
    "--store",
    phaseLabStore,
    "--baseline",
    "previous",
    "--candidate",
    "latest",
  ]),
);
if (phaseLabCompare.settled !== false) {
  throw new Error("installed CLI phase lab compare-window failed");
}
const graphFixture = join(
  pkgRoot,
  "examples",
  "phase_lab",
  "effective_graph.example.json",
);
const bitOut = JSON.parse(
  runPackageBin("pic-ts", ["bit", "diagnose", "--graph", graphFixture]),
);
if (bitOut.settled !== false) {
  throw new Error("installed CLI bit diagnose failed");
}
const bottlenecksPath = join(tmp, "bottlenecks.json");
writeFileSync(bottlenecksPath, JSON.stringify(bitOut, null, 2), "utf8");
const bitInvert = JSON.parse(
  runPackageBin("pic-ts", ["bit", "invert", "--bottlenecks", bottlenecksPath]),
);
if (bitInvert.settled !== false) {
  throw new Error("installed CLI bit invert failed");
}
const inversionsPath = join(tmp, "inversions.json");
writeFileSync(inversionsPath, JSON.stringify(bitInvert, null, 2), "utf8");
const bitCertificate = JSON.parse(
  runPackageBin("pic-ts", [
    "bit",
    "certificate",
    "--candidate",
    inversionsPath,
  ]),
);
if (bitCertificate.settled !== false) {
  throw new Error("installed CLI bit certificate failed");
}
const bitMec = JSON.parse(
  runPackageBin("pic-ts", [
    "bit",
    "mec",
    "--bottlenecks",
    bottlenecksPath,
    "--bottleneck",
    "bottleneck:missing",
  ]),
);
if (!Array.isArray(bitMec.minimal_enabling_conditions)) {
  throw new Error("installed CLI bit mec failed");
}
const bitCompare = JSON.parse(
  runPackageBin("pic-ts", [
    "bit",
    "compare-baseline",
    "--baseline",
    join(
      pkgRoot,
      "examples",
      "phase_lab",
      "phase_window_observation.example.json",
    ),
    "--candidate",
    join(
      pkgRoot,
      "examples",
      "phase_lab",
      "phase_window_observation.example.json",
    ),
  ]),
);
if (bitCompare.settled !== false) {
  throw new Error("installed CLI bit compare-baseline failed");
}
const sqotOut = JSON.parse(
  runPackageBin("pic-ts", ["sqot", "diagnose-queue", "--graph", graphFixture]),
);
if (sqotOut.settled !== false) {
  throw new Error("installed CLI sqot diagnose-queue failed");
}
for (const command of [
  "salience-obstruction",
  "rebalance",
  "quarantine",
  "reserve-check",
]) {
  const data = JSON.parse(
    runPackageBin("pic-ts", ["sqot", command, "--graph", graphFixture]),
  );
  if (data.settled !== false) {
    throw new Error(`installed CLI sqot ${command} failed`);
  }
}
const altOut = JSON.parse(
  runPackageBin("pic-ts", [
    "alt",
    "ecpt-lift",
    "--packets",
    join(pkgRoot, "examples", "alt_lift", "alt_ecpt_lift.example.json"),
    "--graph",
    graphFixture,
  ]),
);
if (altOut.settled !== false) {
  throw new Error("installed CLI alt ecpt-lift failed");
}
const packetFixture = join(
  pkgRoot,
  "examples",
  "packet_exchange",
  "packet_envelope.example.json",
);
for (const args of [
  [
    "alt",
    "receiver-lift",
    "--packet",
    packetFixture,
    "--receiver-context",
    packetFixture,
  ],
  [
    "alt",
    "liquidity-to-paths",
    "--packet",
    packetFixture,
    "--graph",
    graphFixture,
  ],
  [
    "alt",
    "capital-impact",
    "--reports",
    join(pkgRoot, "examples", "alt_lift", "alt_ecpt_lift.example.json"),
  ],
]) {
  const data = JSON.parse(runPackageBin("pic-ts", args));
  if (data.settled !== false) {
    throw new Error(`installed CLI ${args.slice(0, 2).join(" ")} failed`);
  }
}
const trcOut = JSON.parse(
  runPackageBin("pic-ts", [
    "trc",
    "trace-adapter",
    "--input",
    join(pkgRoot, "examples", "trc_adapter", "tool_trace_input.example.json"),
  ]),
);
if (trcOut.execution_authority_granted !== false || trcOut.settled !== false) {
  throw new Error("installed CLI trc trace-adapter failed");
}
for (const args of [
  [
    "trc",
    "tool-trace",
    "--events",
    join(pkgRoot, "examples", "trc_adapter", "tool_trace_input.example.json"),
  ],
  [
    "trc",
    "action-boundary",
    "--report",
    join(pkgRoot, "fixtures", "python_v044_demo", "runtime_step_report.json"),
  ],
]) {
  const data = JSON.parse(runPackageBin("pic-ts", args));
  if (
    data.executed_action_count !== 0 ||
    data.execution_authority_granted !== false ||
    data.settled !== false
  ) {
    throw new Error(`installed CLI ${args.slice(0, 2).join(" ")} failed`);
  }
}

console.log(
  JSON.stringify(
    {
      installed_smoke: true,
      package: readFileSync(join(root, "package.json"), "utf8").match(
        /"name": "([^"]+)"/,
      )?.[1],
    },
    null,
    2,
  ),
);
