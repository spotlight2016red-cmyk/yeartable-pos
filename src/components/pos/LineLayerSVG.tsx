"use client";

type Line = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type Props = {
  lines?: Line[];
};

export default function LineLayerSVG({ lines = [] }: Props) {
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width="100%"
      height="100%"
    >
      {lines.map((line) => (
        <line
          key={line.id}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="#444"
          strokeWidth={3}
        />
      ))}
    </svg>
  );
}