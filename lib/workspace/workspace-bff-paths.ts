/** Browser-safe BFF paths for workspace UI (no internal secret). */

export function workspaceAgentContextUrl(
  officeId: string,
  agentId: string,
  chamberRegistryId: string,
): string {
  const params = new URLSearchParams({
    officeId,
    agentId,
    chamberRegistryId,
  });
  return `/api/workspace/agent-context?${params.toString()}`;
}

export function workspaceConnectionUrl(connectionId: string): string {
  return `/api/workspace/connections/${connectionId}`;
}
