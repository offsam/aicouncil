import type { ExecutionMode } from "@/lib/execution-mode";

/** Last participation run — used by Context Preview to pin chamber context. */
export type LastParticipationExecution = {
  mode: ExecutionMode;
  chamberRegistryId: string;
  agentRegistryIds: string[];
  taskText: string;
  at: string;
};
