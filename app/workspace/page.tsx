import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import {
  requireExternalEntryOfficeId,
  requireTechDepartmentBuildingId,
} from "@/lib/workspace/graph-identity-required";
import { parseExecutionModeFromWorkspaceMeta } from "@/lib/workspace/execution-mode-tiers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export default async function WorkspacePage() {
  const officeId = await requireExternalEntryOfficeId();
  const techDepartmentBuildingId = await requireTechDepartmentBuildingId(officeId);

  const supabase = getSupabaseAdmin();
  const { data: officeRow } = await supabase
    .from("offices")
    .select("workspace_meta")
    .eq("id", officeId)
    .maybeSingle();
  const initialExecutionMode = parseExecutionModeFromWorkspaceMeta(officeRow?.workspace_meta);

  return (
    <WorkspaceShell
      officeId={officeId}
      techDepartmentBuildingId={techDepartmentBuildingId}
      initialExecutionMode={initialExecutionMode}
    />
  );
}
