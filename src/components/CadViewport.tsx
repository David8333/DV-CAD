import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EyeOff, Info } from 'lucide-react';
import {
  CadEntity,
  CadLayer,
  DraftingSettings,
  GripHandle,
  LineType,
  Point,
  SnapPoint,
  ToolType,
} from '../types/cad';
import {
  angleBetween,
  angleDegrees,
  applyGripMove,
  applyOrthoAndPolar,
  DEG_TO_RAD,
  dist,
  findBestSnapPoint,
  getDimensionLinePoints,
  getEntityBounds,
  getEntityGripHandles,
  getEntitySegments,
  getPolygonVertices,
  isEntityInSelectionBox,
  isPointNearEntity,
  midpoint,
  mirrorEntity,
  offsetEntity,
  RAD_TO_DEG,
  rotateEntity,
  scaleEntity,
  translateEntity,
} from '../utils/geometry';

interface CadViewportProps {
  entities: CadEntity[];
  layers: CadLayer[];
  activeLayerId: string;
  activeTool: ToolType;
  selectedIds: string[];
  settings: DraftingSettings;
  polygonSides: number;
  offsetDistance: number;
  pan: Point;
  zoom: number;
  onPanZoomChange: (pan: Point, zoom: number) => void;
  onCursorMove: (worldPt: Point, snap: SnapPoint | null) => void;
  onSelectChange: (ids: string[]) => void;
  onAddEntity: (entity: CadEntity) => void;
  onUpdateEntities: (updated: CadEntity[]) => void;
  onLogCommand: (
    text: string,
    type?: 'command' | 'info' | 'error' | 'success'
  ) => void;
  onToolComplete: () => void;
  drawingPoints: Point[];
  setDrawingPoints: React.Dispatch<React.SetStateAction<Point[]>>;
  fitTrigger: number;
}

export const CadViewport: React.FC<CadViewportProps> = ({
  entities,
  layers,
  activeLayerId,
  activeTool,
  selectedIds,
  settings,
  polygonSides,
  offsetDistance,
  pan,
  zoom,
  onPanZoomChange,
  onCursorMove,
  onSelectChange,
  onAddEntity,
  onUpdateEntities,
  onLogCommand,
  onToolComplete,
  drawingPoints,
  setDrawingPoints,
  fitTrigger,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [canvasSize, setCanvasSize] = useState({ width: 960, height: 600 });
  const [hasInitialFit, setHasInitialFit] = useState(false);
  const [showGuideBanner, setShowGuideBanner] = useState(true);

  const [mouseScreen, setMouseScreen] = useState<Point>({ x: 480, y: 300 });
  const [cursorWorld, setCursorWorld] = useState<Point>({ x: 0, y: 0 });
  const [activeSnap, setActiveSnap] = useState<SnapPoint | null>(null);
  const [guideAngle, setGuideAngle] = useState<number | null>(null);
  const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null);

  // Panning state
  const [isPanning, setIsPanning] = useState(false);
  const [panStartScreen, setPanStartScreen] = useState<Point>({ x: 0, y: 0 });
  const [panStartOffset, setPanStartOffset] = useState<Point>({ x: 0, y: 0 });
  const [spacePressed, setSpacePressed] = useState(false);

  // Touch pinch-zoom state
  const touchPinchRef = useRef<{
    initialDist: number;
    initialZoom: number;
    initialPan: Point;
    initialMid: Point;
  } | null>(null);

  // Selection box state
  const [selectionBoxStart, setSelectionBoxStart] = useState<Point | null>(null);

  // Grip editing state
  const [activeGrip, setActiveGrip] = useState<GripHandle | null>(null);

  // Dynamic numeric input while drawing
  const [dynValue, setDynValue] = useState<string>('');
  const [dynAngleValue, setDynAngleValue] = useState<string>('');
  const [dynField, setDynField] = useState<'primary' | 'secondary'>('primary');

  // Inline text creation modal state
  const [pendingTextPos, setPendingTextPos] = useState<Point | null>(null);
  const [pendingTextContent, setPendingTextContent] =
    useState<string>('技術標註文字');
  const [pendingTextSize, setPendingTextSize] = useState<number>(12);

  // Last measurement result overlay
  const [measureResult, setMeasureResult] = useState<{
    p1: Point;
    p2: Point;
    distance: number;
    dx: number;
    dy: number;
    angle: number;
  } | null>(null);

  // Coordinate conversions (World +Y is UP, Screen +Y is DOWN)
  const worldToScreen = useCallback(
    (wx: number, wy: number): Point => ({
      x: canvasSize.width / 2 + pan.x + wx * zoom,
      y: canvasSize.height / 2 + pan.y - wy * zoom,
    }),
    [canvasSize.width, canvasSize.height, pan.x, pan.y, zoom]
  );

  const screenToWorld = useCallback(
    (sx: number, sy: number): Point => ({
      x: (sx - canvasSize.width / 2 - pan.x) / zoom,
      y: -(sy - canvasSize.height / 2 - pan.y) / zoom,
    }),
    [canvasSize.width, canvasSize.height, pan.x, pan.y, zoom]
  );

  // Fit drawing to actual measured canvas dimensions so it's 100% visible on any device
  const fitDrawingToViewport = useCallback(
    (w: number, h: number, currentEntities: CadEntity[]) => {
      if (w <= 40 || h <= 40) return;
      if (currentEntities.length === 0) {
        onPanZoomChange({ x: 0, y: 0 }, 1.0);
        return;
      }
      const bounds = currentEntities.map(getEntityBounds);
      const minX = Math.min(...bounds.map((b) => b.minX));
      const maxX = Math.max(...bounds.map((b) => b.maxX));
      const minY = Math.min(...bounds.map((b) => b.minY));
      const maxY = Math.max(...bounds.map((b) => b.maxY));

      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const drawingW = Math.max(80, maxX - minX);
      const drawingH = Math.max(80, maxY - minY);

      const paddingFactor = 0.82;
      const fitZoom = Math.min(
        10,
        Math.max(
          0.18,
          Math.min((w * paddingFactor) / drawingW, (h * paddingFactor) / drawingH)
        )
      );

      onPanZoomChange({ x: -cx * fitZoom, y: cy * fitZoom }, fitZoom);
    },
    [onPanZoomChange]
  );

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          const nw = Math.floor(width);
          const nh = Math.floor(height);
          setCanvasSize({ width: nw, height: nh });
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Perform initial fit once container has real dimensions, or when fitTrigger increments
  useEffect(() => {
    if (canvasSize.width > 100 && canvasSize.height > 100 && !hasInitialFit) {
      fitDrawingToViewport(canvasSize.width, canvasSize.height, entities);
      setHasInitialFit(true);
    }
  }, [
    canvasSize.width,
    canvasSize.height,
    entities,
    fitDrawingToViewport,
    hasInitialFit,
  ]);

  const lastFitTriggerRef = useRef(fitTrigger);
  useEffect(() => {
    if (fitTrigger !== lastFitTriggerRef.current) {
      lastFitTriggerRef.current = fitTrigger;
      fitDrawingToViewport(canvasSize.width, canvasSize.height, entities);
    }
  }, [fitTrigger, canvasSize.width, canvasSize.height, entities, fitDrawingToViewport]);

  // Reset transient states when activeTool changes
  useEffect(() => {
    setDynValue('');
    setDynAngleValue('');
    setDynField('primary');
    setSelectionBoxStart(null);
    setActiveGrip(null);
    if (activeTool !== 'measure') {
      setMeasureResult(null);
    }
  }, [activeTool]);

  // Commit point logic (shared by mouse click, touch tap, and Enter key with Dynamic Input)
  const commitPoint = useCallback(
    (pt: Point) => {
      const activeLayer = layers.find((l) => l.id === activeLayerId);
      if (activeLayer?.locked) {
        onLogCommand(
          `圖層「${activeLayer.name}」已鎖定，無法編輯或繪製。`,
          'error'
        );
        return;
      }

      const id = `ent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      switch (activeTool) {
        case 'line': {
          if (drawingPoints.length === 0) {
            setDrawingPoints([pt]);
            onLogCommand(
              `LINE 指定第一點: (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}) — 請指定下一點或輸入長度`,
              'info'
            );
          } else {
            const prev = drawingPoints[drawingPoints.length - 1];
            if (dist(prev, pt) > 0.01) {
              onAddEntity({
                id,
                type: 'line',
                layerId: activeLayerId,
                p1: prev,
                p2: pt,
              });
              setDrawingPoints([pt]);
              onLogCommand(
                `LINE 線段已建立 (長度 ${dist(prev, pt).toFixed(2)} mm) — 繼續指定下一點，或按 Esc/Enter 結束`,
                'success'
              );
            }
          }
          break;
        }

        case 'polyline': {
          if (drawingPoints.length === 0) {
            setDrawingPoints([pt]);
            onLogCommand(
              `PLINE 指定起點: (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}) — 請指定下一頂點，按 Enter 完成聚合線`,
              'info'
            );
          } else {
            setDrawingPoints((prev) => [...prev, pt]);
            onLogCommand(
              `PLINE 新增頂點 (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`,
              'info'
            );
          }
          break;
        }

        case 'rectangle': {
          if (drawingPoints.length === 0) {
            setDrawingPoints([pt]);
            onLogCommand(
              `RECTANG 指定第一個角點: (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}) — 請指定對角點或輸入寬/高`,
              'info'
            );
          } else {
            const p1 = drawingPoints[0];
            if (Math.abs(pt.x - p1.x) > 0.1 && Math.abs(pt.y - p1.y) > 0.1) {
              onAddEntity({
                id,
                type: 'rectangle',
                layerId: activeLayerId,
                p1,
                p2: pt,
              });
              setDrawingPoints([]);
              onLogCommand(
                `RECTANG 已建立矩形: ${Math.abs(pt.x - p1.x).toFixed(1)} × ${Math.abs(pt.y - p1.y).toFixed(1)} mm`,
                'success'
              );
            }
          }
          break;
        }

        case 'circle': {
          if (drawingPoints.length === 0) {
            setDrawingPoints([pt]);
            onLogCommand(
              `CIRCLE 指定圓心: (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}) — 請指定半徑或直接輸入數值`,
              'info'
            );
          } else {
            const center = drawingPoints[0];
            const r = dist(center, pt);
            if (r > 0.1) {
              onAddEntity({
                id,
                type: 'circle',
                layerId: activeLayerId,
                center,
                radius: r,
              });
              setDrawingPoints([]);
              onLogCommand(
                `CIRCLE 已建立圓形: 半徑 R=${r.toFixed(2)} mm (直徑 Ø=${(r * 2).toFixed(2)} mm)`,
                'success'
              );
            }
          }
          break;
        }

        case 'arc': {
          if (drawingPoints.length === 0) {
            setDrawingPoints([pt]);
            onLogCommand(
              `ARC [圓心-起點-終點] 指定圓弧圓心: (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`,
              'info'
            );
          } else if (drawingPoints.length === 1) {
            setDrawingPoints([drawingPoints[0], pt]);
            onLogCommand(
              `ARC 指定圓弧起點 — 請移動滑鼠指定圓弧終點角度`,
              'info'
            );
          } else {
            const center = drawingPoints[0];
            const startPt = drawingPoints[1];
            const r = dist(center, startPt);
            const startAngle = angleBetween(center, startPt);
            const endAngle = angleBetween(center, pt);
            if (r > 0.1) {
              onAddEntity({
                id,
                type: 'arc',
                layerId: activeLayerId,
                center,
                radius: r,
                startAngle,
                endAngle,
              });
              setDrawingPoints([]);
              onLogCommand(`ARC 已建立圓弧 (R=${r.toFixed(2)} mm)`, 'success');
            }
          }
          break;
        }

        case 'ellipse': {
          if (drawingPoints.length === 0) {
            setDrawingPoints([pt]);
            onLogCommand(
              `ELLIPSE 指定橢圓中心點: (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`,
              'info'
            );
          } else {
            const center = drawingPoints[0];
            const rx = Math.max(2, Math.abs(pt.x - center.x));
            const ry = Math.max(2, Math.abs(pt.y - center.y));
            onAddEntity({
              id,
              type: 'ellipse',
              layerId: activeLayerId,
              center,
              rx,
              ry,
            });
            setDrawingPoints([]);
            onLogCommand(
              `ELLIPSE 已建立橢圓 (Rx=${rx.toFixed(1)}, Ry=${ry.toFixed(1)} mm)`,
              'success'
            );
          }
          break;
        }

        case 'polygon': {
          if (drawingPoints.length === 0) {
            setDrawingPoints([pt]);
            onLogCommand(
              `POLYGON (${polygonSides} 邊形) 指定中心點: (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`,
              'info'
            );
          } else {
            const center = drawingPoints[0];
            const r = dist(center, pt);
            const rot = angleBetween(center, pt);
            if (r > 0.5) {
              onAddEntity({
                id,
                type: 'polygon',
                layerId: activeLayerId,
                center,
                radius: r,
                sides: polygonSides,
                rotation: rot,
              });
              setDrawingPoints([]);
              onLogCommand(
                `POLYGON 已建立正 ${polygonSides} 邊形 (外接圓 R=${r.toFixed(2)} mm)`,
                'success'
              );
            }
          }
          break;
        }

        case 'dimension': {
          if (drawingPoints.length === 0) {
            setDrawingPoints([pt]);
            onLogCommand(
              `DIMLINEAR 指定第一條延伸線原點: (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`,
              'info'
            );
          } else if (drawingPoints.length === 1) {
            setDrawingPoints([drawingPoints[0], pt]);
            onLogCommand(
              `DIMLINEAR 指定第二條延伸線原點 — 請移動決定尺寸線偏移位置`,
              'info'
            );
          } else {
            const p1 = drawingPoints[0];
            const p2 = drawingPoints[1];
            onAddEntity({
              id,
              type: 'dimension',
              layerId: layers.some((l) => l.id === 'DIM')
                ? 'DIM'
                : activeLayerId,
              p1,
              p2,
              offsetPoint: pt,
            });
            setDrawingPoints([]);
            onLogCommand(
              `DIMLINEAR 已標註尺寸: ${dist(p1, p2).toFixed(2)} mm`,
              'success'
            );
          }
          break;
        }

        case 'text': {
          setPendingTextPos(pt);
          break;
        }

        case 'measure': {
          if (drawingPoints.length === 0) {
            setDrawingPoints([pt]);
            setMeasureResult(null);
            onLogCommand(
              `DIST 測量起點: (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}) — 請點選測量終點`,
              'info'
            );
          } else {
            const p1 = drawingPoints[0];
            const d = dist(p1, pt);
            const dx = pt.x - p1.x;
            const dy = pt.y - p1.y;
            const ang = angleDegrees(p1, pt);
            setMeasureResult({ p1, p2: pt, distance: d, dx, dy, angle: ang });
            setDrawingPoints([]);
            onLogCommand(
              `DIST 測量結果: 距離 = ${d.toFixed(2)} mm | ΔX = ${dx.toFixed(2)} mm | ΔY = ${dy.toFixed(2)} mm | 角度 = ${ang.toFixed(2)}°`,
              'success'
            );
          }
          break;
        }

        case 'move': {
          if (selectedIds.length === 0) {
            onLogCommand('MOVE 請先選取要移動的物件。', 'error');
            return;
          }
          if (drawingPoints.length === 0) {
            setDrawingPoints([pt]);
            onLogCommand(
              `MOVE 指定基準點: (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}) — 請指定目標位置點`,
              'info'
            );
          } else {
            const base = drawingPoints[0];
            const dx = pt.x - base.x;
            const dy = pt.y - base.y;
            const updated = entities.map((e) =>
              selectedIds.includes(e.id) ? translateEntity(e, dx, dy) : e
            );
            onUpdateEntities(updated);
            setDrawingPoints([]);
            onToolComplete();
            onLogCommand(
              `MOVE 已移動 ${selectedIds.length} 個物件 (ΔX=${dx.toFixed(1)}, ΔY=${dy.toFixed(1)})`,
              'success'
            );
          }
          break;
        }

        case 'copy': {
          if (selectedIds.length === 0) {
            onLogCommand('COPY 請先選取要複製的物件。', 'error');
            return;
          }
          if (drawingPoints.length === 0) {
            setDrawingPoints([pt]);
            onLogCommand(
              `COPY 指定基準點: (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}) — 點選目標點可連續複製，按 Esc 結束`,
              'info'
            );
          } else {
            const base = drawingPoints[0];
            const dx = pt.x - base.x;
            const dy = pt.y - base.y;
            const copies = entities
              .filter((e) => selectedIds.includes(e.id))
              .map((e, i) => ({
                ...translateEntity(e, dx, dy),
                id: `copy_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`,
              }));
            onUpdateEntities([...entities, ...copies]);
            onLogCommand(
              `COPY 已複製 ${copies.length} 個物件 — 可繼續點選放置下一個副本，或按 Esc 結束`,
              'success'
            );
          }
          break;
        }

        case 'rotate': {
          if (selectedIds.length === 0) {
            onLogCommand('ROTATE 請先選取要旋轉的物件。', 'error');
            return;
          }
          if (drawingPoints.length === 0) {
            setDrawingPoints([pt]);
            onLogCommand(
              `ROTATE 指定旋轉基準點: (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}) — 請指定旋轉角度或拖曳方向`,
              'info'
            );
          } else {
            const pivot = drawingPoints[0];
            const angleRad = angleBetween(pivot, pt);
            const updated = entities.map((e) =>
              selectedIds.includes(e.id) ? rotateEntity(e, pivot, angleRad) : e
            );
            onUpdateEntities(updated);
            setDrawingPoints([]);
            onToolComplete();
            onLogCommand(
              `ROTATE 已旋轉 ${selectedIds.length} 個物件 (${(angleRad * RAD_TO_DEG).toFixed(1)}°)`,
              'success'
            );
          }
          break;
        }

        case 'scale': {
          if (selectedIds.length === 0) {
            onLogCommand('SCALE 請先選取要縮放的物件。', 'error');
            return;
          }
          if (drawingPoints.length === 0) {
            setDrawingPoints([pt]);
            onLogCommand(
              `SCALE 指定縮放基準點: (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}) — 請移動或輸入比例因子`,
              'info'
            );
          } else {
            const base = drawingPoints[0];
            const factor = Math.max(0.1, dist(base, pt) / 100);
            const updated = entities.map((e) =>
              selectedIds.includes(e.id) ? scaleEntity(e, base, factor) : e
            );
            onUpdateEntities(updated);
            setDrawingPoints([]);
            onToolComplete();
            onLogCommand(
              `SCALE 已縮放 ${selectedIds.length} 個物件 (比例 ${factor.toFixed(2)}x)`,
              'success'
            );
          }
          break;
        }

        case 'mirror': {
          if (selectedIds.length === 0) {
            onLogCommand('MIRROR 請先選取要鏡射的物件。', 'error');
            return;
          }
          if (drawingPoints.length === 0) {
            setDrawingPoints([pt]);
            onLogCommand(
              `MIRROR 指定鏡射軸第一點: (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`,
              'info'
            );
          } else {
            const axisA = drawingPoints[0];
            if (dist(axisA, pt) > 0.5) {
              const mirroredCopies = entities
                .filter((e) => selectedIds.includes(e.id))
                .map((e, i) => ({
                  ...mirrorEntity(e, axisA, pt),
                  id: `mir_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`,
                }));
              onUpdateEntities([...entities, ...mirroredCopies]);
              setDrawingPoints([]);
              onToolComplete();
              onLogCommand(
                `MIRROR 已沿鏡射軸建立 ${mirroredCopies.length} 個對稱物件`,
                'success'
              );
            }
          }
          break;
        }

        default:
          break;
      }

      setDynValue('');
      setDynAngleValue('');
      setDynField('primary');
    },
    [
      activeLayerId,
      activeTool,
      drawingPoints,
      entities,
      layers,
      onAddEntity,
      onLogCommand,
      onToolComplete,
      onUpdateEntities,
      polygonSides,
      selectedIds,
      setDrawingPoints,
    ]
  );

  // Keyboard handlers for Spacebar panning, Escape, Enter (finish polyline or commit DYN input), Tab (switch DYN field)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space' && !spacePressed) {
        setSpacePressed(true);
      }

      if (e.key === 'Escape') {
        if (drawingPoints.length > 0) {
          setDrawingPoints([]);
          setDynValue('');
          setDynAngleValue('');
          onLogCommand('已取消目前繪圖步驟 (ESC)', 'info');
        } else if (activeGrip) {
          setActiveGrip(null);
        } else if (selectionBoxStart) {
          setSelectionBoxStart(null);
        } else if (activeTool !== 'select') {
          onToolComplete();
        } else if (selectedIds.length > 0) {
          onSelectChange([]);
        }
        return;
      }

      // Dynamic input numeric typing while drawing
      if (drawingPoints.length > 0 && settings.dynInput) {
        if (e.key === 'Tab') {
          e.preventDefault();
          setDynField((prev) => (prev === 'primary' ? 'secondary' : 'primary'));
          return;
        }
        if (/^[0-9.-]$/.test(e.key)) {
          e.preventDefault();
          if (dynField === 'primary') {
            setDynValue((prev) => prev + e.key);
          } else {
            setDynAngleValue((prev) => prev + e.key);
          }
          return;
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          if (dynField === 'primary') {
            setDynValue((prev) => prev.slice(0, -1));
          } else {
            setDynAngleValue((prev) => prev.slice(0, -1));
          }
          return;
        }
      }

      if (e.key === 'Enter') {
        const anchor = drawingPoints[drawingPoints.length - 1];
        if (anchor && (dynValue.trim() !== '' || dynAngleValue.trim() !== '')) {
          e.preventDefault();
          const val1 = parseFloat(dynValue);
          const val2 = parseFloat(dynAngleValue);

          if (activeTool === 'rectangle' && !isNaN(val1)) {
            const w = val1;
            const h = !isNaN(val2) ? val2 : val1;
            const signX = cursorWorld.x >= anchor.x ? 1 : -1;
            const signY = cursorWorld.y >= anchor.y ? 1 : -1;
            commitPoint({
              x: anchor.x + signX * Math.abs(w),
              y: anchor.y + signY * Math.abs(h),
            });
            return;
          }

          if (activeTool === 'scale' && !isNaN(val1) && val1 > 0) {
            commitPoint({ x: anchor.x + val1 * 100, y: anchor.y });
            return;
          }

          if (!isNaN(val1) && val1 > 0) {
            const currentDeg = angleDegrees(anchor, cursorWorld);
            const targetDeg = !isNaN(val2) ? val2 : currentDeg;
            const rad = targetDeg * DEG_TO_RAD;
            commitPoint({
              x: anchor.x + val1 * Math.cos(rad),
              y: anchor.y + val1 * Math.sin(rad),
            });
            return;
          }
        }

        if (activeTool === 'polyline' && drawingPoints.length >= 2) {
          e.preventDefault();
          onAddEntity({
            id: `pl_${Date.now()}`,
            type: 'polyline',
            layerId: activeLayerId,
            points: drawingPoints,
            closed: false,
          });
          setDrawingPoints([]);
          onLogCommand(
            `PLINE 已完成聚合線 (${drawingPoints.length} 個頂點)`,
            'success'
          );
          return;
        }

        if (activeTool === 'line' && drawingPoints.length > 0) {
          e.preventDefault();
          setDrawingPoints([]);
          onLogCommand('LINE 已結束線段連續繪製', 'info');
          return;
        }
      }

      if (
        (e.key === 'c' || e.key === 'C') &&
        activeTool === 'polyline' &&
        drawingPoints.length >= 3
      ) {
        e.preventDefault();
        onAddEntity({
          id: `pl_${Date.now()}`,
          type: 'polyline',
          layerId: activeLayerId,
          points: drawingPoints,
          closed: true,
        });
        setDrawingPoints([]);
        onLogCommand(
          `PLINE 已建立封閉聚合線 (${drawingPoints.length} 個頂點)`,
          'success'
        );
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
        setIsPanning(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    activeGrip,
    activeLayerId,
    activeTool,
    commitPoint,
    cursorWorld,
    drawingPoints,
    dynAngleValue,
    dynField,
    dynValue,
    onAddEntity,
    onLogCommand,
    onSelectChange,
    onToolComplete,
    selectedIds.length,
    selectionBoxStart,
    setDrawingPoints,
    settings.dynInput,
    spacePressed,
  ]);

  // Update world cursor & snap from screen coordinates
  const updateCursorFromScreen = useCallback(
    (sx: number, sy: number) => {
      setMouseScreen({ x: sx, y: sy });
      const rawWorld = screenToWorld(sx, sy);
      const snap = findBestSnapPoint(
        rawWorld,
        entities,
        layers,
        settings,
        zoom
      );
      setActiveSnap(snap);

      let effectiveWorld = snap ? snap.point : rawWorld;
      const anchor =
        drawingPoints.length > 0
          ? drawingPoints[drawingPoints.length - 1]
          : activeGrip
            ? activeGrip.point
            : null;

      if (!snap || snap.type === 'grid') {
        const { point: lockedPt, guideAngle: gAngle } = applyOrthoAndPolar(
          anchor,
          effectiveWorld,
          settings
        );
        effectiveWorld = lockedPt;
        setGuideAngle(gAngle);
      } else {
        setGuideAngle(null);
      }

      setCursorWorld(effectiveWorld);
      onCursorMove(effectiveWorld, snap);
      return { rawWorld, effectiveWorld };
    },
    [
      activeGrip,
      drawingPoints,
      entities,
      layers,
      onCursorMove,
      screenToWorld,
      settings,
      zoom,
    ]
  );

  // Mouse Move Handler
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (isPanning) {
      setMouseScreen({ x: sx, y: sy });
      const dx = sx - panStartScreen.x;
      const dy = sy - panStartScreen.y;
      onPanZoomChange(
        { x: panStartOffset.x + dx, y: panStartOffset.y + dy },
        zoom
      );
      return;
    }

    const { rawWorld, effectiveWorld } = updateCursorFromScreen(sx, sy);

    if (activeGrip) {
      const updated = entities.map((ent) =>
        ent.id === activeGrip.entityId
          ? applyGripMove(ent, activeGrip.gripIndex, effectiveWorld)
          : ent
      );
      onUpdateEntities(updated);
      return;
    }

    if (activeTool === 'select' || activeTool === 'offset') {
      const visibleLayerIds = new Set(
        layers.filter((l) => l.visible && !l.locked).map((l) => l.id)
      );
      const hitTol = 8 / zoom;
      const hit = [...entities]
        .reverse()
        .find(
          (ent) =>
            visibleLayerIds.has(ent.layerId) &&
            isPointNearEntity(rawWorld, ent, hitTol)
        );
      setHoveredEntityId(hit ? hit.id : null);
    } else {
      setHoveredEntityId(null);
    }
  };

  // Mouse Down Handler
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (e.button === 1 || activeTool === 'pan' || spacePressed) {
      e.preventDefault();
      setIsPanning(true);
      setPanStartScreen({ x: sx, y: sy });
      setPanStartOffset({ ...pan });
      return;
    }

    if (e.button === 2) {
      e.preventDefault();
      if (activeTool === 'polyline' && drawingPoints.length >= 2) {
        onAddEntity({
          id: `pl_${Date.now()}`,
          type: 'polyline',
          layerId: activeLayerId,
          points: drawingPoints,
          closed: false,
        });
        setDrawingPoints([]);
        onLogCommand(
          `PLINE 已完成聚合線 (${drawingPoints.length} 個頂點)`,
          'success'
        );
      } else if (drawingPoints.length > 0) {
        setDrawingPoints([]);
      }
      return;
    }

    if (e.button !== 0) return;

    const { rawWorld, effectiveWorld } = updateCursorFromScreen(sx, sy);

    if (activeTool === 'select') {
      if (selectedIds.length > 0) {
        const gripTol = 11 / zoom;
        for (const ent of entities) {
          if (!selectedIds.includes(ent.id)) continue;
          const grips = getEntityGripHandles(ent);
          const hitGrip = grips.find((g) => dist(rawWorld, g.point) <= gripTol);
          if (hitGrip) {
            setActiveGrip(hitGrip);
            onLogCommand(
              `掣點編輯 (GRIP EDIT): 拖曳控點至新位置後放開完成`,
              'info'
            );
            return;
          }
        }
      }

      if (activeGrip) {
        setActiveGrip(null);
        return;
      }

      if (selectionBoxStart) {
        const isCrossing = rawWorld.x < selectionBoxStart.x;
        const visibleLayerIds = new Set(
          layers.filter((l) => l.visible && !l.locked).map((l) => l.id)
        );
        const boxedIds = entities
          .filter(
            (ent) =>
              visibleLayerIds.has(ent.layerId) &&
              isEntityInSelectionBox(
                ent,
                selectionBoxStart,
                rawWorld,
                isCrossing
              )
          )
          .map((ent) => ent.id);

        if (e.shiftKey) {
          const merged = Array.from(new Set([...selectedIds, ...boxedIds]));
          onSelectChange(merged);
        } else {
          onSelectChange(boxedIds);
        }
        setSelectionBoxStart(null);
        onLogCommand(
          `${isCrossing ? '框選 (Crossing)' : '窗選 (Window)'}: 已選取 ${boxedIds.length} 個物件`,
          'info'
        );
        return;
      }

      const visibleLayerIds = new Set(
        layers.filter((l) => l.visible && !l.locked).map((l) => l.id)
      );
      const hitTol = 10 / zoom;
      const hit = [...entities]
        .reverse()
        .find(
          (ent) =>
            visibleLayerIds.has(ent.layerId) &&
            isPointNearEntity(rawWorld, ent, hitTol)
        );

      if (hit) {
        if (e.shiftKey) {
          if (selectedIds.includes(hit.id)) {
            onSelectChange(selectedIds.filter((id) => id !== hit.id));
          } else {
            onSelectChange([...selectedIds, hit.id]);
          }
        } else {
          onSelectChange([hit.id]);
        }
      } else {
        setSelectionBoxStart(rawWorld);
        if (!e.shiftKey) {
          onSelectChange([]);
        }
      }
      return;
    }

    if (activeTool === 'offset') {
      if (selectedIds.length === 0) {
        const hitTol = 10 / zoom;
        const hit = [...entities]
          .reverse()
          .find((ent) => isPointNearEntity(rawWorld, ent, hitTol));
        if (hit) {
          onSelectChange([hit.id]);
          onLogCommand(
            `OFFSET 已選取物件 (${hit.type.toUpperCase()}) — 請點選要偏移的一側 (偏移距離 = ${offsetDistance} mm)`,
            'info'
          );
        } else {
          onLogCommand(
            'OFFSET 請點選要偏移複製的線段、圓形、矩形或多邊形',
            'info'
          );
        }
      } else {
        const targetEnt = entities.find((ent) => ent.id === selectedIds[0]);
        if (targetEnt) {
          const newEnt = offsetEntity(
            targetEnt,
            effectiveWorld,
            offsetDistance,
            `off_${Date.now()}`
          );
          if (newEnt) {
            onAddEntity(newEnt);
            onSelectChange([newEnt.id]);
            onLogCommand(
              `OFFSET 已建立偏移物件 (距離 ${offsetDistance} mm)`,
              'success'
            );
          } else {
            onLogCommand('OFFSET 偏移距離過大或該物件不支援向內偏移', 'error');
          }
        }
      }
      return;
    }

    commitPoint(effectiveWorld);
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
    }
    if (activeGrip) {
      setActiveGrip(null);
      onLogCommand('掣點編輯已套用', 'success');
    }
  };

  // Touch Handlers for Mobile & Tablet Support
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.touches.length === 2) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const p1 = { x: t1.clientX - rect.left, y: t1.clientY - rect.top };
      const p2 = { x: t2.clientX - rect.left, y: t2.clientY - rect.top };
      touchPinchRef.current = {
        initialDist: Math.max(10, dist(p1, p2)),
        initialZoom: zoom,
        initialPan: { ...pan },
        initialMid: midpoint(p1, p2),
      };
      return;
    }

    if (e.touches.length === 1) {
      const t = e.touches[0];
      const sx = t.clientX - rect.left;
      const sy = t.clientY - rect.top;

      if (activeTool === 'pan') {
        setIsPanning(true);
        setPanStartScreen({ x: sx, y: sy });
        setPanStartOffset({ ...pan });
        return;
      }

      const { rawWorld, effectiveWorld } = updateCursorFromScreen(sx, sy);

      if (activeTool === 'select') {
        const visibleLayerIds = new Set(
          layers.filter((l) => l.visible && !l.locked).map((l) => l.id)
        );
        const hitTol = 16 / zoom;
        const hit = [...entities]
          .reverse()
          .find(
            (ent) =>
              visibleLayerIds.has(ent.layerId) &&
              isPointNearEntity(rawWorld, ent, hitTol)
          );
        if (hit) {
          onSelectChange([hit.id]);
        } else {
          // Single-finger drag on empty canvas in select mode pans on touch devices
          setIsPanning(true);
          setPanStartScreen({ x: sx, y: sy });
          setPanStartOffset({ ...pan });
        }
        return;
      }

      commitPoint(effectiveWorld);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.touches.length === 2 && touchPinchRef.current) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const p1 = { x: t1.clientX - rect.left, y: t1.clientY - rect.top };
      const p2 = { x: t2.clientX - rect.left, y: t2.clientY - rect.top };
      const curDist = Math.max(10, dist(p1, p2));
      const curMid = midpoint(p1, p2);

      const scale = curDist / touchPinchRef.current.initialDist;
      const nextZoom = Math.min(
        25,
        Math.max(0.15, touchPinchRef.current.initialZoom * scale)
      );
      const dx = curMid.x - touchPinchRef.current.initialMid.x;
      const dy = curMid.y - touchPinchRef.current.initialMid.y;

      onPanZoomChange(
        {
          x: touchPinchRef.current.initialPan.x + dx,
          y: touchPinchRef.current.initialPan.y + dy,
        },
        nextZoom
      );
      return;
    }

    if (e.touches.length === 1) {
      const t = e.touches[0];
      const sx = t.clientX - rect.left;
      const sy = t.clientY - rect.top;

      if (isPanning) {
        const dx = sx - panStartScreen.x;
        const dy = sy - panStartScreen.y;
        onPanZoomChange(
          { x: panStartOffset.x + dx, y: panStartOffset.y + dy },
          zoom
        );
        return;
      }

      updateCursorFromScreen(sx, sy);
    }
  };

  const handleTouchEnd = () => {
    touchPinchRef.current = null;
    if (isPanning) {
      setIsPanning(false);
    }
  };

  // Mouse Wheel Zoom (centered at cursor position!)
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const nextZoom = Math.min(25, Math.max(0.15, zoom * zoomFactor));

    const wx = (sx - canvasSize.width / 2 - pan.x) / zoom;
    const wy = -(sy - canvasSize.height / 2 - pan.y) / zoom;

    const nextPanX = sx - canvasSize.width / 2 - wx * nextZoom;
    const nextPanY = sy - canvasSize.height / 2 + wy * nextZoom;

    onPanZoomChange({ x: nextPanX, y: nextPanY }, nextZoom);
  };

  // Main Canvas Rendering Pipeline
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.width * dpr;
    canvas.height = canvasSize.height * dpr;
    ctx.scale(dpr, dpr);

    // 1. Clear CAD background
    ctx.fillStyle = '#090D14';
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

    const applyDash = (lt: LineType) => {
      switch (lt) {
        case 'dashed':
          ctx.setLineDash([8, 5]);
          break;
        case 'center':
          ctx.setLineDash([16, 4, 3, 4]);
          break;
        case 'dotted':
          ctx.setLineDash([2, 4]);
          break;
        default:
          ctx.setLineDash([]);
      }
    };

    // 2. Render Calibrated Coordinate Grid
    if (settings.grid) {
      let minorStep = 10;
      if (zoom < 0.4) minorStep = 50;
      else if (zoom < 0.8) minorStep = 20;
      else if (zoom > 4) minorStep = 5;
      else if (zoom > 10) minorStep = 1;

      const majorStep = minorStep * 5;

      const topLeftWorld = screenToWorld(0, 0);
      const bottomRightWorld = screenToWorld(
        canvasSize.width,
        canvasSize.height
      );

      const startX = Math.floor(topLeftWorld.x / minorStep) * minorStep;
      const endX = Math.ceil(bottomRightWorld.x / minorStep) * minorStep;
      const startY = Math.floor(bottomRightWorld.y / minorStep) * minorStep;
      const endY = Math.ceil(topLeftWorld.y / minorStep) * minorStep;

      ctx.lineWidth = 1;
      ctx.setLineDash([]);

      // Minor grid lines
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
      for (let x = startX; x <= endX; x += minorStep) {
        if (Math.abs(x % majorStep) < 1e-4) continue;
        const sx = Math.round(worldToScreen(x, 0).x) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, canvasSize.height);
      }
      for (let y = startY; y <= endY; y += minorStep) {
        if (Math.abs(y % majorStep) < 1e-4) continue;
        const sy = Math.round(worldToScreen(0, y).y) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(canvasSize.width, sy);
      }
      ctx.stroke();

      // Major grid lines & ruler numbers
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.13)';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.42)';
      ctx.font = '10px "JetBrains Mono", monospace';
      for (
        let x = Math.floor(topLeftWorld.x / majorStep) * majorStep;
        x <= endX;
        x += majorStep
      ) {
        if (Math.abs(x) < 1e-4) continue;
        const sx = Math.round(worldToScreen(x, 0).x) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, canvasSize.height);
        ctx.fillText(`${x}`, sx + 4, 14);
      }
      for (
        let y = Math.floor(bottomRightWorld.y / majorStep) * majorStep;
        y <= endY;
        y += majorStep
      ) {
        if (Math.abs(y) < 1e-4) continue;
        const sy = Math.round(worldToScreen(0, y).y) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(canvasSize.width, sy);
        ctx.fillText(`${y}`, 6, sy - 4);
      }
      ctx.stroke();

      // Origin X (Red) and Y (Green) Axes
      const originScreen = worldToScreen(0, 0);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
      ctx.moveTo(0, originScreen.y);
      ctx.lineTo(canvasSize.width, originScreen.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
      ctx.moveTo(originScreen.x, 0);
      ctx.lineTo(originScreen.x, canvasSize.height);
      ctx.stroke();
    }

    // 3. Helper to render a single CAD Entity
    const layerMap = new Map(layers.map((l) => [l.id, l]));

    const drawEntity = (
      ent: CadEntity,
      overrideColor?: string,
      isSelected = false,
      isHovered = false
    ) => {
      const layer = layerMap.get(ent.layerId);
      if (!layer || !layer.visible) return;

      const color = overrideColor || ent.color || layer.color;
      const lineType = ent.lineType || layer.lineType;
      const rawWeight = ent.lineWeight || layer.lineWeight || 0.25;
      const baseWidth = settings.showLineWeight
        ? Math.max(1.2, rawWeight * 4.5)
        : 1.5;

      ctx.save();
      ctx.strokeStyle = isSelected ? '#38BDF8' : isHovered ? '#7DD3FC' : color;
      ctx.fillStyle = isSelected ? '#38BDF8' : color;
      ctx.lineWidth = isSelected || isHovered ? baseWidth + 1 : baseWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (isSelected) {
        ctx.shadowColor = 'rgba(56, 189, 248, 0.45)';
        ctx.shadowBlur = 6;
      }

      applyDash(lineType);

      switch (ent.type) {
        case 'line': {
          const s1 = worldToScreen(ent.p1.x, ent.p1.y);
          const s2 = worldToScreen(ent.p2.x, ent.p2.y);
          ctx.beginPath();
          ctx.moveTo(s1.x, s1.y);
          ctx.lineTo(s2.x, s2.y);
          ctx.stroke();
          break;
        }
        case 'rectangle':
        case 'polyline':
        case 'polygon': {
          const segs = getEntitySegments(ent);
          if (segs.length > 0) {
            ctx.beginPath();
            for (const [p1, p2] of segs) {
              const s1 = worldToScreen(p1.x, p1.y);
              const s2 = worldToScreen(p2.x, p2.y);
              ctx.moveTo(s1.x, s1.y);
              ctx.lineTo(s2.x, s2.y);
            }
            ctx.stroke();
          }
          break;
        }
        case 'circle': {
          const sc = worldToScreen(ent.center.x, ent.center.y);
          ctx.beginPath();
          ctx.arc(sc.x, sc.y, Math.max(1, ent.radius * zoom), 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'arc': {
          const sc = worldToScreen(ent.center.x, ent.center.y);
          ctx.beginPath();
          ctx.arc(
            sc.x,
            sc.y,
            Math.max(1, ent.radius * zoom),
            -ent.endAngle,
            -ent.startAngle
          );
          ctx.stroke();
          break;
        }
        case 'ellipse': {
          const sc = worldToScreen(ent.center.x, ent.center.y);
          ctx.beginPath();
          ctx.ellipse(
            sc.x,
            sc.y,
            Math.max(1, ent.rx * zoom),
            Math.max(1, ent.ry * zoom),
            0,
            0,
            Math.PI * 2
          );
          ctx.stroke();
          break;
        }
        case 'dimension': {
          ctx.setLineDash([]);
          const { dimP1, dimP2, mid, length } = getDimensionLinePoints(ent);
          const sp1 = worldToScreen(ent.p1.x, ent.p1.y);
          const sp2 = worldToScreen(ent.p2.x, ent.p2.y);
          const sd1 = worldToScreen(dimP1.x, dimP1.y);
          const sd2 = worldToScreen(dimP2.x, dimP2.y);
          const smid = worldToScreen(mid.x, mid.y);

          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.75;
          ctx.beginPath();
          ctx.moveTo(sp1.x, sp1.y);
          ctx.lineTo(sd1.x, sd1.y);
          ctx.moveTo(sp2.x, sp2.y);
          ctx.lineTo(sd2.x, sd2.y);
          ctx.stroke();

          ctx.globalAlpha = 1;
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.moveTo(sd1.x, sd1.y);
          ctx.lineTo(sd2.x, sd2.y);
          ctx.stroke();

          const ang = Math.atan2(sd2.y - sd1.y, sd2.x - sd1.x);
          const arrowLen = Math.min(10, Math.max(5, dist(sd1, sd2) * 0.15));
          const drawArrow = (tip: Point, dirAngle: number) => {
            ctx.beginPath();
            ctx.moveTo(tip.x, tip.y);
            ctx.lineTo(
              tip.x - arrowLen * Math.cos(dirAngle - 0.35),
              tip.y - arrowLen * Math.sin(dirAngle - 0.35)
            );
            ctx.lineTo(
              tip.x - arrowLen * Math.cos(dirAngle + 0.35),
              tip.y - arrowLen * Math.sin(dirAngle + 0.35)
            );
            ctx.closePath();
            ctx.fill();
          };
          drawArrow(sd1, ang + Math.PI);
          drawArrow(sd2, ang);

          const label = ent.textOverride || `${length.toFixed(1)} mm`;
          ctx.font = '600 11px "JetBrains Mono", monospace';
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = '#090D14';
          ctx.fillRect(smid.x - tw / 2 - 4, smid.y - 8, tw + 8, 16);
          ctx.fillStyle = isSelected ? '#38BDF8' : color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, smid.x, smid.y);
          break;
        }
        case 'text': {
          const sp = worldToScreen(ent.position.x, ent.position.y);
          const fontPx = Math.max(9, ent.fontSize * zoom);
          ctx.font = `500 ${fontPx}px "JetBrains Mono", "Plus Jakarta Sans", sans-serif`;
          ctx.textBaseline = 'middle';
          ctx.save();
          ctx.translate(sp.x, sp.y);
          if (ent.rotation) {
            ctx.rotate((-ent.rotation * Math.PI) / 180);
          }
          ctx.fillText(ent.content, 0, 0);
          ctx.restore();
          break;
        }
      }
      ctx.restore();
    };

    for (const ent of entities) {
      const isSelected = selectedIds.includes(ent.id);
      const isHovered = hoveredEntityId === ent.id;
      drawEntity(ent, undefined, isSelected, isHovered);
    }

    // 4. Render Grip Handles for Selected Entities in Select Mode
    if (activeTool === 'select' && selectedIds.length > 0) {
      for (const ent of entities) {
        if (!selectedIds.includes(ent.id)) continue;
        const grips = getEntityGripHandles(ent);
        for (const g of grips) {
          const sg = worldToScreen(g.point.x, g.point.y);
          ctx.save();
          ctx.fillStyle =
            activeGrip &&
            activeGrip.entityId === g.entityId &&
            activeGrip.gripIndex === g.gripIndex
              ? '#EF4444'
              : g.type === 'midpoint'
                ? '#38BDF8'
                : '#0284C7';
          ctx.strokeStyle = '#E0F2FE';
          ctx.lineWidth = 1.2;
          ctx.fillRect(sg.x - 4, sg.y - 4, 8, 8);
          ctx.strokeRect(sg.x - 4, sg.y - 4, 8, 8);
          ctx.restore();
        }
      }
    }

    // 5. Render Polar / Ortho Alignment Guide Line
    if (guideAngle !== null && drawingPoints.length > 0) {
      const anchor = drawingPoints[drawingPoints.length - 1];
      const sa = worldToScreen(anchor.x, anchor.y);
      const rad = -guideAngle * DEG_TO_RAD;
      ctx.save();
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.65)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(sa.x - Math.cos(rad) * 2000, sa.y - Math.sin(rad) * 2000);
      ctx.lineTo(sa.x + Math.cos(rad) * 2000, sa.y + Math.sin(rad) * 2000);
      ctx.stroke();
      ctx.restore();
    }

    // 6. Render Interactive Rubber-Band Preview while Drawing or Modifying
    if (drawingPoints.length > 0) {
      const p0 = drawingPoints[0];
      const pLast = drawingPoints[drawingPoints.length - 1];
      const s0 = worldToScreen(p0.x, p0.y);
      const sLast = worldToScreen(pLast.x, pLast.y);
      const sCur = worldToScreen(cursorWorld.x, cursorWorld.y);

      ctx.save();
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);

      if (activeTool === 'line' || activeTool === 'measure') {
        ctx.beginPath();
        ctx.moveTo(sLast.x, sLast.y);
        ctx.lineTo(sCur.x, sCur.y);
        ctx.stroke();
      } else if (activeTool === 'polyline') {
        ctx.beginPath();
        for (let i = 0; i < drawingPoints.length; i++) {
          const sp = worldToScreen(drawingPoints[i].x, drawingPoints[i].y);
          if (i === 0) ctx.moveTo(sp.x, sp.y);
          else ctx.lineTo(sp.x, sp.y);
        }
        ctx.lineTo(sCur.x, sCur.y);
        ctx.stroke();
      } else if (activeTool === 'rectangle') {
        ctx.beginPath();
        ctx.strokeRect(
          Math.min(s0.x, sCur.x),
          Math.min(s0.y, sCur.y),
          Math.abs(sCur.x - s0.x),
          Math.abs(sCur.y - s0.y)
        );
      } else if (activeTool === 'circle') {
        const rPx = dist(s0, sCur);
        ctx.beginPath();
        ctx.arc(s0.x, s0.y, rPx, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(sCur.x, sCur.y);
        ctx.stroke();
      } else if (activeTool === 'arc') {
        if (drawingPoints.length === 1) {
          ctx.beginPath();
          ctx.moveTo(s0.x, s0.y);
          ctx.lineTo(sCur.x, sCur.y);
          ctx.stroke();
        } else if (drawingPoints.length === 2) {
          const rPx = dist(
            s0,
            worldToScreen(drawingPoints[1].x, drawingPoints[1].y)
          );
          const startAng = angleBetween(p0, drawingPoints[1]);
          const endAng = angleBetween(p0, cursorWorld);
          ctx.beginPath();
          ctx.arc(s0.x, s0.y, rPx, -endAng, -startAng);
          ctx.stroke();
        }
      } else if (activeTool === 'ellipse') {
        const rxPx = Math.max(1, Math.abs(sCur.x - s0.x));
        const ryPx = Math.max(1, Math.abs(sCur.y - s0.y));
        ctx.beginPath();
        ctx.ellipse(s0.x, s0.y, rxPx, ryPx, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (activeTool === 'polygon') {
        const r = dist(p0, cursorWorld);
        const rot = angleBetween(p0, cursorWorld);
        const verts = getPolygonVertices(p0, r, polygonSides, rot);
        ctx.beginPath();
        verts.forEach((v, idx) => {
          const sv = worldToScreen(v.x, v.y);
          if (idx === 0) ctx.moveTo(sv.x, sv.y);
          else ctx.lineTo(sv.x, sv.y);
        });
        ctx.closePath();
        ctx.stroke();
      } else if (activeTool === 'dimension') {
        if (drawingPoints.length === 1) {
          ctx.beginPath();
          ctx.moveTo(s0.x, s0.y);
          ctx.lineTo(sCur.x, sCur.y);
          ctx.stroke();
        } else if (drawingPoints.length === 2) {
          drawEntity(
            {
              id: 'preview-dim',
              type: 'dimension',
              layerId: activeLayerId,
              p1: drawingPoints[0],
              p2: drawingPoints[1],
              offsetPoint: cursorWorld,
            },
            '#FBBF24'
          );
        }
      } else if (activeTool === 'move' || activeTool === 'copy') {
        const dx = cursorWorld.x - p0.x;
        const dy = cursorWorld.y - p0.y;
        ctx.beginPath();
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(sCur.x, sCur.y);
        ctx.stroke();
        for (const ent of entities) {
          if (selectedIds.includes(ent.id)) {
            drawEntity(translateEntity(ent, dx, dy), '#FBBF24');
          }
        }
      } else if (activeTool === 'rotate') {
        const ang = angleBetween(p0, cursorWorld);
        ctx.beginPath();
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(sCur.x, sCur.y);
        ctx.stroke();
        for (const ent of entities) {
          if (selectedIds.includes(ent.id)) {
            drawEntity(rotateEntity(ent, p0, ang), '#FBBF24');
          }
        }
      } else if (activeTool === 'scale') {
        const factor = Math.max(0.1, dist(p0, cursorWorld) / 100);
        ctx.beginPath();
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(sCur.x, sCur.y);
        ctx.stroke();
        for (const ent of entities) {
          if (selectedIds.includes(ent.id)) {
            drawEntity(scaleEntity(ent, p0, factor), '#FBBF24');
          }
        }
      } else if (activeTool === 'mirror') {
        ctx.strokeStyle = '#F43F5E';
        ctx.beginPath();
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(sCur.x, sCur.y);
        ctx.stroke();
        for (const ent of entities) {
          if (selectedIds.includes(ent.id)) {
            drawEntity(mirrorEntity(ent, p0, cursorWorld), '#FBBF24');
          }
        }
      }

      ctx.restore();
    }

    // 7. Render Completed Measure Ruler Overlay
    if (measureResult) {
      const s1 = worldToScreen(measureResult.p1.x, measureResult.p1.y);
      const s2 = worldToScreen(measureResult.p2.x, measureResult.p2.y);
      const smid = midpoint(s1, s2);
      ctx.save();
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();

      const badgeText = `L=${measureResult.distance.toFixed(2)}mm | ∠${measureResult.angle.toFixed(1)}° (ΔX:${measureResult.dx.toFixed(1)}, ΔY:${measureResult.dy.toFixed(1)})`;
      ctx.font = '600 11px "JetBrains Mono", monospace';
      const w = ctx.measureText(badgeText).width + 16;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = '#10B981';
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      ctx.fillRect(smid.x - w / 2, smid.y - 26, w, 22);
      ctx.strokeRect(smid.x - w / 2, smid.y - 26, w, 22);
      ctx.fillStyle = '#34D399';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, smid.x, smid.y - 15);
      ctx.restore();
    }

    // 8. Render Window / Crossing Selection Box
    if (selectionBoxStart) {
      const sStart = worldToScreen(selectionBoxStart.x, selectionBoxStart.y);
      const sEnd = mouseScreen;
      const isCrossing = sEnd.x < sStart.x;

      ctx.save();
      ctx.fillStyle = isCrossing
        ? 'rgba(16, 185, 129, 0.14)'
        : 'rgba(56, 189, 248, 0.14)';
      ctx.strokeStyle = isCrossing ? '#10B981' : '#38BDF8';
      ctx.lineWidth = 1.2;
      if (isCrossing) ctx.setLineDash([6, 4]);
      else ctx.setLineDash([]);

      const rx = Math.min(sStart.x, sEnd.x);
      const ry = Math.min(sStart.y, sEnd.y);
      const rw = Math.abs(sEnd.x - sStart.x);
      const rh = Math.abs(sEnd.y - sStart.y);
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.restore();
    }

    // 9. Render OSNAP Marker
    if (activeSnap && activeSnap.type !== 'grid') {
      const sp = worldToScreen(activeSnap.point.x, activeSnap.point.y);
      ctx.save();
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);

      const sz = 6;
      if (activeSnap.type === 'endpoint') {
        ctx.strokeRect(sp.x - sz, sp.y - sz, sz * 2, sz * 2);
      } else if (activeSnap.type === 'midpoint') {
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y - sz - 1);
        ctx.lineTo(sp.x - sz - 1, sp.y + sz);
        ctx.lineTo(sp.x + sz + 1, sp.y + sz);
        ctx.closePath();
        ctx.stroke();
      } else if (activeSnap.type === 'center') {
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sz, 0, Math.PI * 2);
        ctx.stroke();
      } else if (activeSnap.type === 'quadrant') {
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y - sz - 1);
        ctx.lineTo(sp.x + sz + 1, sp.y);
        ctx.lineTo(sp.x, sp.y + sz + 1);
        ctx.lineTo(sp.x - sz - 1, sp.y);
        ctx.closePath();
        ctx.stroke();
      } else if (activeSnap.type === 'intersection') {
        ctx.beginPath();
        ctx.moveTo(sp.x - sz, sp.y - sz);
        ctx.lineTo(sp.x + sz, sp.y + sz);
        ctx.moveTo(sp.x + sz, sp.y - sz);
        ctx.lineTo(sp.x - sz, sp.y + sz);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 10. Render Authentic AutoCAD UCS Icon (Bottom-Left)
    ctx.save();
    const ucsX = 28;
    const ucsY = canvasSize.height - 28;
    ctx.strokeStyle = '#94A3B8';
    ctx.fillStyle = '#94A3B8';
    ctx.lineWidth = 1.5;
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.beginPath();
    ctx.moveTo(ucsX, ucsY);
    ctx.lineTo(ucsX + 32, ucsY);
    ctx.moveTo(ucsX, ucsY);
    ctx.lineTo(ucsX, ucsY - 32);
    ctx.stroke();
    ctx.strokeRect(ucsX - 3.5, ucsY - 3.5, 7, 7);
    ctx.fillStyle = '#EF4444';
    ctx.fillText('X', ucsX + 36, ucsY + 3);
    ctx.fillStyle = '#10B981';
    ctx.fillText('Y', ucsX - 3, ucsY - 36);
    ctx.restore();

    // 11. Render Full AutoCAD Crosshair Cursor + Pickbox
    if (!isPanning && !spacePressed && activeTool !== 'pan') {
      const cx = mouseScreen.x;
      const cy = mouseScreen.y;
      ctx.save();
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.75)';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      const armLen = 32;
      ctx.beginPath();
      ctx.moveTo(cx - armLen, cy);
      ctx.lineTo(cx + armLen, cy);
      ctx.moveTo(cx, cy - armLen);
      ctx.lineTo(cx, cy + armLen);
      ctx.stroke();

      if (activeTool === 'select' || activeTool === 'offset') {
        ctx.strokeRect(cx - 4, cy - 4, 8, 8);
      }
      ctx.restore();
    }
  }, [
    activeGrip,
    activeLayerId,
    activeSnap,
    activeTool,
    canvasSize.height,
    canvasSize.width,
    cursorWorld,
    drawingPoints,
    entities,
    guideAngle,
    hoveredEntityId,
    isPanning,
    layers,
    measureResult,
    mouseScreen,
    pan,
    polygonSides,
    screenToWorld,
    selectedIds,
    selectionBoxStart,
    settings.grid,
    settings.showLineWeight,
    spacePressed,
    worldToScreen,
    zoom,
  ]);

  const anchorPoint =
    drawingPoints.length > 0 ? drawingPoints[drawingPoints.length - 1] : null;
  const liveDist = anchorPoint ? dist(anchorPoint, cursorWorld) : 0;
  const liveAngle = anchorPoint ? angleDegrees(anchorPoint, cursorWorld) : 0;
  const liveWidth = anchorPoint ? Math.abs(cursorWorld.x - anchorPoint.x) : 0;
  const liveHeight = anchorPoint ? Math.abs(cursorWorld.y - anchorPoint.y) : 0;

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-w-0 min-h-0 h-full overflow-hidden bg-[#090D14] select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        className={`block w-full h-full touch-none ${
          isPanning || spacePressed || activeTool === 'pan'
            ? 'cursor-grab active:cursor-grabbing'
            : 'cursor-none'
        }`}
      />

      {/* Responsive Non-Blocking Active Tool Banner (Can be collapsed anytime) */}
      {showGuideBanner ? (
        <div className="absolute top-2 left-2 right-2 z-20 flex justify-center pointer-events-none">
          <div className="pointer-events-auto max-w-full flex items-center gap-2 px-3 py-1 bg-slate-900/90 border border-slate-700/80 rounded-lg shadow-md text-[11px] sm:text-xs">
            <span className="font-semibold text-sky-300 whitespace-nowrap shrink-0">
              {activeTool === 'select' && '選取模式 (V)'}
              {activeTool === 'pan' && '平移畫布 (H)'}
              {activeTool === 'line' && '畫直線 (L)'}
              {activeTool === 'dimension' && '標註尺寸 (D)'}
              {activeTool === 'polyline' && '聚合線 (P)'}
              {activeTool === 'rectangle' && '畫矩形 (R)'}
              {activeTool === 'circle' && '畫圓形 (C)'}
              {activeTool === 'arc' && '三點圓弧 (A)'}
              {activeTool === 'ellipse' && '畫橢圓 (E)'}
              {activeTool === 'polygon' && `正 ${polygonSides} 邊形 (G)`}
              {activeTool === 'text' && '文字註解 (T)'}
              {activeTool === 'measure' && '測量距離 (K)'}
              {activeTool === 'move' && '移動物件 (M)'}
              {activeTool === 'copy' && '連續複製 (J)'}
              {activeTool === 'rotate' && '旋轉物件 (Q)'}
              {activeTool === 'scale' && '比例縮放 (S)'}
              {activeTool === 'mirror' && '對稱鏡射 (W)'}
              {activeTool === 'offset' && `偏移複製 (O)`}
            </span>
            <span className="text-slate-600 shrink-0">·</span>
            <span className="text-slate-300 truncate">
              {activeTool === 'line' &&
                (drawingPoints.length === 0
                  ? '點選起點（支援自動鎖點）'
                  : '點選終點或直接輸入長度按 Enter（F8 正交鎖定）')}
              {activeTool === 'dimension' &&
                (drawingPoints.length === 0
                  ? '點選第一個標註端點'
                  : drawingPoints.length === 1
                    ? '點選第二個標註端點'
                    : '移動決定標註線高度並點擊完成')}
              {activeTool === 'select' &&
                '點選圖元或拉框選取；按 L 畫直線、D 標註尺寸、B 自動標註'}
              {activeTool !== 'line' &&
                activeTool !== 'dimension' &&
                activeTool !== 'select' &&
                (drawingPoints.length === 0
                  ? '點選基準點開始（Esc 返回）'
                  : '移動指定下一點或輸入數值按 Enter')}
            </span>
            <button
              type="button"
              onClick={() => setShowGuideBanner(false)}
              title="隱藏上方操作提示"
              className="ml-1 p-0.5 text-slate-400 hover:text-slate-200 rounded shrink-0"
            >
              <EyeOff className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowGuideBanner(true)}
          title="顯示操作提示"
          className="absolute top-2 right-2 z-20 p-1.5 bg-slate-900/80 border border-slate-700/80 text-slate-300 hover:text-white rounded-md shadow"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      )}

      {/* OSNAP Tooltip Badge near cursor */}
      {activeSnap && activeSnap.type !== 'grid' && (
        <div
          style={{
            transform: `translate(${Math.min(
              canvasSize.width - 130,
              Math.max(8, mouseScreen.x + 14)
            )}px, ${Math.max(8, mouseScreen.y - 28)}px)`,
          }}
          className="pointer-events-none absolute top-0 left-0 z-20 px-2 py-0.5 text-[11px] font-mono font-medium bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 rounded shadow-sm whitespace-nowrap"
        >
          {activeSnap.label}
        </div>
      )}

      {/* Dynamic Input (DYN - F12) Heads-Up Display next to Crosshair */}
      {settings.dynInput && anchorPoint && (
        <div
          style={{
            transform: `translate(${Math.min(
              Math.max(8, canvasSize.width - 220),
              Math.max(8, mouseScreen.x + 16)
            )}px, ${Math.min(
              Math.max(8, canvasSize.height - 56),
              Math.max(8, mouseScreen.y + 16)
            )}px)`,
          }}
          className="pointer-events-none absolute top-0 left-0 z-20 flex items-center gap-1.5 bg-slate-900/95 border border-sky-500/60 rounded px-2 py-1 shadow-lg font-mono text-xs"
        >
          {activeTool === 'rectangle' ? (
            <>
              <span className="text-slate-400">W:</span>
              <span
                className={`px-1 rounded ${
                  dynField === 'primary'
                    ? 'bg-sky-500/25 text-sky-200 border border-sky-400/50'
                    : 'text-slate-200'
                }`}
              >
                {dynValue !== '' ? dynValue : liveWidth.toFixed(1)}
              </span>
              <span className="text-slate-400">H:</span>
              <span
                className={`px-1 rounded ${
                  dynField === 'secondary'
                    ? 'bg-sky-500/25 text-sky-200 border border-sky-400/50'
                    : 'text-slate-200'
                }`}
              >
                {dynAngleValue !== '' ? dynAngleValue : liveHeight.toFixed(1)}
              </span>
            </>
          ) : (
            <>
              <span className="text-slate-400">
                {activeTool === 'circle' ? 'R:' : 'L:'}
              </span>
              <span
                className={`px-1 rounded ${
                  dynField === 'primary'
                    ? 'bg-sky-500/25 text-sky-200 border border-sky-400/50'
                    : 'text-slate-200'
                }`}
              >
                {dynValue !== '' ? dynValue : liveDist.toFixed(1)} mm
              </span>
              <span className="text-slate-400">∠</span>
              <span
                className={`px-1 rounded ${
                  dynField === 'secondary'
                    ? 'bg-sky-500/25 text-sky-200 border border-sky-400/50'
                    : 'text-slate-200'
                }`}
              >
                {dynAngleValue !== '' ? dynAngleValue : liveAngle.toFixed(1)}°
              </span>
            </>
          )}
        </div>
      )}

      {/* Text Annotation Input Popover */}
      {pendingTextPos && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-lg p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-100 mb-3">
              新增工程文字標註 (TEXT)
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  文字內容
                </label>
                <input
                  type="text"
                  autoFocus
                  value={pendingTextContent}
                  onChange={(e) => setPendingTextContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && pendingTextContent.trim()) {
                      onAddEntity({
                        id: `txt_${Date.now()}`,
                        type: 'text',
                        layerId: activeLayerId,
                        position: pendingTextPos,
                        content: pendingTextContent.trim(),
                        fontSize: pendingTextSize,
                        rotation: 0,
                      });
                      setPendingTextPos(null);
                      onLogCommand(
                        `TEXT 已建立文字標註: "${pendingTextContent.trim()}"`,
                        'success'
                      );
                    } else if (e.key === 'Escape') {
                      setPendingTextPos(null);
                    }
                  }}
                  className="w-full px-3 py-1.5 text-sm bg-slate-950 border border-slate-700 rounded text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-slate-400 mb-1">
                    字高 (mm)
                  </label>
                  <input
                    type="number"
                    min={4}
                    max={100}
                    value={pendingTextSize}
                    onChange={(e) =>
                      setPendingTextSize(Math.max(4, Number(e.target.value)))
                    }
                    className="w-full px-3 py-1.5 text-sm font-mono bg-slate-950 border border-slate-700 rounded text-slate-100 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-slate-400 mb-1">
                    插入座標 (X, Y)
                  </label>
                  <div className="px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded text-slate-400">
                    {pendingTextPos.x.toFixed(1)}, {pendingTextPos.y.toFixed(1)}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPendingTextPos(null)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 rounded hover:bg-slate-700 transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (pendingTextContent.trim()) {
                      onAddEntity({
                        id: `txt_${Date.now()}`,
                        type: 'text',
                        layerId: activeLayerId,
                        position: pendingTextPos,
                        content: pendingTextContent.trim(),
                        fontSize: pendingTextSize,
                        rotation: 0,
                      });
                      setPendingTextPos(null);
                      onLogCommand(
                        `TEXT 已建立文字標註: "${pendingTextContent.trim()}"`,
                        'success'
                      );
                    }
                  }}
                  className="px-4 py-1.5 text-xs font-medium text-white bg-sky-600 rounded hover:bg-sky-500 transition-colors"
                >
                  插入文字
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
