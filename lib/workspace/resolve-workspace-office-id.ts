import { resolveExternalEntryOfficeId } from "./graph-identity";
import { requireExternalEntryOfficeId } from "./graph-identity-required";

/** Resolve office for workspace/server paths — explicit param wins, else graph external_entry. */
export async function resolveWorkspaceOfficeId(explicit?: string | null): Promise<string | null> {
  if (explicit?.trim()) return explicit.trim();
  const resolved = await resolveExternalEntryOfficeId();
  return resolved.value;
}

/** Production invariant — throws when graph external_entry office is not configured. */
export async function requireWorkspaceOfficeId(explicit?: string | null): Promise<string> {
  if (explicit?.trim()) return explicit.trim();
  return requireExternalEntryOfficeId();
}
