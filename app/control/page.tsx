"use client";

import { useState } from "react";
import { ControlShell } from "@/components/control/ControlShell";
import type { ExecuteChatTaskResult } from "@/lib/execute-chat-task";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  meta?: string;
};

function formatRoutingMeta(result: ExecuteChatTaskResult): string | undefined {
  if (result.mode === "workflow") {
    const names = result.steps
      .map((s) => s.target_chamber?.name || `шаг ${s.step_order}`)
      .join(" → ");
    return `Workflow (${result.status}): ${names}`;
  }
  const t = result.routing.targets[0];
  const parts = [
    result.routing.method,
    result.targetName || t?.entityRegistryId,
    result.agentName ? `агент: ${result.agentName}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export default function ControlPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskText: text }),
      });
      const data = (await res.json()) as ExecuteChatTaskResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Ошибка чата");

      const answer =
        data.mode === "workflow"
          ? data.answer || "(workflow завершён без текста ответа)"
          : data.answer;

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: answer,
        meta: formatRoutingMeta(data),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (data.mode === "workflow") {
        const stepLines = data.steps
          .map(
            (s) =>
              `${s.step_order}. ${s.target_chamber?.name ?? "?"} — ${s.status}`,
          )
          .join("\n");
        setMessages((prev) => [
          ...prev,
          {
            id: `w-${Date.now()}`,
            role: "assistant",
            text: stepLines || "Шаги workflow недоступны",
            meta: "Шаги workflow",
          },
        ]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
      setError(msg);
      setMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: "assistant", text: `Ошибка: ${msg}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ControlShell title="Чат с мэром">
      <form onSubmit={handleSubmit} className="mb-4 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Задайте вопрос или опишите задачу..."
          className="flex-1 rounded border border-neutral-600 bg-neutral-900 px-3 py-2"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded bg-neutral-200 px-4 py-2 font-medium text-neutral-900 disabled:opacity-50"
        >
          {loading ? "..." : "Отправить"}
        </button>
      </form>

      {error && (
        <p className="mb-3 text-red-400" role="alert">
          {error}
        </p>
      )}

      <ul className="space-y-3">
        {messages.length === 0 && (
          <li className="text-neutral-500">
            История пуста. Напишите вопрос — мэрия маршрутизирует его через
            resolveRoute.
          </li>
        )}
        {messages.map((m) => (
          <li
            key={m.id}
            className={`rounded border p-3 ${
              m.role === "user"
                ? "border-neutral-600 bg-neutral-800"
                : "border-neutral-700 bg-neutral-900"
            }`}
          >
            <div className="mb-1 text-xs text-neutral-400">
              {m.role === "user" ? "Вы" : "Система"}
              {m.meta ? ` · ${m.meta}` : ""}
            </div>
            <div className="whitespace-pre-wrap">{m.text}</div>
          </li>
        ))}
      </ul>
    </ControlShell>
  );
}
