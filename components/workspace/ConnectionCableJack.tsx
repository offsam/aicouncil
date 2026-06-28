"use client";

import type { HandleFlowAnchor } from "@/lib/workspace/connection-handle-flow-coords";

type ConnectionCableJackProps = {
  anchor: HandleFlowAnchor;
  stroke: string;
  outerStroke: string;
  strokeWidth: number;
  variant: "source" | "target";
};

/** SVG jack housing where the cable meets the building port. */
export function ConnectionCableJack({
  anchor,
  stroke,
  outerStroke,
  strokeWidth,
  variant,
}: ConnectionCableJackProps) {
  const { x, y, side, outwardX, outwardY } = anchor;
  const isHoriz = side === "left" || side === "right";
  const housingW = isHoriz ? 11 : 17;
  const housingH = isHoriz ? 17 : 11;
  const angle = (Math.atan2(outwardY, outwardX) * 180) / Math.PI;

  const ferruleLen = 6;
  const ferruleX = outwardX * (housingW / 2 + 1);
  const ferruleY = outwardY * (housingH / 2 + 1);

  const glow = variant === "target" ? "#2dd4bf" : "#38bdf8";
  const housingFill = variant === "target" ? "#042f2e" : "#0f172a";

  return (
    <g
      className="workspace-cable-jack pointer-events-none"
      transform={`translate(${x}, ${y}) rotate(${angle})`}
      data-testid={`workspace-cable-jack-${variant}`}
    >
      <rect
        x={-housingW / 2 - (isHoriz ? 2 : 0)}
        y={-housingH / 2 - (!isHoriz ? 2 : 0)}
        width={housingW + (isHoriz ? 4 : 0)}
        height={housingH + (!isHoriz ? 4 : 0)}
        rx={2}
        fill="#020617"
        stroke={outerStroke}
        strokeWidth={strokeWidth + 3}
        opacity={0.95}
      />
      <rect
        x={-housingW / 2}
        y={-housingH / 2}
        width={housingW}
        height={housingH}
        rx={2}
        fill={housingFill}
        stroke={stroke}
        strokeWidth={1.2}
      />
      <rect
        x={-housingW / 2 + 2}
        y={-housingH / 2 + 2}
        width={housingW - 4}
        height={housingH - 4}
        rx={1}
        fill="#020617"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={0.5}
      />
      <rect
        x={ferruleX - (isHoriz ? 0 : 2)}
        y={ferruleY - (!isHoriz ? 0 : 2)}
        width={isHoriz ? ferruleLen : 4}
        height={isHoriz ? 4 : ferruleLen}
        rx={1}
        fill={glow}
        stroke={stroke}
        strokeWidth={0.6}
        opacity={0.95}
      />
      <circle
        cx={ferruleX + outwardX * (ferruleLen * 0.5)}
        cy={ferruleY + outwardY * (ferruleLen * 0.5)}
        r={strokeWidth * 0.55}
        fill={glow}
        opacity={0.9}
      />
    </g>
  );
}
