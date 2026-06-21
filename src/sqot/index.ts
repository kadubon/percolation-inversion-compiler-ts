import { fixtureJson } from "../io/fixtures.js";

export function buildSalienceSchedule(
  profile = "production",
): Record<string, unknown> {
  const report = structuredClone(fixtureJson("salience_schedule_report.json"));
  report.profile = profile;
  report.accepted = true;
  report.operationally_usable = true;
  report.settled = false;
  return report;
}
