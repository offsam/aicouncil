"use client";

import type { ScreenRect } from "@/lib/marquee-select";

interface MarqueeOverlayProps {
  rect: ScreenRect | null;
}

export function MarqueeOverlay({ rect }: MarqueeOverlayProps) {
  if (!rect) return null;

  const x1 = Math.min(rect.x1, rect.x2);
  const y1 = Math.min(rect.y1, rect.y2);
  const w = Math.abs(rect.x2 - rect.x1);
  const h = Math.abs(rect.y2 - rect.y1);

  if (w < 2 && h < 2) return null;

  return (
    <div
      className="pointer-events-none fixed z-20 border border-teal-400/80 bg-teal-400/15"
      style={{ left: x1, top: y1, width: w, height: h }}
    />
  );
}
