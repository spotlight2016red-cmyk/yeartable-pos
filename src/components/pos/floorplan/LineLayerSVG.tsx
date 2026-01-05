"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { TableConfig } from "@/components/pos/types";
import { generateUUID } from "@/components/pos/utils";

export type DraftLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type EditingLineEndpoint = {
  lineId: string;
  endpoint: "start" | "end";
};

export type LineLayerSVGProps = {
  lines: TableConfig[]; // type === "line" のもののみ（混在でもOK。内部でfilter）
  currentFloor: string;
  isEditMode: boolean;
  selectedLineId: string | null;
  lineStroke: number;
  drawingLine: DraftLine | null;
  editingLineEndpoint: EditingLineEndpoint | null;

  onLineSelect: (lineId: string) => void;
  onLineCreate: (line: TableConfig) => void;
  onLineUpdate: (lineId: string, updates: Partial<TableConfig>) => void;
  onDrawingLineChange: (line: DraftLine | null) => void;
  onEditingLineEndpointChange: (endpoint: EditingLineEndpoint | null) => void;
  onLineDelete?: (lineId: string) => void;

  // 他操作との競合防止
  isResizing: boolean;
  isRotating: boolean;
  isDragging: boolean;
};

export type LineLayerSVGRef = {
  handleLineDrawStart: (e: React.MouseEvent | React.TouchEvent) => void;
  handleLineDrawStartPointer: (e: React.PointerEvent) => void;
  handleLineDraw: (e: React.MouseEvent | React.TouchEvent) => void;
  handleLineDrawEnd: () => void;
  handleLineDrawEndPointer: (e: React.PointerEvent) => void;
  handleLineDrawCancel: () => void;
  handleLineEndpointEdit: (e: React.MouseEvent | React.TouchEvent) => void;
  handleLineEndpointEditEnd: () => void;
  handleLineEndpointEditEndPointer: () => void;
  handleLineHitTest: (
    e: React.MouseEvent | React.TouchEvent,
    container: HTMLElement
  ) => string | null;
};

// 点から線分への最短距離
const pointToLineSegmentDistance = (
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;

  if (len2 === 0) {
    const distX = px - x1;
    const distY = py - y1;
    return Math.sqrt(distX * distX + distY * distY);
  }

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  const nx = x1 + t * dx;
  const ny = y1 + t * dy;

  const distX = px - nx;
  const distY = py - ny;
  return Math.sqrt(distX * distX + distY * distY);
};

const LineLayerSVG = forwardRef<LineLayerSVGRef, LineLayerSVGProps>(
  (
    {
      lines,
      currentFloor,
      isEditMode,
      selectedLineId,
      lineStroke,
      drawingLine,
      editingLineEndpoint,
      onLineSelect,
      onLineCreate,
      onLineUpdate,
      onDrawingLineChange,
      onEditingLineEndpointChange,
      onLineDelete,
      isResizing,
      isRotating,
      isDragging,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    const pointerIdRef = useRef<number | null>(null);
    const capturedElementRef = useRef<HTMLElement | null>(null);

    // grid -> svg percent
    const gridToSvgPercent = (gridValue: number, isX: boolean) => {
      return `${(gridValue / (isX ? 12 : 8)) * 100}%`;
    };

    // client -> grid
    const clientToGrid = (
      clientX: number,
      clientY: number,
      container: HTMLElement
    ): { x: number; y: number } => {
      const rect = container.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 12;
      const y = ((clientY - rect.top) / rect.height) * 8;
      return { x, y };
    };

    // snap
    const snapToGrid = (
      x: number,
      y: number,
      shiftKey: boolean,
      altKey: boolean,
      startX?: number,
      startY?: number
    ): { x: number; y: number } => {
      let sx = Math.max(0, Math.min(11, x));
      let sy = Math.max(0, Math.min(7, y));

      if (!altKey) {
        // グリッドにスナップ
        sx = Math.round(sx);
        sy = Math.round(sy);

        // 角度スナップ（0/45/90）
        if (shiftKey && startX !== undefined && startY !== undefined) {
          const dx = sx - startX;
          const dy = sy - startY;
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

          let snappedAngle = angle;
          if (Math.abs(angle) < 22.5 || Math.abs(angle) > 157.5) snappedAngle = 0;
          else if (Math.abs(angle) > 67.5 && Math.abs(angle) < 112.5) snappedAngle = 90;
          else if (angle > 0) snappedAngle = 45;
          else snappedAngle = -45;

          const dist = Math.sqrt(dx * dx + dy * dy);
          sx = startX + Math.round(Math.cos((snappedAngle * Math.PI) / 180) * dist);
          sy = startY + Math.round(Math.sin((snappedAngle * Math.PI) / 180) * dist);

          sx = Math.max(0, Math.min(11, sx));
          sy = Math.max(0, Math.min(7, sy));
        }
      }

      return { x: sx, y: sy };
    };

    // pointer capture helpers
    const setPointerCaptureOnContainer = (pointerId: number) => {
      const target = containerRef.current;
      if (!target || !target.setPointerCapture) return;
      try {
        target.setPointerCapture(pointerId);
        pointerIdRef.current = pointerId;
        capturedElementRef.current = target;
      } catch {
        // ignore
      }
    };

    const releasePointerCapture = () => {
      if (capturedElementRef.current && pointerIdRef.current !== null) {
        try {
          capturedElementRef.current.releasePointerCapture(pointerIdRef.current);
        } catch {
          // ignore
        }
      }
      capturedElementRef.current = null;
      pointerIdRef.current = null;
    };

    // ========= Drawing (Pointer) =========
    const handleLineDrawStartPointer = (e: React.PointerEvent) => {
      if (!isEditMode) return;
      if (isResizing || isRotating || editingLineEndpoint || isDragging) return;

      const container = containerRef.current;
      if (!container) return;

      e.preventDefault();
      e.stopPropagation();

      const { x, y } = clientToGrid(e.clientX, e.clientY, container);
      const snapped = snapToGrid(x, y, false, false);

      onDrawingLineChange({ x1: snapped.x, y1: snapped.y, x2: snapped.x, y2: snapped.y });
      setPointerCaptureOnContainer(e.pointerId);
    };

    const handleLineDrawEndPointer = (_e: React.PointerEvent) => {
      // pointerup はコンテナで受ける。ここで確定。
      releasePointerCapture();

      if (!isEditMode || !drawingLine) {
        onDrawingLineChange(null);
        return;
      }

      if (drawingLine.x1 === drawingLine.x2 && drawingLine.y1 === drawingLine.y2) {
        onDrawingLineChange(null);
        return;
      }

      const newLine: TableConfig = {
        id: generateUUID(),
        label: "線",
        floorId: currentFloor,
        x: drawingLine.x1,
        y: drawingLine.y1,
        type: "line",
        width: drawingLine.x2,
        height: drawingLine.y2,
        stroke: lineStroke,
      };

      onLineCreate(newLine);
      onDrawingLineChange(null);
    };

    const handleLineDrawCancel = () => {
      releasePointerCapture();
      onDrawingLineChange(null);
      onEditingLineEndpointChange(null);
    };

    // ========= Drawing (Mouse/Touch - backward) =========
    const handleLineDrawStart = (e: React.MouseEvent | React.TouchEvent) => {
      if (!isEditMode) return;
      if (isResizing || isRotating || editingLineEndpoint || isDragging) return;

      const container = containerRef.current;
      if (!container) return;

      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      const { x, y } = clientToGrid(clientX, clientY, container);
      const snapped = snapToGrid(x, y, false, false);

      onDrawingLineChange({ x1: snapped.x, y1: snapped.y, x2: snapped.x, y2: snapped.y });
    };

    const handleLineDraw = (e: React.MouseEvent | React.TouchEvent) => {
      if (!isEditMode) return;
      if (!drawingLine && !editingLineEndpoint) return;

      e.preventDefault();

      const container = containerRef.current;
      if (!container) return;

      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      // drawing
      if (drawingLine) {
        const { x, y } = clientToGrid(clientX, clientY, container);
        const shiftKey = (e as React.MouseEvent).shiftKey || false;
        const altKey = (e as React.MouseEvent).altKey || false;
        const snapped = snapToGrid(x, y, shiftKey, altKey, drawingLine.x1, drawingLine.y1);
        onDrawingLineChange({ ...drawingLine, x2: snapped.x, y2: snapped.y });
        return;
      }

      // endpoint editing
      if (editingLineEndpoint) {
        const line = lines.find((l) => l.id === editingLineEndpoint.lineId);
        if (!line || line.type !== "line") return;

        const { x, y } = clientToGrid(clientX, clientY, container);
        const shiftKey = (e as React.MouseEvent).shiftKey || false;
        const altKey = (e as React.MouseEvent).altKey || false;

        const otherX = editingLineEndpoint.endpoint === "start" ? line.width! : line.x;
        const otherY = editingLineEndpoint.endpoint === "start" ? line.height! : line.y;

        const snapped = snapToGrid(x, y, shiftKey, altKey, otherX, otherY);

        if (editingLineEndpoint.endpoint === "start") {
          onLineUpdate(editingLineEndpoint.lineId, { x: snapped.x, y: snapped.y });
        } else {
          onLineUpdate(editingLineEndpoint.lineId, { width: snapped.x, height: snapped.y });
        }
      }
    };

    const handleLineDrawEnd = () => {
      releasePointerCapture();

      if (!isEditMode || !drawingLine) {
        onDrawingLineChange(null);
        return;
      }

      if (drawingLine.x1 === drawingLine.x2 && drawingLine.y1 === drawingLine.y2) {
        onDrawingLineChange(null);
        return;
      }

      const newLine: TableConfig = {
        id: generateUUID(),
        label: "線",
        floorId: currentFloor,
        x: drawingLine.x1,
        y: drawingLine.y1,
        type: "line",
        width: drawingLine.x2,
        height: drawingLine.y2,
        stroke: lineStroke,
      };

      onLineCreate(newLine);
      onDrawingLineChange(null);
    };

    // ========= Endpoint editing (Pointer) =========
    const handleLineEndpointStartPointer = (
      e: React.PointerEvent,
      lineId: string,
      endpoint: "start" | "end"
    ) => {
      if (!isEditMode) return;

      e.preventDefault();
      e.stopPropagation();

      onEditingLineEndpointChange({ lineId, endpoint });
      setPointerCaptureOnContainer(e.pointerId);
    };

    const handleLineEndpointStart = (
      e: React.MouseEvent | React.TouchEvent,
      lineId: string,
      endpoint: "start" | "end"
    ) => {
      if (!isEditMode) return;
      e.stopPropagation();
      onEditingLineEndpointChange({ lineId, endpoint });
    };

    const handleLineEndpointEdit = (e: React.MouseEvent | React.TouchEvent) => {
      // backward: onMouseMove/onTouchMove で動かす用
      if (!isEditMode || !editingLineEndpoint) return;
      handleLineDraw(e); // 共通処理へ寄せる
    };

    const handleLineEndpointEditEndPointer = () => {
      releasePointerCapture();
      onEditingLineEndpointChange(null);
    };

    const handleLineEndpointEditEnd = () => {
      releasePointerCapture();
      onEditingLineEndpointChange(null);
    };

    // ========= PointerMove on container (core fix) =========
    const handleLinePointerMove = (e: React.PointerEvent) => {
      if (!isEditMode) return;
      if (!drawingLine && !editingLineEndpoint) return;

      e.preventDefault();

      const container = containerRef.current;
      if (!container) return;

      // drawing
      if (drawingLine) {
        const { x, y } = clientToGrid(e.clientX, e.clientY, container);
        const snapped = snapToGrid(x, y, e.shiftKey, e.altKey, drawingLine.x1, drawingLine.y1);
        onDrawingLineChange({ ...drawingLine, x2: snapped.x, y2: snapped.y });
        return;
      }

      // endpoint editing
      if (editingLineEndpoint) {
        const line = lines.find((l) => l.id === editingLineEndpoint.lineId);
        if (!line || line.type !== "line") return;

        const { x, y } = clientToGrid(e.clientX, e.clientY, container);

        const otherX = editingLineEndpoint.endpoint === "start" ? line.width! : line.x;
        const otherY = editingLineEndpoint.endpoint === "start" ? line.height! : line.y;

        const snapped = snapToGrid(x, y, e.shiftKey, e.altKey, otherX, otherY);

        if (editingLineEndpoint.endpoint === "start") {
          onLineUpdate(editingLineEndpoint.lineId, { x: snapped.x, y: snapped.y });
        } else {
          onLineUpdate(editingLineEndpoint.lineId, { width: snapped.x, height: snapped.y });
        }
      }
    };

    // ========= HitTest =========
    const handleLineHitTest = (
      e: React.MouseEvent | React.TouchEvent,
      container: HTMLElement
    ): string | null => {
      if (!isEditMode) return null;

      const rect = container.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      const gridX = ((clientX - rect.left) / rect.width) * 12;
      const gridY = ((clientY - rect.top) / rect.height) * 8;

      const pixelX = (gridX / 12) * rect.width;
      const pixelY = (gridY / 8) * rect.height;

      const floorLines = lines.filter((l) => l.floorId === currentFloor && l.type === "line");

      let closest: string | null = null;
      let minD = Infinity;

      for (const line of floorLines) {
        const x1 = line.x;
        const y1 = line.y;
        const x2 = line.width!;
        const y2 = line.height!;

        const lx1 = (x1 / 12) * rect.width;
        const ly1 = (y1 / 8) * rect.height;
        const lx2 = (x2 / 12) * rect.width;
        const ly2 = (y2 / 8) * rect.height;

        const d = pointToLineSegmentDistance(pixelX, pixelY, lx1, ly1, lx2, ly2);

        // クリックしやすさ（透明当たり判定線に合わせる）
        const threshold = 20;

        if (d <= threshold && d < minD) {
          minD = d;
          closest = line.id;
        }
      }

      return closest;
    };

    useImperativeHandle(ref, () => ({
      handleLineDrawStart,
      handleLineDrawStartPointer,
      handleLineDraw,
      handleLineDrawEnd,
      handleLineDrawEndPointer,
      handleLineDrawCancel,
      handleLineEndpointEdit,
      handleLineEndpointEditEnd,
      handleLineEndpointEditEndPointer,
      handleLineHitTest,
    }));

    useEffect(() => {
      return () => {
        releasePointerCapture();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const floorLines = lines.filter((l) => l.floorId === currentFloor && l.type === "line");

    return (
      <div
        ref={containerRef}
        className="absolute inset-0"
        // ここで “線からカーソルが離れても” 安定して追従させる
        onPointerMove={handleLinePointerMove}
        onPointerUp={handleLineDrawEndPointer}
        onPointerCancel={handleLineDrawCancel}
      >
        <svg
          ref={svgRef}
          className="absolute inset-0"
          style={{ zIndex: 5, pointerEvents: "auto" }}
        >
          {/* 確定済みの線 */}
          {floorLines.map((line) => {
            const isSelected = selectedLineId === line.id;
            const stroke = line.stroke || 2;

            const x1 = line.x;
            const y1 = line.y;
            const x2 = line.width!;
            const y2 = line.height!;

            return (
              <g key={line.id}>
                {/* 透明の太い当たり判定線 */}
                <line
                  x1={gridToSvgPercent(x1, true)}
                  y1={gridToSvgPercent(y1, false)}
                  x2={gridToSvgPercent(x2, true)}
                  y2={gridToSvgPercent(y2, false)}
                  stroke="transparent"
                  strokeWidth="24"
                  style={{ pointerEvents: "stroke" }}
                  className="cursor-pointer"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isEditMode) return;
                    onLineSelect(line.id);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isEditMode) return;
                    onLineSelect(line.id);
                  }}
                />

                {/* 表示用の線 */}
                <line
                  x1={gridToSvgPercent(x1, true)}
                  y1={gridToSvgPercent(y1, false)}
                  x2={gridToSvgPercent(x2, true)}
                  y2={gridToSvgPercent(y2, false)}
                  stroke={isSelected ? "#3b82f6" : "#374151"}
                  strokeWidth={stroke}
                  style={{ pointerEvents: "none" }}
                />

                {/* 端点ハンドル（選択時のみ） */}
                {isSelected && (
                  <>
                    <circle
                      cx={gridToSvgPercent(x1, true)}
                      cy={gridToSvgPercent(y1, false)}
                      r="8"
                      fill="#3b82f6"
                      stroke="white"
                      strokeWidth="2"
                      style={{ pointerEvents: "auto" }}
                      className="cursor-grab active:cursor-grabbing"
                      onPointerDown={(e) => handleLineEndpointStartPointer(e, line.id, "start")}
                      onMouseDown={(e) => handleLineEndpointStart(e, line.id, "start")}
                      onTouchStart={(e) => handleLineEndpointStart(e, line.id, "start")}
                    />
                    <circle
                      cx={gridToSvgPercent(x2, true)}
                      cy={gridToSvgPercent(y2, false)}
                      r="8"
                      fill="#3b82f6"
                      stroke="white"
                      strokeWidth="2"
                      style={{ pointerEvents: "auto" }}
                      className="cursor-grab active:cursor-grabbing"
                      onPointerDown={(e) => handleLineEndpointStartPointer(e, line.id, "end")}
                      onMouseDown={(e) => handleLineEndpointStart(e, line.id, "end")}
                      onTouchStart={(e) => handleLineEndpointStart(e, line.id, "end")}
                    />
                  </>
                )}
              </g>
            );
          })}

          {/* 描画中の線（プレビュー） */}
          {drawingLine && (
            <line
              x1={gridToSvgPercent(drawingLine.x1, true)}
              y1={gridToSvgPercent(drawingLine.y1, false)}
              x2={gridToSvgPercent(drawingLine.x2, true)}
              y2={gridToSvgPercent(drawingLine.y2, false)}
              stroke="#3b82f6"
              strokeWidth={lineStroke}
              strokeDasharray="4 4"
              style={{ pointerEvents: "none" }}
            />
          )}
        </svg>

        {/* フローティング削除ボタン（選択時のみ） */}
        {isEditMode && selectedLineId && onLineDelete && (
          <div
            className="absolute z-50"
            style={{
              left: "50%",
              top: "-50px",
              transform: "translateX(-50%)",
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                const line = floorLines.find((l) => l.id === selectedLineId);
                if (line && confirm("線を削除しますか？")) {
                  onLineDelete(selectedLineId);
                }
              }}
              className="flex items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition-all hover:bg-red-600 active:scale-95"
              title="削除"
              style={{
                minWidth: "44px",
                minHeight: "44px",
                width: "44px",
                height: "44px",
                padding: "8px",
              }}
            >
              <span className="text-2xl font-bold leading-none">×</span>
            </button>
          </div>
        )}
      </div>
    );
  }
);

LineLayerSVG.displayName = "LineLayerSVG";
export default LineLayerSVG;
