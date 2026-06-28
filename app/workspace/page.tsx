import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import {
  requireExternalEntryOfficeId,
  requireTechDepartmentBuildingId,
} from "@/lib/workspace/graph-identity-required";

export default async function WorkspacePage() {
  const officeId = await requireExternalEntryOfficeId();
  const techDepartmentBuildingId = await requireTechDepartmentBuildingId(officeId);

  return (
    <WorkspaceShell officeId={officeId} techDepartmentBuildingId={techDepartmentBuildingId} />
  );
}
