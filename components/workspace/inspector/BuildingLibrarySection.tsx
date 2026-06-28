"use client";

import { useState } from "react";
import type { KnowledgeEntry } from "@/lib/workspace/load-inspector-data";
import { ChamberResourceCenterModal } from "./ChamberResourceCenterModal";
import { KnowledgeLibraryBrowse } from "./KnowledgeLibraryBrowse";

type BuildingLibrarySectionProps = {
  entries: KnowledgeEntry[];
};

export function BuildingLibrarySection({ entries }: BuildingLibrarySectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="workspace-inspector-label mb-1.5 font-medium">Материалы здания</div>
      <button
        type="button"
        role="tab"
        data-testid="workspace-building-tab-library"
        onClick={() => setOpen(true)}
        className="workspace-inspector-resource-chip"
      >
        <span className="workspace-inspector-resource-chip__label">Библиотека</span>
        <span className="workspace-inspector-resource-chip__count">{entries.length}</span>
      </button>

      <ChamberResourceCenterModal
        open={open}
        testId="workspace-building-library-modal"
        title="Библиотека здания"
        subtitle="Только просмотр и скачивание материалов этого здания"
        wide
        onClose={() => setOpen(false)}
        footer={
          <div className="workspace-bubble-actions">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="workspace-bubble-btn workspace-bubble-btn--primary"
            >
              Закрыть
            </button>
          </div>
        }
      >
        <KnowledgeLibraryBrowse entries={entries} readOnly />
      </ChamberResourceCenterModal>
    </>
  );
}
