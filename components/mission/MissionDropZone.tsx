"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, ImageIcon, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface UploadItem {
  id: string;
  file: File;
  kind: "image" | "file";
  previewUrl?: string;
}

interface MissionDropZoneProps {
  question: string;
  onQuestionChange: (value: string) => void;
  uploads: UploadItem[];
  onUploadsChange: (items: UploadItem[]) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

function createId() {
  return Math.random().toString(36).slice(2, 10);
}

export function MissionDropZone({
  question,
  onQuestionChange,
  uploads,
  onUploadsChange,
  onSubmit,
  isSubmitting,
}: MissionDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      const next: UploadItem[] = [...uploads];

      for (const file of list) {
        const isImage = file.type.startsWith("image/");
        const item: UploadItem = {
          id: createId(),
          file,
          kind: isImage ? "image" : "file",
          previewUrl: isImage ? URL.createObjectURL(file) : undefined,
        };
        next.push(item);
      }

      onUploadsChange(next);
    },
    [onUploadsChange, uploads],
  );

  function removeUpload(id: string) {
    const item = uploads.find((u) => u.id === id);
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    onUploadsChange(uploads.filter((u) => u.id !== id));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "relative overflow-hidden rounded-3xl border transition-all theme-panel",
          isDragging && "border-teal-500/45 bg-teal-500/[0.1] dark:bg-teal-500/[0.07]",
        )}
      >
        <div
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer px-6 py-8 md:px-10 md:py-10"
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          <div className="flex flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white/80 dark:border-white/10 dark:bg-white/[0.04]">
              <Upload className="h-5 w-5 text-teal-600 dark:text-teal-300" />
            </div>
            <p className="text-base font-medium text-theme-secondary">
              Drop files here
            </p>
            <p className="mt-1 text-sm text-theme-muted">or click to upload</p>
            <p className="mt-3 text-xs text-theme-faint">
              Images and documents supported
            </p>
          </div>
        </div>

        <AnimatePresence>
          {isDragging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 rounded-3xl ring-2 ring-teal-500/35"
            />
          )}
        </AnimatePresence>
      </div>

      {uploads.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {uploads.map((item) => (
            <div
              key={item.id}
              className="group relative flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white/70 p-2 pr-3 dark:border-white/10 dark:bg-white/[0.03]"
            >
              {item.kind === "image" && item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.previewUrl}
                  alt={item.file.name}
                  className="h-14 w-14 rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-100 dark:bg-white/[0.04]">
                  <FileText className="h-5 w-5 text-theme-muted" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-theme-secondary">
                  {item.file.name}
                </p>
                <p className="flex items-center gap-1 text-[10px] text-theme-faint">
                  {item.kind === "image" ? (
                    <>
                      <ImageIcon className="h-3 w-3" /> Image
                    </>
                  ) : (
                    <>
                      <FileText className="h-3 w-3" /> File
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeUpload(item.id)}
                className="ml-1 rounded-lg p-1 text-theme-muted hover:bg-zinc-100 hover:text-theme-secondary dark:hover:bg-white/5 dark:hover:text-zinc-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="theme-panel rounded-3xl p-4 md:p-5">
        <textarea
          value={question}
          onChange={(e) => onQuestionChange(e.target.value)}
          placeholder="Describe your mission objective…"
          rows={4}
          disabled={isSubmitting}
          className="theme-input w-full resize-none bg-transparent text-sm leading-relaxed focus:outline-none md:text-base"
        />
        <div className="mt-4 flex justify-end">
          <Button size="lg" onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Council in session…" : "Launch analysis"}
          </Button>
        </div>
      </div>
    </div>
  );
}
