import { validateByType } from "./schema.js";

function nonEmptyStringArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.some((item) => typeof item === "string" && item.length > 0)
  );
}

export function runtimeIdentityContextAccepted(
  data: Record<string, unknown>,
): boolean {
  return (
    validateByType(data, "RuntimeIdentityContext").valid &&
    data.accepted === true &&
    nonEmptyStringArray(data.accepted_agent_ids) &&
    nonEmptyStringArray(data.accepted_public_key_ids)
  );
}
