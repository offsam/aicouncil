import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Council — Город",
  description: "Строй и управляй городом AI-агентов.",
};

export default function FloorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
