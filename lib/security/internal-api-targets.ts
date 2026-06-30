/** Whitelisted internal API paths — fixed targets only (no arbitrary URL parameter). */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** X-02: agent context GET */
export function internalAgentContextPath(
  officeId: string,
  agentId: string,
  chamberRegistryId?: string,
): string {
  const params = new URLSearchParams();
  if (chamberRegistryId) {
    params.set("chamberRegistryId", chamberRegistryId);
  }
  const query = params.toString();
  return `/api/offices/${officeId}/agents/${agentId}/context${query ? `?${query}` : ""}`;
}

/** X-03: connection PATCH / DELETE */
export function internalConnectionPath(connectionId: string): string {
  return `/api/connections/${connectionId}`;
}
