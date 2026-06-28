"use client";

import { useEffect, useRef, useState } from "react";
import {
  BUILDING_ACCENT_PALETTE,
  paletteIdFromAccentIndex,
  type BuildingAccentId,
} from "@/lib/workspace/building-accent";
import type { InspectorTarget } from "@/lib/workspace/inspector-target";
import {
  connectRegistryIdFromMenuTarget,
  overlayOwnerIdFromMenuTarget,
  type WorkspaceAddMenuActionId,
  type WorkspaceAddMenuTarget,
  workspaceAddMenuOptions,
} from "@/lib/workspace/workspace-add-menu";
import { useWorkspaceLocale } from "./WorkspaceLocaleContext";
import { useWorkspaceOverlayLayer } from "./WorkspaceOverlayContext";
import { InspectorColorPicker } from "./inspector/InspectorColorPicker";
import { ChamberAgentPicker } from "./ChamberAgentPicker";
import type { CatalogModel } from "@/lib/model-catalog/types";
import type { AgentAssignmentRow } from "@/lib/office-types";
import { KNOWLEDGE_FILE_ACCEPT } from "@/lib/knowledge/prepare-knowledge-file";
import { uploadKnowledgeFile } from "@/lib/knowledge/upload-knowledge-file-client";

type WorkspaceAddMenuProps = {
  target: WorkspaceAddMenuTarget | null;
  initialStep?: WorkspaceAddMenuActionId | null;
  onClose: () => void;
  onCreateChamber: (buildingId: string) => Promise<void>;
  onOpenInspector: (target: InspectorTarget) => void;
  onOpenAgentInspector: (assignmentId: string) => void;
  onStartConnect: (registryId: string) => void;
  onAssignmentCreated: (assignment: AgentAssignmentRow) => void;
  onSetBuildingColor: (buildingId: string, paletteId: BuildingAccentId) => Promise<void>;
  onSetChamberColor: (
    buildingId: string,
    chamberId: string,
    registryId: string,
    paletteId: BuildingAccentId,
  ) => Promise<void>;
};

function inspectorTargetFromMenu(target: WorkspaceAddMenuTarget): InspectorTarget | null {
  if (target.kind === "agent") return null;
  if (target.kind === "building") {
    return {
      kind: "building",
      officeId: target.officeId,
      buildingId: target.buildingId,
      label: target.label,
    };
  }
  return {
    kind: "chamber",
    officeId: target.officeId,
    buildingId: target.buildingId,
    chamberId: target.chamberId!,
    registryId: target.registryId!,
    label: target.label,
  };
}

function entityPayload(target: WorkspaceAddMenuTarget): {
  entity_type: string;
  entity_id: string;
} {
  if (target.kind === "building") {
    return { entity_type: "building", entity_id: target.buildingId };
  }
  if (target.kind === "chamber") {
    return { entity_type: "chamber", entity_id: target.registryId };
  }
  return { entity_type: "agent", entity_id: target.agentId };
}

export function WorkspaceAddMenu({
  target,
  initialStep,
  onClose,
  onCreateChamber,
  onOpenInspector,
  onOpenAgentInspector,
  onStartConnect,
  onAssignmentCreated,
  onSetBuildingColor,
  onSetChamberColor,
}: WorkspaceAddMenuProps) {
  const { t } = useWorkspaceLocale();
  const [step, setStep] = useState<WorkspaceAddMenuActionId | "pick">("pick");
  const [selectedColorId, setSelectedColorId] = useState<BuildingAccentId>(
    BUILDING_ACCENT_PALETTE[0].id,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ruleText, setRuleText] = useState("");
  const [knowTitle, setKnowTitle] = useState("");
  const [knowContent, setKnowContent] = useState("");
  const [knowFile, setKnowFile] = useState<File | null>(null);
  const knowFileRef = useRef<HTMLInputElement>(null);
  const [routingText, setRoutingText] = useState("");

  useWorkspaceOverlayLayer(
    target ? overlayOwnerIdFromMenuTarget(target) : undefined,
    Boolean(target),
  );

  useEffect(() => {
    if (!target) return;
    setStep(initialStep ?? "pick");
    setBusy(false);
    setError(null);
    setRuleText("");
    setKnowTitle("");
    setKnowContent("");
    setKnowFile(null);
    if (knowFileRef.current) knowFileRef.current.value = "";
    setRoutingText("");
    if (target?.kind === "building" && target.accentIndex != null) {
      setSelectedColorId(paletteIdFromAccentIndex(target.accentIndex));
    } else if (target?.kind === "chamber" && target.accentIndex != null) {
      setSelectedColorId(paletteIdFromAccentIndex(target.accentIndex));
    }
  }, [target, initialStep]);

  if (!target) return null;

  const options = workspaceAddMenuOptions(target.kind, t, {
    isCityHall: target.kind === "building" ? target.isCityHall : undefined,
  }).filter(
    (opt) => opt.id !== "delete",
  );
  const title =
    target.kind === "building"
      ? `${t.addToBuilding}: «${target.label}»`
      : target.kind === "chamber"
        ? `${t.addToChamber}: «${target.label}»`
        : `${t.addToAgent}: «${target.label}»`;

  async function runChamber() {
    if (target?.kind !== "building") return;
    setBusy(true);
    setError(null);
    try {
      await onCreateChamber(target.buildingId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function runRule() {
    if (!ruleText.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { entity_type, entity_id } = entityPayload(target!);
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type,
          entity_id,
          rule_text: ruleText.trim(),
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Не удалось добавить rule");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function runKnowledge() {
    if (!knowFile) {
      setError("Выберите файл — без него в библиотеку сохранится только описание.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { entity_type, entity_id } = entityPayload(target!);
      const title =
        knowTitle.trim() || knowFile.name.replace(/\.[^.]+$/, "") || knowFile.name;

      await uploadKnowledgeFile({
        file: knowFile,
        entityType: entity_type,
        entityId: entity_id,
        title,
        description: knowContent.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function runRouting() {
    if (target!.kind !== "chamber") return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/offices/${target!.officeId}/buildings/${target!.buildingId}/chambers/${target!.chamberId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ routing_description: routingText.trim() || null }),
        },
      );
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Не удалось сохранить routing");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function assignCatalogModel(model: CatalogModel) {
    if (target?.kind !== "chamber") return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/chambers/${target.chamberId}/assignments/from-catalog`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gateway: model.gateway,
            model_id: model.modelId,
            cost_tier: model.costTier,
            primary_specialization: model.primarySpecialization,
          }),
        },
      );
      const body = (await res.json()) as { assignment?: AgentAssignmentRow; error?: string };
      if (!res.ok || !body.assignment) throw new Error(body.error ?? "Не удалось назначить агента");
      onAssignmentCreated(body.assignment);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ошибка";
      setError(message);
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function runColor() {
    if (target!.kind !== "building" && target!.kind !== "chamber") return;
    setBusy(true);
    setError(null);
    try {
      if (target!.kind === "building") {
        await onSetBuildingColor(target!.buildingId, selectedColorId);
      } else {
        await onSetChamberColor(
          target!.buildingId,
          target!.chamberId,
          target!.registryId,
          selectedColorId,
        );
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  function pickAction(id: WorkspaceAddMenuActionId) {
    if (!target) return;
    if (id === "chamber") {
      void runChamber();
      return;
    }
    if (id === "connect") {
      onStartConnect(connectRegistryIdFromMenuTarget(target));
      onClose();
      return;
    }
    if (id === "inspector") {
      if (target.kind === "agent") {
        onOpenAgentInspector(target.assignmentId);
      } else {
        const inspectorTarget = inspectorTargetFromMenu(target);
        if (inspectorTarget) onOpenInspector(inspectorTarget);
      }
      onClose();
      return;
    }
    if (id === "color") {
      setStep("color");
      return;
    }
    setStep(id);
  }

  return (
    <div
      className="workspace-bubble-overlay workspace-shell"
      data-testid="workspace-add-menu-backdrop"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        data-testid="workspace-add-menu"
        className={`workspace-bubble-sheet ${step === "agent" ? "workspace-bubble-sheet--wide" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="workspace-bubble-sheet__header">
          <div>
            <h3 className="workspace-bubble-sheet__title">{title}</h3>
            <p className="workspace-bubble-sheet__subtitle">
              {step === "pick"
                ? "Выберите, что добавить"
                : step === "color"
                  ? target.kind === "chamber"
                    ? "Выберите цвет отдела"
                    : "Выберите цвет здания"
                  : step === "agent"
                    ? "Выберите модель для нового агента"
                    : "Заполните данные"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="workspace-bubble-sheet__close"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        {error && (
          <p className="workspace-bubble-sheet__error" role="alert">
            {error}
          </p>
        )}

        <div className="workspace-bubble-sheet__body">
          {step === "pick" && (
            <div className="workspace-bubble-option-group">
              {options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`workspace-add-menu-${opt.id}`}
                  disabled={busy}
                  onClick={() => pickAction(opt.id)}
                  className="workspace-bubble-option"
                >
                  <span className="workspace-bubble-option__label">{opt.label}</span>
                  <span className="workspace-bubble-option__hint">{opt.description}</span>
                </button>
              ))}
            </div>
          )}

          {step === "rule" && (
            <>
              <textarea
                value={ruleText}
                onChange={(e) => setRuleText(e.target.value)}
                rows={4}
                placeholder="Текст правила…"
                className="workspace-bubble-textarea"
              />
              <div className="workspace-bubble-actions">
                <button
                  type="button"
                  onClick={() => setStep("pick")}
                  className="workspace-bubble-btn workspace-bubble-btn--ghost"
                >
                  Назад
                </button>
                <button
                  type="button"
                  disabled={busy || !ruleText.trim()}
                  onClick={() => void runRule()}
                  className="workspace-bubble-btn workspace-bubble-btn--primary"
                >
                  {busy ? "…" : "Добавить rule"}
                </button>
              </div>
            </>
          )}

          {step === "knowledge" && (
            <>
              <input
                value={knowTitle}
                onChange={(e) => setKnowTitle(e.target.value)}
                placeholder="Название (необязательно — возьмётся из имени файла)"
                className="workspace-bubble-input"
              />
              <textarea
                value={knowContent}
                onChange={(e) => setKnowContent(e.target.value)}
                rows={3}
                placeholder="Описание для поиска: когда агенту нужен этот файл…"
                className="workspace-bubble-textarea mt-2"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => knowFileRef.current?.click()}
                  className="workspace-bubble-btn workspace-bubble-btn--ghost"
                >
                  {knowFile ? knowFile.name : "Выбрать файл"}
                </button>
                {knowFile && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setKnowFile(null);
                      if (knowFileRef.current) knowFileRef.current.value = "";
                    }}
                    className="workspace-bubble-btn workspace-bubble-btn--ghost"
                  >
                    Убрать
                  </button>
                )}
              </div>
              <input
                ref={knowFileRef}
                type="file"
                accept={KNOWLEDGE_FILE_ACCEPT}
                className="hidden"
                onChange={(e) => setKnowFile(e.target.files?.[0] ?? null)}
              />
              <p className="workspace-inspector-hint mt-2">
                Нужны три слоя: название, описание и файл. Без файла запись не сохранится.
              </p>
              <div className="workspace-bubble-actions">
                <button
                  type="button"
                  onClick={() => setStep("pick")}
                  className="workspace-bubble-btn workspace-bubble-btn--ghost"
                >
                  Назад
                </button>
                <button
                  type="button"
                  disabled={busy || !knowFile}
                  onClick={() => void runKnowledge()}
                  className="workspace-bubble-btn workspace-bubble-btn--primary"
                >
                  {busy ? "…" : "Загрузить файл"}
                </button>
              </div>
            </>
          )}

          {step === "routing" && target.kind === "chamber" && (
            <>
              <textarea
                value={routingText}
                onChange={(e) => setRoutingText(e.target.value)}
                rows={4}
                placeholder="routing_description для маршрутизации задач…"
                className="workspace-bubble-textarea"
              />
              <div className="workspace-bubble-actions">
                <button
                  type="button"
                  onClick={() => setStep("pick")}
                  className="workspace-bubble-btn workspace-bubble-btn--ghost"
                >
                  Назад
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runRouting()}
                  className="workspace-bubble-btn workspace-bubble-btn--primary"
                >
                  {busy ? "…" : "Сохранить routing"}
                </button>
              </div>
            </>
          )}

          {step === "color" &&
            (target.kind === "building" || target.kind === "chamber") && (
            <>
              <InspectorColorPicker
                compact
                testIdPrefix="workspace-add-menu-color"
                selectedColorId={selectedColorId}
                onSelect={setSelectedColorId}
                onApply={() => void runColor()}
                saving={busy}
              />
              <div className="workspace-bubble-actions">
                <button
                  type="button"
                  onClick={() => setStep("pick")}
                  className="workspace-bubble-btn workspace-bubble-btn--ghost"
                >
                  Назад
                </button>
              </div>
            </>
          )}

          {step === "agent" && target.kind === "chamber" && (
            <ChamberAgentPicker
              chamberId={target.chamberId}
              busy={busy}
              onBack={() => setStep("pick")}
              onAssign={assignCatalogModel}
            />
          )}
        </div>
      </div>
    </div>
  );
}
