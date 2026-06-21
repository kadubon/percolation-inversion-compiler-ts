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
const schema = schemaByType("PhaseAccelerationPlan");
const schemaFromSubpath = schemaByTypeSubpath("RuntimeStepReport");
const check = runAgentCheck({}, true);
const message = createAgentMessage({ sender: "agent-a", text: "candidate" });
const packet = packetEnvelopeFromRuntimeReport({
  accepted: true,
  report_id: "installed-smoke-runtime",
  residual_ledger: { coordinates: {} },
  settled: false
});
if (schema.title !== "PhaseAccelerationPlan") throw new Error("schema import failed");
if (schemaFromSubpath.title !== "RuntimeStepReport") throw new Error("schema subpath import failed");
if (check.accepted !== true || check.settled !== false) throw new Error("SDK check failed");
if (!String(message.message_id).startsWith("agent-message:")) throw new Error("agent/messages subpath import failed");
if (packet.settled !== false || packet.workflow_usable !== true) throw new Error("packet subpath import failed");
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
