"use client";

import dynamic from "next/dynamic";
import { CITY } from "@/lib/city-labels";
import type { OfficeObjectRow, OfficeRow } from "@/lib/office-types";

const FloorScene = dynamic(
  () => import("@/components/floor/FloorScene").then((m) => m.FloorScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-app text-theme-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-300 border-t-teal-600 dark:border-stone-600 dark:border-t-teal-400" />
        <p className="text-sm">{CITY.loading}</p>
        <p className="text-xs text-theme-faint">Первый запуск может занять 15–20 секунд</p>
      </div>
    ),
  },
);

interface FloorPageClientProps {
  officeId: string;
  office: OfficeRow | null;
  initialObjects: OfficeObjectRow[];
  supabaseConfigured: boolean;
}

export function FloorPageClient(props: FloorPageClientProps) {
  return <FloorScene {...props} />;
}
