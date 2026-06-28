"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import type { FeedbackOutcome } from "@/lib/office-types";

type FeedbackTarget =
  | { type: "routing"; id: string }
  | { type: "workflow"; id: string };

interface FeedbackBarProps {
  target: FeedbackTarget | null;
  className?: string;
}

export function FeedbackBar({ target, className = "" }: FeedbackBarProps) {
  const [outcome, setOutcome] = useState<FeedbackOutcome | null>(null);
  const [reason, setReason] = useState("");
  const [showReason, setShowReason] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!target) return null;

  async function submit(value: "good" | "bad", reasonText?: string) {
    if (!target || submitting || outcome) return;
    setSubmitting(true);
    setError(null);

    try {
      const url =
        target.type === "routing"
          ? `/api/routing-logs/${target.id}`
          : `/api/workflows/${target.id}`;

      const body: { outcome: string; outcome_reason?: string } = { outcome: value };
      if (target.type === "workflow" && value === "bad" && reasonText?.trim()) {
        body.outcome_reason = reasonText.trim();
      }

      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || "Failed to save feedback");
      }

      setOutcome(value);
      setShowReason(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  if (outcome) {
    return (
      <p className={`text-center text-xs text-theme-muted ${className}`}>
        {outcome === "good" ? "Спасибо за оценку" : "Отзыв сохранён"}
      </p>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <p className="text-xs text-theme-muted">Был ли результат полезен?</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={submitting}
          onClick={() => submit("good")}
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
        >
          <ThumbsUp className="h-4 w-4" />
          Хорошо
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => setShowReason(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
        >
          <ThumbsDown className="h-4 w-4" />
          Плохо
        </button>
      </div>

      {showReason && target.type === "workflow" && (
        <div className="mt-1 flex w-full max-w-md flex-col gap-2">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Что не так? (необязательно)"
            className="rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-primary"
          />
          <button
            type="button"
            disabled={submitting}
            onClick={() => submit("bad", reason)}
            className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/30"
          >
            Отправить
          </button>
        </div>
      )}

      {showReason && target.type === "routing" && (
        <button
          type="button"
          disabled={submitting}
          onClick={() => submit("bad")}
          className="text-xs text-red-300 underline"
        >
          Подтвердить «плохо»
        </button>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
