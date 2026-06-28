"use client";

import { WorkspaceEntityCreateSheet } from "./WorkspaceEntityCreateSheet";

type ChamberCreateDialogProps = {
  open: boolean;
  title: string;
  submitLabel: string;
  namePlaceholder: string;
  descriptionPlaceholder: string;
  creating: boolean;
  onCancel: () => void;
  onSubmit: (payload: { name: string; routingDescription: string }) => void;
};

export function ChamberCreateDialog(props: ChamberCreateDialogProps) {
  return (
    <WorkspaceEntityCreateSheet
      {...props}
      testId="workspace-chamber-create-dialog"
      subtitle="Название обязательно. Описание можно добавить сразу или позже в инспекторе."
      nameLabel="Название отдела"
      descriptionLabel="Чем занимается отдел"
    />
  );
}
