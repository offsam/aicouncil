"use client";

import { WorkspaceEntityCreateSheet } from "./WorkspaceEntityCreateSheet";

type BuildingCreateDialogProps = {
  open: boolean;
  title: string;
  submitLabel: string;
  namePlaceholder: string;
  descriptionPlaceholder: string;
  initialName?: string;
  initialRoutingDescription?: string;
  creating: boolean;
  onCancel: () => void;
  onSubmit: (payload: { name: string; routingDescription: string }) => void;
};

export function BuildingCreateDialog(props: BuildingCreateDialogProps) {
  return (
    <WorkspaceEntityCreateSheet
      {...props}
      testId="workspace-building-create-dialog"
      subtitle="Укажите название и назначение здания — это поможет маршрутизации задач."
      nameLabel="Название здания"
      descriptionLabel="Для чего это здание"
      requireDescription
    />
  );
}
