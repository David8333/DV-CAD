import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  EyeOff,
  Info,
  Combine,
  Scissors,
  Trash2,
  AlignCenterHorizontal,
} from 'lucide-react';
import {
  ArcEntity,
  CadEntity,
  CadLayer,
  CircleEntity,
  DimensionEntity,
  DraftingSettings,
  GripHandle,
  HatchMode,
  LineType,
  Point,
  RectangleMode,
  SnapPoint,
  ToolType,
} from '../types/cad';
import {
  angleBetween,
  angleDegrees,
  applyGripMove,
  applyOrthoAndPolar,
  arcFromThreePoints,
  computeChamferResult,
  computeExtendResult,
  computeFilletResult,
  computeMutualExtendResult,
  computeTrimResult,
  createHatchFromEntities,
  createRadiusDimensionForArc,
  DEG_TO_RAD,
  dist,
  findBestSnapPoint,
  findConnectedEntityIds,
  findSmartHatchBoundaryAtPoint,
  formatDimensionLabel,
  getArcThreePoints,
  getDimensionLinePoints,
  getEntityBounds,
  getEntityGripHandles,
  getEntitySegments,
  getHatchSegments,
  getPolygonVertices,
  getSelectionReferencePoint,
  isEntityInSelectionBox,
  isPointNearEntity,
  midpoint,
  mirrorEntity,
  offsetEntity,
  offsetSelectedEntities,
  RAD_TO_DEG,
  rotateEntity,
  snapDimensionOffsetToExisting,
  translateEntity,
} from '../utils/geometry';

interface CadViewportProps {
  entities: CadEntity[];
  layers: CadLayer[];
  activeLayerId: string;
  activeTool: ToolType;
  rectangleMode: RectangleMode;
  onChangeRectangleMode: (mode: RectangleMode) => void;
  defaultDimFontSize: number;
  onChangeDefaultDimFontSize: (size: number) => void;
  selectedIds: string[];
  settings: DraftingSettings;
  polygonSides: number;
  offsetDistance: number;
  onChangeOffsetDistance: (dist: number) => void;
  hatchPitch: number;
  onChangeHatchPitch: (pitch: number) => void;
  hatchMode: HatchMode;
  onChangeHatchMode: (mode: HatchMode) => void;
  chamferDistance: number;
  onChangeChamferDistance: (dist: number) => void;
  filletRadius: number;
  onChangeFilletRadius: (radius: number) => void;
  filletAutoDim: boolean;
  onChangeFilletAutoDim: (autoDim: boolean) => void;
  pan: Point;
  zoom: number;
  onPanZoomChange: (pan: Point, zoom: number) => void;
  onCursorMove: (worldPt: Point, snap: SnapPoint | null) => void;
  onSelectChange: (ids: string[]) => void;
  onAddEntity: (entity: CadEntity) => void;
  onUpdateEntities: (updated: CadEntity[]) => void;
  onJoinSelected: () => void;
  onExplodeSelected: () => void;
  onDeleteSelected: () => void;
  onAlignDimensions: () => void;
  onHatchSelected: () => void;
  onLogCommand: (
    text: string,
    type?: 'command' | 'info' | 'error' | 'success'
  ) => void;
  onToolComplete: () => void;
  drawingPoints: Point[];
  setDrawingPoints: React.Dispatch<React.SetStateAction<Point[]>>;
  fitTrigger: number;
  jumpToOriginTrigger: number;
  copySourceEntities?: CadEntity[];
  onPdfWindowSelected?: (bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }) => void;
}

export const CadViewport: React.FC<CadViewportProps> = ({
  entities,
  layers,
  activeLayerId,
  activeTool,
  rectangleMode,
  onChangeRectangleMode,
  defaultDimFontSize,
  onChangeDefaultDimFontSize,
  selectedIds,
  settings,
  polygonSides,
  offsetDistance,
  onChangeOffsetDistance,
  hatchPitch,
  onChangeHatchPitch,
  hatchMode,
  onChangeHatchMode,
  chamferDistance,
  onChangeChamferDistance,
  filletRadius,
  onChangeFilletRadius,
  filletAutoDim,
  onChangeFilletAutoDim,
  pan,
  zoom,
  onPanZoomChange,
  onCursorMove,
  onSelectChange,
  onAddEntity,
  onUpdateEntities,
  onJoinSelected,
  onExplodeSelected,
  onDeleteSelected,
  onAlignDimensions,
  onHatchSelected,
  onLogCommand,
  onToolComplete,
  drawingPoints,
  setDrawingPoints,
  fitTrigger,
  jumpToOriginTrigger,
  copySourceEntities = [],
  onPdfWindowSelected,
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
  const [dimAlignGuide, setDimAlignGuide] = useState<[Point, Point] | null>(
    null
  );
  const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null);

  // Two-line mutual extend state (點選兩個線段互相延伸)
  const [extendFirstPick, setExtendFirstPick] = useState<{
    entityId: string;
    clickPt: Point;
  } | null>(null);

  // Two-edge Chamfer (倒角) / Fillet (導圓角) first pick state
  const [cornerFirstPick, setCornerFirstPick] = useState<{
    entityId: string;
    clickPt: Point;
  } | null>(null);

  // Interactive Radius Dimension placement state when clicking an Arc / Fillet Arc
  const [pendingRadiusDimArc, setPendingRadiusDimArc] = useState<
    ArcEntity | CircleEntity | null
  >(null);

  // Resolve A-WALL (建築主牆/輪廓) layer ID for section hatches
  const wallLayerId =
    layers.find(
      (l) =>
        l.id === 'WALL' ||
        l.name.includes('建築主牆') ||
        l.name.includes('輪廓')
    )?.id || 'WALL';

  // Pinned to Origin (0,0) state when user presses JO
  const [cursorPinnedToOrigin, setCursorPinnedToOrigin] =
    useState<boolean>(false);
  const pinScreenAnchorRef = useRef<Point | null>(null);

  // Panning state
  const [isPanning, setIsPanning] = useState(false);
  const [panStartScreen, setPanStartScreen] = useState<Point>({ x: 0, y: 0 });
  const [panStartOffset, setPanStartOffset] = useState<Point>({ x: 0, y: 0 });

  // Touch pinch-zoom state
  const touchPinchRef = useRef<{
    initialDist: number;
    initialZoom: number;
    initialPan: Point;
    initialMid: Point;
  } | null>(null);

  // Selection box state
  const [selectionBoxStart, setSelectionBoxStart] = useState<Point | null>(null);

  // Grip editing & entity dragging state (buffered in local preview to prevent history/state thrashing crash)
  const [activeGrip, setActiveGrip] = useState<GripHandle | null>(null);
  const [activeEntityDrag, setActiveEntityDrag] = useState<{
    startWorld: Point;
    currentWorld: Point;
    initialEntities: CadEntity[];
  } | null>(null);
  const [dragPreviewEntities, setDragPreviewEntities] = useState<
    CadEntity[] | null
  >(null);
  const dragPreviewRef = useRef<CadEntity[] | null>(null);

  // Move X,Y coordinate jump input state in banner
  const [moveTargetInputX, setMoveTargetInputX] = useState<string>('0');
  const [moveTargetInputY, setMoveTargetInputY] = useState<string>('0');

  // Dynamic numeric input while drawing, moving, or offsetting
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

  // Fit drawing to actual measured canvas dimensions
  const fitDrawingToViewport = useCallback(
    (w: number, h: number, currentEntities: CadEntity[]) => {
      if (w <= 40 || h <= 40) return;
      const validBounds = currentEntities
        .map(getEntityBounds)
        .filter(
          (b): b is NonNullable<typeof b> =>
            Boolean(b && Number.isFinite(b.minX) && Number.isFinite(b.maxX))
        );
      if (validBounds.length === 0) {
        onPanZoomChange({ x: 0, y: 0 }, 1.0);
        return;
      }
      const minX = Math.min(...validBounds.map((b) => b.minX));
      const maxX = Math.max(...validBounds.map((b) => b.maxX));
      const minY = Math.min(...validBounds.map((b) => b.minY));
      const maxY = Math.max(...validBounds.map((b) => b.maxY));

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
          setCanvasSize({
            width: Math.floor(width),
            height: Math.floor(height),
          });
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
  }, [
    fitTrigger,
    canvasSize.width,
    canvasSize.height,
    entities,
    fitDrawingToViewport,
  ]);

  // Handle JO shortcut: Jump cursor directly to Origin (0, 0)
  const lastJumpOriginRef = useRef(jumpToOriginTrigger);
  useEffect(() => {
    if (jumpToOriginTrigger !== lastJumpOriginRef.current) {
      lastJumpOriginRef.current = jumpToOriginTrigger;
      const originPt: Point = { x: 0, y: 0 };
      let originScreen = worldToScreen(0, 0);

      // If (0, 0) is currently outside the visible viewport margin, center viewport on (0, 0)
      if (
        originScreen.x < 40 ||
        originScreen.x > canvasSize.width - 40 ||
        originScreen.y < 40 ||
        originScreen.y > canvasSize.height - 40
      ) {
        onPanZoomChange({ x: 0, y: 0 }, zoom);
        originScreen = {
          x: canvasSize.width / 2,
          y: canvasSize.height / 2,
        };
      }

      const originSnap: SnapPoint = {
        point: originPt,
        type: 'endpoint',
        label: '座標原點 X,Y=(0,0)',
      };
      setMouseScreen(originScreen);
      setCursorWorld(originPt);
      setActiveSnap(originSnap);
      setCursorPinnedToOrigin(true);
      pinScreenAnchorRef.current = null;
      onCursorMove(originPt, originSnap);
    }
  }, [
    jumpToOriginTrigger,
    canvasSize.width,
    canvasSize.height,
    onCursorMove,
    onPanZoomChange,
    worldToScreen,
    zoom,
  ]);

  // Sync move target X,Y inputs with current selection reference point
  useEffect(() => {
    const sel = entities.filter((e) => selectedIds.includes(e.id));
    if (sel.length > 0) {
      const refPt = getSelectionReferencePoint(sel);
      setMoveTargetInputX(Number(refPt.x.toFixed(2)).toString());
      setMoveTargetInputY(Number(refPt.y.toFixed(2)).toString());
    }
  }, [selectedIds, entities]);

  // Reset transient states when activeTool changes
  useEffect(() => {
    setDynValue('');
    setDynAngleValue('');
    setDynField('primary');
    setSelectionBoxStart(null);
    setActiveGrip(null);
    setActiveEntityDrag(null);
    setDragPreviewEntities(null);
    dragPreviewRef.current = null;
    setDimAlignGuide(null);
    setExtendFirstPick(null);
    setCornerFirstPick(null);
    if (activeTool !== 'measure') {
      setMeasureResult(null);
    }
  }, [activeTool]);

  // Execute X,Y coordinate jump for selected entities in move tool
  const executeMoveToCoordinates = useCallback(
    (targetX: number, targetY: number) => {
      if (selectedIds.length === 0) {
        onLogCommand('MOVE 請先選取要移動的物件。', 'error');
        return;
      }
      const sel = entities.filter((e) => selectedIds.includes(e.id));
      const basePt =
        drawingPoints.length > 0
          ? drawingPoints[0]
          : getSelectionReferencePoint(sel);
      const dx = targetX - basePt.x;
      const dy = targetY - basePt.y;
      const updated = entities.map((e) =>
        selectedIds.includes(e.id) ? translateEntity(e, dx, dy) : e
      );
      onUpdateEntities(updated);
      setDrawingPoints([]);
      setDynValue('');
      setDynAngleValue('');
      onToolComplete();
      onLogCommand(
        `MOVE 已跳轉移動 ${selectedIds.length} 個物件至座標 (${targetX.toFixed(2)}, ${targetY.toFixed(2)}) [ΔX=${dx.toFixed(2)}, ΔY=${dy.toFixed(2)}]`,
        'success'
      );
    },
    [
      drawingPoints,
      entities,
      onLogCommand,
      onToolComplete,
      onUpdateEntities,
      selectedIds,
      setDrawingPoints,
    ]
  );

  // Commit point logic (shared by mouse click, touch tap, and Enter/Space key with Dynamic Input)
  const commitPoint = useCallback(
    (pt: Point) => {
      if (activeTool === 'zoomWindow') {
        if (drawingPoints.length === 0) {
          setDrawingPoints([pt]);
          onLogCommand(
            `ZOOM WINDOW 指定局部放大第一角點: (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}) — 請點選對角點`,
            'info'
          );
        } else {
          const p1 = drawingPoints[0];
          const rw = Math.abs(pt.x - p1.x);
          const rh = Math.abs(pt.y - p1.y);
          if (rw > 0.01 && rh > 0.01) {
            const cx = (p1.x + pt.x) / 2;
            const cy = (p1.y + pt.y) / 2;
            const nextZoom = Math.min(
              350,
              Math.max(
                0.015,
                Math.min(
                  (canvasSize.width * 0.85) / rw,
                  (canvasSize.height * 0.85) / rh
                )
              )
            );
            onPanZoomChange({ x: -cx * nextZoom, y: cy * nextZoom }, nextZoom);
            setDrawingPoints([]);
            onToolComplete();
            onLogCommand(
              `ZOOM WINDOW 已局部放大至選取區域 (${rw.toFixed(2)} × ${rh.toFixed(2)} mm)`,
              'success'
            );
          }
        }
        return;
      }

      if (activeTool === 'pdfWindow') {
        if (drawingPoints.length === 0) {
          setDrawingPoints([pt]);
          onLogCommand(
            `PDF 窗選匯出 — 已指定匯出區域第一角點: (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}) — 請點選對角點完成窗選並匯出 PDF`,
            'info'
          );
        } else {
          const p1 = drawingPoints[0];
          const rw = Math.abs(pt.x - p1.x);
          const rh = Math.abs(pt.y - p1.y);
          if (rw > 0.01 && rh > 0.01) {
            const minX = Math.min(p1.x, pt.x);
            const maxX = Math.max(p1.x, pt.x);
            const minY = Math.min(p1.y, pt.y);
            const maxY = Math.max(p1.y, pt.y);
            setDrawingPoints([]);
            onToolComplete();
            onPdfWindowSelected?.({ minX, minY, maxX, maxY });
          }
        }
        return;
      }

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
              `LINE 指定第一點: (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}) — 請指定下一點或輸入長度按空白鍵/Enter`,
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
                `LINE 線段已建立 (長度 ${dist(prev, pt).toFixed(2)} mm) — 繼續指定下一點，或按空白鍵/Enter/Esc 結束`,
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
              `PLINE 指定起點: (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}) — 請指定下一頂點，按空白鍵或 Enter 完成聚合線`,
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
            if (rectangleMode === 'center') {
              onLogCommand(
                `RECTANG [中心矩形] 指定矩形中心點: (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}) — 請指定角點或輸入總寬[Tab]總高`,
                'info'
              );
            } else {
              onLogCommand(
                `RECTANG [轉角矩形] 指定第一個角點: (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}) — 請指定對角點或輸入寬[Tab]高`,
                'info'
              );
            }
          } else {
            const p0 = drawingPoints[0];
            if (
              Math.abs(pt.x - p0.x) >= 0.01 &&
              Math.abs(pt.y - p0.y) >= 0.01
            ) {
              const corner1 =
                rectangleMode === 'center'
                  ? { x: 2 * p0.x - pt.x, y: 2 * p0.y - pt.y }
                  : p0;
              const corner2 = pt;
              onAddEntity({
                id,
                type: 'rectangle',
                layerId: activeLayerId,
                p1: corner1,
                p2: corner2,
                rectangleMode,
              });
              setDrawingPoints([]);
              onLogCommand(
                `RECTANG 已建立${rectangleMode === 'center' ? '中心' : '轉角'}矩形: ${Math.abs(corner2.x - corner1.x).toFixed(2)} × ${Math.abs(corner2.y - corner1.y).toFixed(2)} mm (支援按 X 炸開為 4 條直線)`,
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
              `CIRCLE 指定圓心: (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}) — 請指定半徑或直接輸入數值按空白鍵/Enter`,
              'info'
            );
          } else {
            const center = drawingPoints[0];
            const r = dist(center, pt);
            if (r >= 0.01) {
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
          // True 3-Point Arc: Point 1 (Start) -> Point 2 (Second point on arc) -> Point 3 (End)
          if (drawingPoints.length === 0) {
            setDrawingPoints([pt]);
            onLogCommand(
              `ARC [三點圓弧] 步驟 1/3 已指定圓弧起點 P1: (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}) — 請點選圓弧通過的第二點 P2`,
              'info'
            );
          } else if (drawingPoints.length === 1) {
            if (dist(drawingPoints[0], pt) >= 0.01) {
              setDrawingPoints([drawingPoints[0], pt]);
              onLogCommand(
                `ARC [三點圓弧] 步驟 2/3 已指定弧上第二點 P2: (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}) — 請點選圓弧終點 P3`,
                'info'
              );
            }
          } else {
            const p1 = drawingPoints[0];
            const p2 = drawingPoints[1];
            const arcData = arcFromThreePoints(p1, p2, pt);
            if (arcData) {
              onAddEntity({
                id,
                type: 'arc',
                layerId: activeLayerId,
                center: arcData.center,
                radius: arcData.radius,
                startAngle: arcData.startAngle,
                endAngle: arcData.endAngle,
                p1,
                p2,
                p3: pt,
              });
              setDrawingPoints([]);
              onLogCommand(
                `ARC 已建立三點圓弧 (R=${arcData.radius.toFixed(2)} mm，通過 P1、P2、P3 三點)`,
                'success'
              );
            } else {
              onLogCommand('三點共線無法構成圓弧，請選擇不共線的第三點。', 'error');
            }
          }
          break;
        }

        case 'polygon': {
          if (drawingPoints.length === 0) {
            setDrawingPoints([pt]);
            onLogCommand(
              `POLYGON (${polygonSides} 邊形) 指定中心點: (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})`,
              'info'
            );
          } else {
            const center = drawingPoints[0];
            const r = dist(center, pt);
            const rot = angleBetween(center, pt);
            if (r >= 0.01) {
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

        case 'hatch': {
          if (drawingPoints.length === 0) {
            setDrawingPoints([pt]);
            onLogCommand(
              `HATCH 指定自訂填充範圍第一角點: (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}) — 請點選對角點或繼續點選多邊形頂點後按 Enter 執行填充（採用 A-WALL 建築主牆/輪廓層）`,
              'info'
            );
          } else {
            const p0 = drawingPoints[0];
            const minX = Math.min(p0.x, pt.x);
            const maxX = Math.max(p0.x, pt.x);
            const minY = Math.min(p0.y, pt.y);
            const maxY = Math.max(p0.y, pt.y);
            const effectivePitch =
              dynValue.trim() !== '' && !isNaN(parseFloat(dynValue))
                ? Math.max(0.5, parseFloat(dynValue))
                : Math.max(0.5, hatchPitch);
            if (effectivePitch !== hatchPitch) {
              onChangeHatchPitch(effectivePitch);
            }
            if (maxX - minX >= 0.1 && maxY - minY >= 0.1) {
              const newHatch: CadEntity = {
                id: `hatch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                type: 'hatch',
                layerId: wallLayerId,
                pitch: effectivePitch,
                angle: 45,
                boundaryType: 'polygon',
                points: [
                  { x: minX, y: minY },
                  { x: maxX, y: minY },
                  { x: maxX, y: maxY },
                  { x: minX, y: maxY },
                ],
              };
              onAddEntity(newHatch);
              onSelectChange([newHatch.id]);
              setDrawingPoints([]);
              onLogCommand(
                `HATCH 已於「建築主牆/輪廓」圖層建立自訂範圍 45° 斜線剖面填充 (PITCH = ${effectivePitch} mm，範圍 ${(maxX - minX).toFixed(1)} × ${(maxY - minY).toFixed(1)} mm)`,
                'success'
              );
            }
          }
          break;
        }

        case 'dimension': {
          if (pendingRadiusDimArc) {
            const dimLayer = layers.some((l) => l.id === 'DIM')
              ? 'DIM'
              : activeLayerId;
            const rDim = createRadiusDimensionForArc(
              pendingRadiusDimArc,
              dimLayer,
              defaultDimFontSize,
              pt
            );
            onAddEntity(rDim);
            setPendingRadiusDimArc(null);
            setDrawingPoints([]);
            onSelectChange([rDim.id]);
            onLogCommand(
              `DIMRADIUS 已完成導圓角/圓弧半徑標註: R${pendingRadiusDimArc.radius.toFixed(2)} (可於下方或右側屬性設定正負公差與小數位數)`,
              'success'
            );
            break;
          }
          if (drawingPoints.length === 0) {
            setDrawingPoints([pt]);
            onLogCommand(
              `DIM 指定第一條延伸線原點（或直接點擊導圓角/圓弧標註半徑 R、點擊圓周標註直徑 Ø）: (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})`,
              'info'
            );
          } else if (drawingPoints.length === 1) {
            setDrawingPoints([drawingPoints[0], pt]);
            onLogCommand(
              `DIM 指定第二點 — 移動決定標註線偏移位置（靠近既有標註線可自動相互對齊！）`,
              'info'
            );
          } else {
            const p1 = drawingPoints[0];
            const p2 = drawingPoints[1];
            // Check if p1 & p2 are opposite points on a circle -> auto-set dimMode: 'diameter'
            const midPt = midpoint(p1, p2);
            const halfLen = dist(p1, p2) / 2;
            const matchedCircle = entities.find(
              (ent) =>
                ent.type === 'circle' &&
                dist(ent.center, midPt) <= Math.max(2, ent.radius * 0.08) &&
                Math.abs(ent.radius - halfLen) <= Math.max(2, ent.radius * 0.08)
            );
            const isDia = Boolean(matchedCircle);
            const { offsetPoint: snappedOffset } = isDia
              ? { offsetPoint: pt }
              : snapDimensionOffsetToExisting(p1, p2, pt, entities, zoom);
            onAddEntity({
              id,
              type: 'dimension',
              layerId: layers.some((l) => l.id === 'DIM')
                ? 'DIM'
                : activeLayerId,
              dimMode: isDia ? 'diameter' : 'linear',
              precision: 2,
              toleranceMode: 'none',
              toleranceUpper: 0.05,
              toleranceLower: -0.05,
              p1,
              p2,
              offsetPoint: snappedOffset,
              fontSize: defaultDimFontSize,
            });
            setDrawingPoints([]);
            setDimAlignGuide(null);
            onLogCommand(
              isDia
                ? `DIMDIAMETER 已依 ISO 國際規範標註圓形直徑: Ø${dist(p1, p2).toFixed(2)} (可於下方或右側屬性設定正負公差與小數位數)`
                : `DIMLINEAR 已標註尺寸: ${dist(p1, p2).toFixed(2)} (可於下方或右側屬性設定正負公差與小數位數)`,
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
          const currentSelected = entities.filter((e) =>
            selectedIds.includes(e.id)
          );
          const sourceForCopy =
            currentSelected.length > 0 ? currentSelected : copySourceEntities;
          if (sourceForCopy.length === 0) {
            onLogCommand(
              'COPY 請先選取要複製的物件（支援跨畫布分頁選取或剪貼簿物件連續複製）。',
              'error'
            );
            return;
          }
          if (drawingPoints.length === 0) {
            setDrawingPoints([pt]);
            onLogCommand(
              `COPY 指定基準點: (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}) — 點選目標點可連續複製（可切換至其他畫布分頁繼續點擊連續複製），按空白鍵/Esc 結束`,
              'info'
            );
          } else {
            const base = drawingPoints[0];
            const dx = pt.x - base.x;
            const dy = pt.y - base.y;
            const cloneCopiedEntity = (
              ent: CadEntity,
              idx: number
            ): CadEntity => {
              const shifted = translateEntity(ent, dx, dy);
              const newId = `copy_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
              if (shifted.type === 'group') {
                return {
                  ...shifted,
                  id: newId,
                  children: shifted.children.map((c, ci) =>
                    cloneCopiedEntity(c, ci)
                  ),
                };
              }
              return { ...shifted, id: newId };
            };
            const copies = sourceForCopy.map((e, i) => cloneCopiedEntity(e, i));
            onUpdateEntities([...entities, ...copies]);
            onLogCommand(
              `COPY 已連續複製 ${copies.length} 個物件 — 可繼續點選放置下一個副本（或切換畫布分頁連續複製），按空白鍵/Esc 結束`,
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
      canvasSize.height,
      canvasSize.width,
      defaultDimFontSize,
      drawingPoints,
      entities,
      hatchPitch,
      layers,
      onAddEntity,
      onLogCommand,
      onPanZoomChange,
      onToolComplete,
      onUpdateEntities,
      polygonSides,
      rectangleMode,
      selectedIds,
      setDrawingPoints,
      wallLayerId,
      zoom,
      copySourceEntities,
      onPdfWindowSelected,
    ]
  );

  // Keyboard handlers: Spacebar = Enter, Escape, Dynamic numeric input, Tab
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape') {
        setCursorPinnedToOrigin(false);
        if (pendingRadiusDimArc) {
          setPendingRadiusDimArc(null);
          onLogCommand('已取消半徑 R 標註 (ESC)', 'info');
          return;
        }
        if (extendFirstPick) {
          setExtendFirstPick(null);
          onSelectChange([]);
          onLogCommand('已取消第一條延伸線段選擇 (ESC)', 'info');
          return;
        }
        if (cornerFirstPick) {
          setCornerFirstPick(null);
          onSelectChange([]);
          onLogCommand('已取消第一條邊選擇 (ESC)', 'info');
          return;
        }
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

      // Tab key when not actively typing a number: select all connected segments (or all segments on canvas)
      if (
        e.key === 'Tab' &&
        drawingPoints.length === 0 &&
        (activeTool !== 'offset' || dynValue.trim() === '')
      ) {
        e.preventDefault();
        const visibleLayerIds = new Set(
          layers.filter((l) => l.visible && !l.locked).map((l) => l.id)
        );
        const visibleSelectable = entities.filter((ent) =>
          visibleLayerIds.has(ent.layerId)
        );
        if (visibleSelectable.length === 0) return;

        const segmentEntities = visibleSelectable.filter(
          (ent) => ent.type !== 'dimension' && ent.type !== 'text'
        );
        const allTargetEntities =
          segmentEntities.length > 0 ? segmentEntities : visibleSelectable;
        const allTargetIds = allTargetEntities.map((ent) => ent.id);

        const seedIds =
          selectedIds.length > 0
            ? selectedIds
            : hoveredEntityId
              ? [hoveredEntityId]
              : [];

        if (seedIds.length > 0) {
          const connectedIds = findConnectedEntityIds(
            seedIds,
            visibleSelectable,
            2.5
          );
          const hasUnselectedConnected = connectedIds.some(
            (id) => !selectedIds.includes(id)
          );
          if (connectedIds.length > 1 && hasUnselectedConnected) {
            onSelectChange(connectedIds);
            onLogCommand(
              `TAB 連鎖選取：已選取相連的全部 ${connectedIds.length} 條線段！（再按一次 TAB 可選取畫布全部線段）`,
              'success'
            );
            return;
          }
        }

        onSelectChange(allTargetIds);
        onLogCommand(
          `TAB 全選線段：已選取畫布上全部 ${allTargetIds.length} 個線段與圖元！`,
          'success'
        );
        return;
      }

      // Dynamic numeric typing when drawing, moving, or in offset/chamfer/fillet/hatch tool
      if (
        (drawingPoints.length > 0 && settings.dynInput) ||
        activeTool === 'offset' ||
        activeTool === 'chamfer' ||
        activeTool === 'fillet' ||
        activeTool === 'hatch' ||
        activeTool === 'move' ||
        activeTool === 'copy'
      ) {
        if (e.key === 'Tab') {
          e.preventDefault();
          setDynField((prev) => (prev === 'primary' ? 'secondary' : 'primary'));
          return;
        }
        if (e.key === ',') {
          e.preventDefault();
          if (
            activeTool === 'move' ||
            activeTool === 'copy' ||
            drawingPoints.length > 0
          ) {
            setDynField('secondary');
          }
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
            if (dynAngleValue.length > 0) {
              setDynAngleValue((prev) => prev.slice(0, -1));
            } else {
              setDynField('primary');
            }
          }
          return;
        }
      }

      // Spacebar acts identically to Enter!
      if (e.key === 'Enter' || e.code === 'Space') {
        if (activeTool === 'hatch') {
          e.preventDefault();
          let effectivePitch = hatchPitch;
          if (dynValue.trim() !== '') {
            const parsed = parseFloat(dynValue);
            if (!isNaN(parsed) && parsed >= 0.5) {
              effectivePitch = parsed;
              onChangeHatchPitch(parsed);
            }
            setDynValue('');
          }

          const visibleLayerIds = new Set(
            layers.filter((l) => l.visible && !l.locked).map((l) => l.id)
          );
          const visibleEntities = entities.filter((ent) =>
            visibleLayerIds.has(ent.layerId)
          );

          // 1. If user has selected boundary entities (自行選取範圍再輸入執行), hatch the selected entities!
          if (selectedIds.length > 0) {
            const selectedEnts = entities.filter(
              (ent) => selectedIds.includes(ent.id) && ent.type !== 'hatch'
            );
            if (selectedEnts.length > 0) {
              const created = createHatchFromEntities(
                selectedEnts,
                effectivePitch,
                wallLayerId,
                true
              );
              if (created.length > 0) {
                onUpdateEntities([...entities, ...created]);
                onSelectChange(created.map((h) => h.id));
                onLogCommand(
                  `HATCH 已於「建築主牆/輪廓」圖層執行選取範圍剖面填充 (共 ${created.length} 組，PITCH = ${effectivePitch} mm)！`,
                  'success'
                );
                return;
              }
            }
          }

          // 2. If user clicked 2+ custom boundary points (drawingPoints), execute polygon/rect hatch!
          if (drawingPoints.length >= 2) {
            const pts =
              drawingPoints.length === 2
                ? [
                    {
                      x: Math.min(drawingPoints[0].x, drawingPoints[1].x),
                      y: Math.min(drawingPoints[0].y, drawingPoints[1].y),
                    },
                    {
                      x: Math.max(drawingPoints[0].x, drawingPoints[1].x),
                      y: Math.min(drawingPoints[0].y, drawingPoints[1].y),
                    },
                    {
                      x: Math.max(drawingPoints[0].x, drawingPoints[1].x),
                      y: Math.max(drawingPoints[0].y, drawingPoints[1].y),
                    },
                    {
                      x: Math.min(drawingPoints[0].x, drawingPoints[1].x),
                      y: Math.max(drawingPoints[0].y, drawingPoints[1].y),
                    },
                  ]
                : drawingPoints.map((p) => ({ ...p }));
            const newHatch: CadEntity = {
              id: `hatch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              type: 'hatch',
              layerId: wallLayerId,
              pitch: effectivePitch,
              angle: 45,
              boundaryType: 'polygon',
              points: pts,
            };
            onAddEntity(newHatch);
            onSelectChange([newHatch.id]);
            setDrawingPoints([]);
            onLogCommand(
              `HATCH 已於「建築主牆/輪廓」圖層完成自選範圍剖面填充 (PITCH = ${effectivePitch} mm)！`,
              'success'
            );
            return;
          }

          // 3. Smart Hatch at current cursor position (智慧填充輸入: 輸入 PITCH 按 Enter 直接填充游標所在封閉區域!)
          const smartHatch = findSmartHatchBoundaryAtPoint(
            cursorWorld,
            visibleEntities,
            effectivePitch,
            wallLayerId,
            14 / zoom
          );
          if (smartHatch) {
            onUpdateEntities([...entities, smartHatch]);
            onSelectChange([smartHatch.id]);
            onLogCommand(
              `HATCH 智慧填充輸入完成：已於「建築主牆/輪廓」圖層建立 45° 斜線剖面填充 (PITCH = ${effectivePitch} mm)！`,
              'success'
            );
            return;
          }

          onLogCommand(
            `HATCH 已設定斜線 PITCH = ${effectivePitch} mm — 請點選封閉區域進行智慧填充，或選取邊界範圍後按 Enter 執行填充`,
            'info'
          );
          return;
        }

        if (activeTool === 'offset' && dynValue.trim() !== '') {
          e.preventDefault();
          const newDist = parseFloat(dynValue);
          if (!isNaN(newDist) && newDist >= 0.01) {
            onChangeOffsetDistance(newDist);
            onLogCommand(
              `OFFSET 已設定偏移距離 = ${newDist.toFixed(2)} mm — 請點選要偏移的一側（支援同時偏移所有已選取圖形）`,
              'success'
            );
          }
          setDynValue('');
          return;
        }

        if (activeTool === 'chamfer' && dynValue.trim() !== '') {
          e.preventDefault();
          const newDist = parseFloat(dynValue);
          if (!isNaN(newDist) && newDist >= 0.1) {
            onChangeChamferDistance(newDist);
            onLogCommand(
              `CHAMFER 已設定倒角距離 D = ${newDist.toFixed(2)} mm — 請依序點選兩條相交邊建立倒角`,
              'success'
            );
          }
          setDynValue('');
          return;
        }

        if (activeTool === 'fillet' && dynValue.trim() !== '') {
          e.preventDefault();
          const newRadius = parseFloat(dynValue);
          if (!isNaN(newRadius) && newRadius >= 0.1) {
            onChangeFilletRadius(newRadius);
            onLogCommand(
              `FILLET 已設定導圓角半徑 R = ${newRadius.toFixed(2)} mm — 請依序點選兩條相交邊建立導圓角`,
              'success'
            );
          }
          setDynValue('');
          return;
        }

        // Direct X,Y coordinate jump in MOVE or COPY mode!
        if (
          (activeTool === 'move' || activeTool === 'copy') &&
          dynValue.trim() !== '' &&
          dynAngleValue.trim() !== ''
        ) {
          e.preventDefault();
          const tx = parseFloat(dynValue);
          const ty = parseFloat(dynAngleValue);
          if (!isNaN(tx) && !isNaN(ty)) {
            if (activeTool === 'move') {
              executeMoveToCoordinates(tx, ty);
            } else {
              commitPoint({ x: tx, y: ty });
            }
            return;
          }
        }

        if (activeTool === 'join' && selectedIds.length >= 2) {
          e.preventDefault();
          onJoinSelected();
          return;
        }

        if (activeTool === 'extend' && extendFirstPick) {
          e.preventDefault();
          const firstEnt = entities.find(
            (ent) => ent.id === extendFirstPick.entityId
          );
          if (firstEnt) {
            const visibleLayerIds = new Set(
              layers.filter((l) => l.visible && !l.locked).map((l) => l.id)
            );
            const visibleEntities = entities.filter((ent) =>
              visibleLayerIds.has(ent.layerId)
            );
            const res = computeExtendResult(
              extendFirstPick.clickPt,
              firstEnt,
              visibleEntities
            );
            if (res) {
              onUpdateEntities(
                entities.map((ent) =>
                  ent.id === firstEnt.id ? res.updatedEntity : ent
                )
              );
              setExtendFirstPick(null);
              onSelectChange([]);
              onLogCommand(
                `EXTEND 已延伸線段至交界處 (+${dist(res.extensionSegment[0], res.extensionSegment[1]).toFixed(2)} mm)`,
                'success'
              );
              return;
            }
          }
        }

        const anchor = drawingPoints[drawingPoints.length - 1];
        if (anchor && (dynValue.trim() !== '' || dynAngleValue.trim() !== '')) {
          e.preventDefault();
          setCursorPinnedToOrigin(false);
          const val1 = parseFloat(dynValue);
          const val2 = parseFloat(dynAngleValue);

          if (activeTool === 'rectangle' && !isNaN(val1)) {
            const w = Math.max(0.01, Math.abs(val1));
            const h = !isNaN(val2) ? Math.max(0.01, Math.abs(val2)) : w;
            const signX = cursorWorld.x >= anchor.x ? 1 : -1;
            const signY = cursorWorld.y >= anchor.y ? 1 : -1;
            if (rectangleMode === 'center') {
              commitPoint({
                x: anchor.x + signX * (w / 2),
                y: anchor.y + signY * (h / 2),
              });
            } else {
              commitPoint({
                x: anchor.x + signX * w,
                y: anchor.y + signY * h,
              });
            }
            return;
          }

          if (!isNaN(val1) && Math.abs(val1) >= 0.01) {
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

        // If cursor was jumped to Origin (0,0) via JO and user presses Spacebar/Enter while in a point-input tool, commit (0,0)!
        if (
          cursorPinnedToOrigin &&
          [
            'line',
            'polyline',
            'rectangle',
            'circle',
            'arc',
            'polygon',
            'dimension',
            'measure',
            'move',
            'copy',
            'rotate',
            'mirror',
            'zoomWindow',
          ].includes(activeTool)
        ) {
          e.preventDefault();
          setCursorPinnedToOrigin(false);
          commitPoint({ x: 0, y: 0 });
          return;
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

        if (
          (activeTool === 'line' || activeTool === 'copy') &&
          drawingPoints.length > 0
        ) {
          e.preventDefault();
          setDrawingPoints([]);
          onLogCommand(
            `${activeTool.toUpperCase()} 已結束連續操作 (空白鍵/Enter)`,
            'info'
          );
          return;
        }

        if (activeTool !== 'select' && drawingPoints.length === 0) {
          e.preventDefault();
          onToolComplete();
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

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    activeGrip,
    activeLayerId,
    activeTool,
    commitPoint,
    cursorPinnedToOrigin,
    cursorWorld,
    drawingPoints,
    dynAngleValue,
    dynField,
    dynValue,
    entities,
    executeMoveToCoordinates,
    extendFirstPick,
    hoveredEntityId,
    layers,
    onAddEntity,
    onChangeOffsetDistance,
    onJoinSelected,
    onLogCommand,
    onSelectChange,
    onToolComplete,
    onUpdateEntities,
    rectangleMode,
    selectedIds,
    selectionBoxStart,
    setDrawingPoints,
    settings.dynInput,
  ]);

  // Update world cursor & snap from screen coordinates
  const updateCursorFromScreen = useCallback(
    (sx: number, sy: number, ignorePin = false) => {
      if (cursorPinnedToOrigin && !ignorePin) {
        if (!pinScreenAnchorRef.current) {
          pinScreenAnchorRef.current = { x: sx, y: sy };
        }
        const moveDist = Math.hypot(
          sx - pinScreenAnchorRef.current.x,
          sy - pinScreenAnchorRef.current.y
        );
        if (moveDist <= 8) {
          const originPt: Point = { x: 0, y: 0 };
          const originScreen = worldToScreen(0, 0);
          setMouseScreen(originScreen);
          setCursorWorld(originPt);
          return { rawWorld: originPt, effectiveWorld: originPt };
        } else {
          setCursorPinnedToOrigin(false);
          pinScreenAnchorRef.current = null;
        }
      }

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

      // Check dimension alignment guide when placing 3rd point of dimension
      if (activeTool === 'dimension' && drawingPoints.length === 2) {
        const { offsetPoint: alignedPt, alignGuide } =
          snapDimensionOffsetToExisting(
            drawingPoints[0],
            drawingPoints[1],
            effectiveWorld,
            entities,
            zoom
          );
        if (alignGuide) {
          effectiveWorld = alignedPt;
          setDimAlignGuide(alignGuide);
        } else {
          setDimAlignGuide(null);
        }
      } else if (activeGrip) {
        const gripEnt = entities.find((e) => e.id === activeGrip.entityId);
        if (gripEnt?.type === 'dimension' && activeGrip.gripIndex === 2) {
          const { offsetPoint: alignedPt, alignGuide } =
            snapDimensionOffsetToExisting(
              gripEnt.p1,
              gripEnt.p2,
              effectiveWorld,
              entities,
              zoom,
              gripEnt.id
            );
          if (alignGuide) {
            effectiveWorld = alignedPt;
            setDimAlignGuide(alignGuide);
          } else {
            setDimAlignGuide(null);
          }
        } else {
          setDimAlignGuide(null);
        }
      } else {
        setDimAlignGuide(null);
      }

      setCursorWorld(effectiveWorld);
      onCursorMove(effectiveWorld, snap);
      return { rawWorld, effectiveWorld };
    },
    [
      activeGrip,
      activeTool,
      cursorPinnedToOrigin,
      drawingPoints,
      entities,
      layers,
      onCursorMove,
      screenToWorld,
      settings,
      worldToScreen,
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

    // Local preview buffer during grip drag -> prevents history stack flooding / browser freeze!
    if (activeGrip) {
      const updated = entities.map((ent) =>
        ent.id === activeGrip.entityId
          ? applyGripMove(ent, activeGrip.gripIndex, effectiveWorld)
          : ent
      );
      dragPreviewRef.current = updated;
      setDragPreviewEntities(updated);
      return;
    }

    // Local preview buffer during direct entity drag on canvas -> smooth 60fps without crash!
    if (activeEntityDrag) {
      const dx = effectiveWorld.x - activeEntityDrag.startWorld.x;
      const dy = effectiveWorld.y - activeEntityDrag.startWorld.y;
      if (Math.hypot(dx, dy) > 0.01) {
        const updated = activeEntityDrag.initialEntities.map((ent) =>
          selectedIds.includes(ent.id) ? translateEntity(ent, dx, dy) : ent
        );
        dragPreviewRef.current = updated;
        setDragPreviewEntities(updated);
      }
      return;
    }

    if (
      activeTool === 'select' ||
      activeTool === 'erase' ||
      activeTool === 'offset' ||
      activeTool === 'trim' ||
      activeTool === 'extend' ||
      activeTool === 'join' ||
      activeTool === 'dimension' ||
      activeTool === 'hatch'
    ) {
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

    if (e.button === 1 || activeTool === 'pan') {
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
    if (cursorPinnedToOrigin) {
      setCursorPinnedToOrigin(false);
      pinScreenAnchorRef.current = null;
    }

    const visibleLayerIds = new Set(
      layers.filter((l) => l.visible && !l.locked).map((l) => l.id)
    );
    const visibleEntities = entities.filter((ent) =>
      visibleLayerIds.has(ent.layerId)
    );

    // 1. Check if in SELECT mode
    if (activeTool === 'select') {
      if (selectedIds.length > 0) {
        const gripTol = 11 / zoom;
        for (const ent of entities) {
          if (!selectedIds.includes(ent.id)) continue;
          const grips = getEntityGripHandles(ent);
          const hitGrip = grips.find((g) => dist(rawWorld, g.point) <= gripTol);
          if (hitGrip) {
            setActiveGrip(hitGrip);
            dragPreviewRef.current = null;
            setDragPreviewEntities(null);
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
        const boxedIds = visibleEntities
          .filter((ent) =>
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

      const hitTol = 10 / zoom;
      const hit = [...visibleEntities]
        .reverse()
        .find((ent) => isPointNearEntity(rawWorld, ent, hitTol));

      if (hit) {
        if (e.shiftKey) {
          if (selectedIds.includes(hit.id)) {
            onSelectChange(selectedIds.filter((id) => id !== hit.id));
          } else {
            onSelectChange([...selectedIds, hit.id]);
          }
        } else {
          if (!selectedIds.includes(hit.id)) {
            onSelectChange([hit.id]);
          }
          // Allow direct smooth dragging of selected entities on canvas without freezing
          setActiveEntityDrag({
            startWorld: effectiveWorld,
            currentWorld: effectiveWorld,
            initialEntities: entities,
          });
          dragPreviewRef.current = null;
          setDragPreviewEntities(null);
        }
      } else {
        setSelectionBoxStart(rawWorld);
        if (!e.shiftKey) {
          onSelectChange([]);
        }
      }
      return;
    }

    // 1b. If in DIMENSION mode and drawingPoints is empty, clicking directly on an Arc (導圓角/三點圓弧) starts an ISO Radius Dimension (R), or clicking a Circle starts an ISO Diameter Dimension (Ø)!
    if (
      activeTool === 'dimension' &&
      drawingPoints.length === 0 &&
      !pendingRadiusDimArc
    ) {
      const hitTol = 12 / zoom;
      const hitArc = [...visibleEntities]
        .reverse()
        .find(
          (ent): ent is ArcEntity =>
            ent.type === 'arc' && isPointNearEntity(rawWorld, ent, hitTol)
        );
      if (hitArc) {
        setPendingRadiusDimArc(hitArc);
        onLogCommand(
          `DIMRADIUS 已偵測導圓角/圓弧 (R${hitArc.radius.toFixed(2)}) — 移動滑鼠決定半徑標註引線位置並點擊完成！`,
          'info'
        );
        return;
      }

      const hitCircle = [...visibleEntities]
        .reverse()
        .find(
          (ent): ent is CircleEntity =>
            ent.type === 'circle' &&
            Math.abs(dist(rawWorld, ent.center) - ent.radius) <= hitTol
        );
      if (hitCircle) {
        const ang = angleBetween(hitCircle.center, rawWorld);
        const p1: Point = {
          x: hitCircle.center.x - hitCircle.radius * Math.cos(ang),
          y: hitCircle.center.y - hitCircle.radius * Math.sin(ang),
        };
        const p2: Point = {
          x: hitCircle.center.x + hitCircle.radius * Math.cos(ang),
          y: hitCircle.center.y + hitCircle.radius * Math.sin(ang),
        };
        setDrawingPoints([p1, p2]);
        onLogCommand(
          `DIMDIAMETER 已偵測圓形 (Ø${(hitCircle.radius * 2).toFixed(2)}) — 移動滑鼠指定國際規範直徑標註位置並點擊完成！`,
          'info'
        );
        return;
      }
    }

    // 1c. Check if in HATCH (45° 斜線剖面填充: 支援「智慧填充輸入」與「自行選取範圍再輸入執行」) mode
    if (activeTool === 'hatch') {
      const effectivePitch =
        dynValue.trim() !== '' && !isNaN(parseFloat(dynValue))
          ? Math.max(0.5, parseFloat(dynValue))
          : Math.max(0.5, hatchPitch);
      if (effectivePitch !== hatchPitch) {
        onChangeHatchPitch(effectivePitch);
      }

      // Mode A: 自行選取範圍再輸入執行 (hatchMode === 'selectRange')
      if (hatchMode === 'selectRange' && drawingPoints.length === 0) {
        if (selectionBoxStart) {
          const isCrossing = rawWorld.x < selectionBoxStart.x;
          const boxedIds = visibleEntities
            .filter(
              (ent) =>
                ent.type !== 'hatch' &&
                ent.type !== 'dimension' &&
                ent.type !== 'text' &&
                isEntityInSelectionBox(
                  ent,
                  selectionBoxStart,
                  rawWorld,
                  isCrossing
                )
            )
            .map((ent) => ent.id);
          const merged = e.shiftKey
            ? Array.from(new Set([...selectedIds, ...boxedIds]))
            : boxedIds;
          onSelectChange(merged);
          setSelectionBoxStart(null);
          onLogCommand(
            `HATCH 已框選 ${merged.length} 個邊界圖元 — 可直接輸入 PITCH 後按「空白鍵 / Enter」或點擊「執行填充」完成剖面填充！`,
            'info'
          );
          return;
        }

        const hitTol = 12 / zoom;
        const hitEnt = [...visibleEntities]
          .reverse()
          .find(
            (ent) =>
              ent.type !== 'hatch' &&
              ent.type !== 'dimension' &&
              ent.type !== 'text' &&
              isPointNearEntity(rawWorld, ent, hitTol)
          );

        if (hitEnt) {
          const nextIds = selectedIds.includes(hitEnt.id)
            ? selectedIds.filter((id) => id !== hitEnt.id)
            : [...selectedIds, hitEnt.id];
          onSelectChange(nextIds);
          onLogCommand(
            `HATCH 已選取 ${nextIds.length} 個邊界圖元（可按 TAB 自動選取相連封閉邊界，或拉框選取）— 輸入 PITCH 後按「空白鍵 / Enter」執行填充！`,
            'info'
          );
          return;
        } else {
          // Start window/crossing selection box to select boundary range
          setSelectionBoxStart(rawWorld);
          return;
        }
      }

      // Mode B: 智慧填充輸入 (hatchMode === 'smart') when drawingPoints is empty
      if (drawingPoints.length === 0) {
        const smartHatch = findSmartHatchBoundaryAtPoint(
          rawWorld,
          visibleEntities,
          effectivePitch,
          wallLayerId,
          12 / zoom
        );
        if (smartHatch) {
          onUpdateEntities([...entities, smartHatch]);
          onSelectChange([smartHatch.id]);
          setDynValue('');
          onLogCommand(
            `HATCH 智慧填充完成：已於「建築主牆/輪廓」圖層建立 45° 斜線剖面填充 (PITCH = ${effectivePitch} mm)！`,
            'success'
          );
          return;
        }
      }
    }

    // 1d. Check if in CHAMFER (倒角 CHA) or FILLET (導圓角 F) mode
    if (activeTool === 'chamfer' || activeTool === 'fillet') {
      const isChamfer = activeTool === 'chamfer';
      const hitTol = 12 / zoom;

      // In FILLET mode, if user clicks an existing Arc (such as an existing fillet arc) when cornerFirstPick is null,
      // immediately create a Radius Dimension (R 半徑標註) for that fillet arc!
      if (!isChamfer && !cornerFirstPick) {
        const hitExistingArc = [...visibleEntities]
          .reverse()
          .find(
            (ent): ent is ArcEntity =>
              ent.type === 'arc' && isPointNearEntity(rawWorld, ent, hitTol)
          );
        if (hitExistingArc) {
          const dimLayer = layers.some((l) => l.id === 'DIM')
            ? 'DIM'
            : activeLayerId;
          const rDim = createRadiusDimensionForArc(
            hitExistingArc,
            dimLayer,
            defaultDimFontSize
          );
          onUpdateEntities([...entities, rDim]);
          onSelectChange([rDim.id]);
          onLogCommand(
            `FILLET 已為導圓角建立半徑標註: R${hitExistingArc.radius.toFixed(2)}！`,
            'success'
          );
          return;
        }
      }

      const hit = [...visibleEntities]
        .reverse()
        .find(
          (ent) =>
            (ent.type === 'line' ||
              ent.type === 'rectangle' ||
              ent.type === 'polyline' ||
              ent.type === 'polygon') &&
            isPointNearEntity(rawWorld, ent, hitTol)
        );

      if (!hit) {
        if (cornerFirstPick) {
          setCornerFirstPick(null);
          onSelectChange([]);
          onLogCommand(
            `${isChamfer ? 'CHAMFER' : 'FILLET'} 已取消第一條邊選擇 — 請重新點選第一條直線或矩形邊`,
            'info'
          );
        } else {
          onLogCommand(
            isChamfer
              ? `CHAMFER 請依序點選兩條相交直線或矩形相鄰邊建立倒角 (目前倒角距離 D = ${chamferDistance} mm)`
              : `FILLET 請依序點選兩條相交直線或矩形相鄰邊建立導圓角 (目前圓角半徑 R = ${filletRadius} mm，或直接點選既有圓角標註 R 半徑)`,
            'info'
          );
        }
        return;
      }

      if (!cornerFirstPick) {
        setCornerFirstPick({ entityId: hit.id, clickPt: rawWorld });
        onSelectChange([hit.id]);
        onLogCommand(
          isChamfer
            ? `CHAMFER 已點選第一條邊 (${hit.type.toUpperCase()}) — 請點選相交的第二條邊建立倒角 (D = ${chamferDistance} mm)`
            : `FILLET 已點選第一條邊 (${hit.type.toUpperCase()}) — 請點選相交的第二條邊建立導圓角 (R = ${filletRadius} mm)`,
          'info'
        );
        return;
      }

      const firstEnt = entities.find((e) => e.id === cornerFirstPick.entityId);
      if (firstEnt) {
        const res = isChamfer
          ? computeChamferResult(
              firstEnt,
              cornerFirstPick.clickPt,
              hit,
              rawWorld,
              chamferDistance
            )
          : computeFilletResult(
              firstEnt,
              cornerFirstPick.clickPt,
              hit,
              rawWorld,
              filletRadius
            );

        if (res) {
          const removedSet = new Set(res.removedEntityIds);
          const additions: CadEntity[] = [...res.replacementEntities];
          const newSelectIds: string[] = res.cornerEntity
            ? [res.cornerEntity.id]
            : [];

          // If filletAutoDim is enabled, automatically add R radius dimension for the new fillet arc!
          if (
            !isChamfer &&
            filletAutoDim &&
            res.cornerEntity &&
            res.cornerEntity.type === 'arc'
          ) {
            const dimLayer = layers.some((l) => l.id === 'DIM')
              ? 'DIM'
              : activeLayerId;
            const autoRDim = createRadiusDimensionForArc(
              res.cornerEntity,
              dimLayer,
              defaultDimFontSize
            );
            additions.push(autoRDim);
            newSelectIds.push(autoRDim.id);
          }

          const nextEntities = entities
            .filter((e) => !removedSet.has(e.id))
            .concat(additions);
          onUpdateEntities(nextEntities);
          setCornerFirstPick(null);
          onSelectChange(newSelectIds);
          onLogCommand(
            isChamfer
              ? `CHAMFER 已完成倒角 (D = ${chamferDistance} mm)！可繼續點選下一組邊進行倒角`
              : filletAutoDim
                ? `FILLET 已完成導圓角並自動標註半徑 (R${filletRadius.toFixed(2)})！可繼續點選下一組邊`
                : `FILLET 已完成導圓角 (R = ${filletRadius} mm)！再點一下圓角弧線或按下方「+標註半徑 R」即可標註半徑`,
            'success'
          );
          return;
        }
      }

      setCornerFirstPick({ entityId: hit.id, clickPt: rawWorld });
      onSelectChange([hit.id]);
      onLogCommand(
        isChamfer
          ? `CHAMFER 無法在此位置建立倒角（請點選另一條不平行的相交邊，或縮小倒角距離 D = ${chamferDistance} mm）`
          : `FILLET 無法在此位置建立導圓角（請點選另一條不平行的相交邊，或縮小圓角半徑 R = ${filletRadius} mm）`,
        'error'
      );
      return;
    }

    // 2. Check if in ERASE (刪除圖元 E) mode
    if (activeTool === 'erase') {
      const hitTol = 10 / zoom;
      const hit = [...visibleEntities]
        .reverse()
        .find((ent) => isPointNearEntity(rawWorld, ent, hitTol));
      if (hit) {
        onUpdateEntities(entities.filter((e) => e.id !== hit.id));
        onSelectChange(selectedIds.filter((id) => id !== hit.id));
        onLogCommand(`ERASE 已刪除圖元 (${hit.type.toUpperCase()})`, 'success');
      } else {
        onLogCommand('ERASE 請直接點選要刪除的圖元物件', 'info');
      }
      return;
    }

    // 3. Check if in TRIM (剪切 TR — 支援直線、矩形、圓形、三點圓弧) mode
    if (activeTool === 'trim') {
      const hitTol = 10 / zoom;
      const hit = [...visibleEntities]
        .reverse()
        .find((ent) => isPointNearEntity(rawWorld, ent, hitTol));
      if (!hit) {
        onLogCommand('TRIM 請點選要剪切的直線、矩形、圓形或三點圓弧區段', 'info');
        return;
      }
      const res = computeTrimResult(rawWorld, hit, visibleEntities);
      if (res) {
        const nextEntities = entities
          .filter((e) => e.id !== hit.id)
          .concat(res.replacementEntities);
        onUpdateEntities(nextEntities);
        onLogCommand(
          `TRIM 已成功剪切 ${hit.type === 'circle' ? '圓形 (轉為圓弧)' : hit.type === 'arc' ? '三點圓弧' : '線段圖元'}`,
          'success'
        );
      } else {
        onLogCommand(
          hit.type === 'circle'
            ? '剪切圓形需至少與其他圖元有 2 個交點才能切除區段'
            : '無法剪切此圖元，請確認圖元有相交邊界',
          'error'
        );
      }
      return;
    }

    // 4. Check if in EXTEND (延伸 EX — 支援點選兩個線段互相延伸，或延伸至既有邊界) mode
    if (activeTool === 'extend') {
      const hitTol = 12 / zoom;
      const hit = [...visibleEntities]
        .reverse()
        .find((ent) => isPointNearEntity(rawWorld, ent, hitTol));
      if (!hit) {
        if (extendFirstPick) {
          setExtendFirstPick(null);
          onSelectChange([]);
          onLogCommand(
            'EXTEND 已取消第一條線段選擇 — 請重新點選第一個線段',
            'info'
          );
        } else {
          onLogCommand(
            'EXTEND 請依序點選兩個線段以互相延伸至交點（或點選同一線段兩次直接延伸至最近邊界）',
            'info'
          );
        }
        return;
      }

      if (!extendFirstPick) {
        setExtendFirstPick({ entityId: hit.id, clickPt: rawWorld });
        onSelectChange([hit.id]);
        onLogCommand(
          `EXTEND 已點選第一條線段 (${hit.type.toUpperCase()}) — 請點選第二條線段以互相延伸至交點（或再點一次此線段延伸至最近邊界）`,
          'info'
        );
        return;
      }

      // If user clicked the SAME entity again -> single-line extend to nearest boundary
      if (hit.id === extendFirstPick.entityId) {
        const res = computeExtendResult(rawWorld, hit, visibleEntities);
        if (res) {
          const nextEntities = entities.map((e) =>
            e.id === hit.id ? res.updatedEntity : e
          );
          onUpdateEntities(nextEntities);
          setExtendFirstPick(null);
          onSelectChange([]);
          onLogCommand(
            `EXTEND 已成功延伸圖元至交界處 (延伸 +${dist(res.extensionSegment[0], res.extensionSegment[1]).toFixed(1)} mm)`,
            'success'
          );
        } else {
          onLogCommand(
            'EXTEND 此線段前方無既有相交邊界，請點選另一條線段以互相延伸接合！',
            'info'
          );
        }
        return;
      }

      // User clicked a SECOND line segment -> mutually extend both segments to their intersection!
      const firstEnt = entities.find((e) => e.id === extendFirstPick.entityId);
      if (firstEnt) {
        const mutualRes = computeMutualExtendResult(
          firstEnt,
          extendFirstPick.clickPt,
          hit,
          rawWorld
        );
        if (mutualRes) {
          const updateMap = new Map(
            mutualRes.updatedEntities.map((u) => [u.id, u])
          );
          const nextEntities = entities.map((e) => updateMap.get(e.id) || e);
          onUpdateEntities(nextEntities);
          setExtendFirstPick(null);
          onSelectChange([]);
          onLogCommand(
            `EXTEND 已成功將兩個線段互相延伸接合於交點 (${mutualRes.intersectionPoint.x.toFixed(1)}, ${mutualRes.intersectionPoint.y.toFixed(1)})！`,
            'success'
          );
          return;
        }
      }

      // If parallel or cannot intersect, switch first pick to the newly clicked entity
      setExtendFirstPick({ entityId: hit.id, clickPt: rawWorld });
      onSelectChange([hit.id]);
      onLogCommand(
        'EXTEND 兩線段平行無法相交，已改選目前線段作為第一條線段',
        'error'
      );
      return;
    }

    // 5. Check if in JOIN (組裝圖元 J) mode
    if (activeTool === 'join') {
      const hitTol = 10 / zoom;
      const hit = [...visibleEntities]
        .reverse()
        .find((ent) => isPointNearEntity(rawWorld, ent, hitTol));
      if (hit) {
        if (selectedIds.includes(hit.id)) {
          onSelectChange(selectedIds.filter((id) => id !== hit.id));
        } else {
          onSelectChange([...selectedIds, hit.id]);
        }
        onLogCommand(
          `JOIN 已選取 ${selectedIds.includes(hit.id) ? selectedIds.length - 1 : selectedIds.length + 1} 個圖元 — 按空白鍵或 Enter 保留原位置組裝為單一物件`,
          'info'
        );
      }
      return;
    }

    // 6. Check if in OFFSET mode (支援同時偏移所有選取的圖形!)
    if (activeTool === 'offset') {
      if (selectionBoxStart) {
        const isCrossing = rawWorld.x < selectionBoxStart.x;
        const boxedIds = visibleEntities
          .filter((ent) =>
            isEntityInSelectionBox(
              ent,
              selectionBoxStart,
              rawWorld,
              isCrossing
            )
          )
          .map((ent) => ent.id);
        const merged = e.shiftKey
          ? Array.from(new Set([...selectedIds, ...boxedIds]))
          : boxedIds;
        onSelectChange(merged);
        setSelectionBoxStart(null);
        onLogCommand(
          `OFFSET 已框選 ${merged.length} 個圖形 — 請點選要偏移的一側，或輸入距離按空白鍵/Enter`,
          'info'
        );
        return;
      }

      const hitTol = 10 / zoom;
      const hit = [...visibleEntities]
        .reverse()
        .find((ent) => isPointNearEntity(rawWorld, ent, hitTol));

      if (selectedIds.length === 0 || e.shiftKey) {
        if (hit) {
          const nextIds = e.shiftKey
            ? selectedIds.includes(hit.id)
              ? selectedIds.filter((id) => id !== hit.id)
              : [...selectedIds, hit.id]
            : [hit.id];
          onSelectChange(nextIds);
          onLogCommand(
            `OFFSET 已選取 ${nextIds.length} 個圖形（可按 TAB 選取相連/全部線段，或按住 Shift 加選）— 請點選要偏移的一側 (目前距離 = ${offsetDistance} mm)`,
            'info'
          );
        } else if (!e.shiftKey) {
          setSelectionBoxStart(rawWorld);
        }
      } else {
        const selectedEnts = entities.filter((ent) =>
          selectedIds.includes(ent.id)
        );
        const effectiveOffset =
          dynValue.trim() !== '' && !isNaN(parseFloat(dynValue))
            ? Math.max(0.01, parseFloat(dynValue))
            : offsetDistance;
        if (effectiveOffset !== offsetDistance) {
          onChangeOffsetDistance(effectiveOffset);
        }
        const newEnts = offsetSelectedEntities(
          selectedEnts,
          effectiveWorld,
          effectiveOffset,
          `off_${Date.now()}`
        );
        if (newEnts.length > 0) {
          onUpdateEntities([...entities, ...newEnts]);
          onSelectChange(newEnts.map((ent) => ent.id));
          setDynValue('');
          onLogCommand(
            `OFFSET 已同時偏移複製 ${newEnts.length} 個選取圖形 (距離 ${effectiveOffset} mm)`,
            'success'
          );
        } else {
          onLogCommand('OFFSET 偏移距離過大或選取物件不支援向內偏移', 'error');
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
      if (dragPreviewRef.current) {
        onUpdateEntities(dragPreviewRef.current);
      }
      dragPreviewRef.current = null;
      setDragPreviewEntities(null);
      setActiveGrip(null);
      setDimAlignGuide(null);
      onLogCommand('掣點編輯已套用', 'success');
    }
    if (activeEntityDrag) {
      if (dragPreviewRef.current) {
        onUpdateEntities(dragPreviewRef.current);
        onLogCommand('已拖曳移動選取圖元', 'success');
      }
      dragPreviewRef.current = null;
      setDragPreviewEntities(null);
      setActiveEntityDrag(null);
    }
    if (activeTool === 'pdfWindow' && drawingPoints.length === 1) {
      const p1 = drawingPoints[0];
      const rwScreen = Math.abs(cursorWorld.x - p1.x) * zoom;
      const rhScreen = Math.abs(cursorWorld.y - p1.y) * zoom;
      if (rwScreen > 14 && rhScreen > 14) {
        const minX = Math.min(p1.x, cursorWorld.x);
        const maxX = Math.max(p1.x, cursorWorld.x);
        const minY = Math.min(p1.y, cursorWorld.y);
        const maxY = Math.max(p1.y, cursorWorld.y);
        setDrawingPoints([]);
        onToolComplete();
        onPdfWindowSelected?.({ minX, minY, maxX, maxY });
      }
    }
  };

  // Touch Handlers
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
        350,
        Math.max(0.015, touchPinchRef.current.initialZoom * scale)
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

  // Mouse Wheel Zoom (workspace zoom increased 10x up to 350x!)
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const nextZoom = Math.min(350, Math.max(0.015, zoom * zoomFactor));

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

    // 2. Render Calibrated Coordinate Grid (supports 10x expanded workspace & micro-zoom up to 350x)
    if (settings.grid) {
      let minorStep = 10;
      if (zoom < 0.05) minorStep = 500;
      else if (zoom < 0.15) minorStep = 200;
      else if (zoom < 0.4) minorStep = 50;
      else if (zoom < 0.8) minorStep = 20;
      else if (zoom > 120) minorStep = 0.1;
      else if (zoom > 35) minorStep = 0.5;
      else if (zoom > 10) minorStep = 1;
      else if (zoom > 4) minorStep = 5;

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

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
      const maxGridLines = 400;
      let countX = 0;
      for (
        let x = startX;
        x <= endX && countX < maxGridLines;
        x += minorStep, countX++
      ) {
        if (Math.abs(x / majorStep - Math.round(x / majorStep)) < 1e-3)
          continue;
        const sx = Math.round(worldToScreen(x, 0).x) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, canvasSize.height);
      }
      let countY = 0;
      for (
        let y = startY;
        y <= endY && countY < maxGridLines;
        y += minorStep, countY++
      ) {
        if (Math.abs(y / majorStep - Math.round(y / majorStep)) < 1e-3)
          continue;
        const sy = Math.round(worldToScreen(0, y).y) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(canvasSize.width, sy);
      }
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.13)';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.42)';
      ctx.font = '10px "JetBrains Mono", monospace';
      const labelDecimals = minorStep < 1 ? 1 : 0;
      let mCountX = 0;
      for (
        let x = Math.floor(topLeftWorld.x / majorStep) * majorStep;
        x <= endX && mCountX < 120;
        x += majorStep, mCountX++
      ) {
        if (Math.abs(x) < 1e-4) continue;
        const sx = Math.round(worldToScreen(x, 0).x) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, canvasSize.height);
        ctx.fillText(x.toFixed(labelDecimals), sx + 4, 14);
      }
      let mCountY = 0;
      for (
        let y = Math.floor(bottomRightWorld.y / majorStep) * majorStep;
        y <= endY && mCountY < 120;
        y += majorStep, mCountY++
      ) {
        if (Math.abs(y) < 1e-4) continue;
        const sy = Math.round(worldToScreen(0, y).y) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(canvasSize.width, sy);
        ctx.fillText(y.toFixed(labelDecimals), 6, sy - 4);
      }
      ctx.stroke();

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

    // 3. Helper to render a single CAD Entity (including composite GroupEntity)
    const layerMap = new Map(layers.map((l) => [l.id, l]));

    const drawEntity = (
      ent: CadEntity,
      overrideColor?: string,
      isSelected = false,
      isHovered = false
    ) => {
      if (ent.type === 'group') {
        for (const child of ent.children) {
          drawEntity(child, overrideColor, isSelected, isHovered);
        }
        if (isSelected || isHovered) {
          const b = getEntityBounds(ent);
          const sMin = worldToScreen(b.minX, b.maxY);
          const sMax = worldToScreen(b.maxX, b.minY);
          ctx.save();
          ctx.strokeStyle = isSelected
            ? 'rgba(56, 189, 248, 0.55)'
            : 'rgba(125, 211, 252, 0.4)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(
            sMin.x - 4,
            sMin.y - 4,
            sMax.x - sMin.x + 8,
            sMax.y - sMin.y + 8
          );
          ctx.restore();
        }
        return;
      }

      const wallLayer =
        layerMap.get('WALL') ||
        layers.find(
          (l) => l.name.includes('建築主牆') || l.name.includes('輪廓')
        );
      const layer =
        (ent.type === 'hatch' && wallLayer
          ? wallLayer
          : layerMap.get(ent.layerId)) || layers[0];
      if (!layer || !layer.visible) return;

      const color =
        overrideColor ||
        ent.color ||
        (ent.type === 'hatch' && wallLayer ? wallLayer.color : layer.color);
      const lineType =
        ent.lineType ||
        (ent.type === 'hatch' && wallLayer
          ? wallLayer.lineType
          : layer.lineType);
      const rawWeight =
        ent.lineWeight ||
        (ent.type === 'hatch' && wallLayer
          ? wallLayer.lineWeight
          : layer.lineWeight) ||
        0.25;
      const baseWidth = settings.showLineWeight
        ? Math.max(1.2, rawWeight * 4.5)
        : 1.5;

      const hoverStroke =
        activeTool === 'erase' && isHovered ? '#F43F5E' : '#7DD3FC';

      ctx.save();
      ctx.strokeStyle = isSelected ? '#38BDF8' : isHovered ? hoverStroke : color;
      ctx.fillStyle = isSelected ? '#38BDF8' : isHovered ? hoverStroke : color;
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

          // Always render the 3 defining points (P1, P2, P3) on 3-point arcs (shrunk by half)
          const [p1, p2, p3] = getArcThreePoints(ent);
          const sp1 = worldToScreen(p1.x, p1.y);
          const sp2 = worldToScreen(p2.x, p2.y);
          const sp3 = worldToScreen(p3.x, p3.y);
          ctx.setLineDash([]);
          const dotRadius = isSelected || isHovered ? 1.9 : 1.3;
          [
            { pt: sp1, fill: '#10B981', tag: 'P1' },
            { pt: sp2, fill: '#FBBF24', tag: 'P2' },
            { pt: sp3, fill: '#F43F5E', tag: 'P3' },
          ].forEach(({ pt, fill, tag }) => {
            ctx.beginPath();
            ctx.fillStyle = fill;
            ctx.arc(pt.x, pt.y, dotRadius, 0, Math.PI * 2);
            ctx.fill();
            if (isSelected || isHovered) {
              ctx.font = 'bold 9px "JetBrains Mono", monospace';
              ctx.fillText(tag, pt.x + 5, pt.y - 4);
            }
          });
          break;
        }
        case 'dimension': {
          ctx.setLineDash([]);
          const {
            dimP1,
            dimP2,
            mid,
            length,
            isDiameter,
            isRadius,
            center,
            leaderOutside,
            leaderElbow,
            leaderLanding,
          } = getDimensionLinePoints(ent);
          const sp1 = worldToScreen(ent.p1.x, ent.p1.y);
          const sp2 = worldToScreen(ent.p2.x, ent.p2.y);
          const sd1 = worldToScreen(dimP1.x, dimP1.y);
          const sd2 = worldToScreen(dimP2.x, dimP2.y);
          const smid = worldToScreen(mid.x, mid.y);

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

          if (isRadius) {
            // ISO 129-1 / CNS Radius Dimension (R 半徑標註) Rendering
            if (center) {
              const sc = worldToScreen(center.x, center.y);
              ctx.save();
              ctx.lineWidth = 1;
              ctx.globalAlpha = 0.65;
              ctx.beginPath();
              ctx.moveTo(sc.x - 4.5, sc.y);
              ctx.lineTo(sc.x + 4.5, sc.y);
              ctx.moveTo(sc.x, sc.y - 4.5);
              ctx.lineTo(sc.x, sc.y + 4.5);
              ctx.stroke();
              ctx.restore();
            }

            ctx.globalAlpha = 1;
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            ctx.moveTo(sd1.x, sd1.y);
            ctx.lineTo(sd2.x, sd2.y);
            if (leaderOutside && leaderElbow && leaderLanding) {
              const sElbow = worldToScreen(leaderElbow.x, leaderElbow.y);
              const sLanding = worldToScreen(leaderLanding.x, leaderLanding.y);
              ctx.moveTo(sd2.x, sd2.y);
              ctx.lineTo(sElbow.x, sElbow.y);
              ctx.lineTo(sLanding.x, sLanding.y);
            }
            ctx.stroke();

            // Single arrow at the arc circumference pointing toward the arc
            drawArrow(sd2, ang);
          } else if (isDiameter) {
            // ISO 129-1 / CNS International Standard Circle Diameter Dimension Rendering
            if (center) {
              const sc = worldToScreen(center.x, center.y);
              ctx.save();
              ctx.lineWidth = 1;
              ctx.globalAlpha = 0.65;
              ctx.beginPath();
              ctx.moveTo(sc.x - 5, sc.y);
              ctx.lineTo(sc.x + 5, sc.y);
              ctx.moveTo(sc.x, sc.y - 5);
              ctx.lineTo(sc.x, sc.y + 5);
              ctx.stroke();
              ctx.restore();
            }

            ctx.globalAlpha = 1;
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            ctx.moveTo(sd1.x, sd1.y);
            ctx.lineTo(sd2.x, sd2.y);
            if (leaderOutside && leaderElbow && leaderLanding) {
              const sElbow = worldToScreen(leaderElbow.x, leaderElbow.y);
              const sLanding = worldToScreen(leaderLanding.x, leaderLanding.y);
              ctx.moveTo(sd2.x, sd2.y);
              ctx.lineTo(sElbow.x, sElbow.y);
              ctx.lineTo(sLanding.x, sLanding.y);
            }
            ctx.stroke();

            drawArrow(sd1, ang + Math.PI);
            drawArrow(sd2, ang);
          } else {
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

            drawArrow(sd1, ang + Math.PI);
            drawArrow(sd2, ang);
          }

          const baseFontSize = ent.fontSize || 11;
          const fontPx = Math.max(8, Math.round(baseFontSize));
          const tolFontPx = Math.max(7, Math.round(fontPx * 0.72));
          const formatted = formatDimensionLabel(ent, length);

          ctx.font = `600 ${fontPx}px "JetBrains Mono", monospace`;
          const mainW = ctx.measureText(formatted.mainText).width;

          let symW = 0;
          let devW = 0;
          if (formatted.symmetricText) {
            ctx.font = `600 ${Math.max(8, Math.round(fontPx * 0.88))}px "JetBrains Mono", monospace`;
            symW = ctx.measureText(` ${formatted.symmetricText}`).width;
          } else if (formatted.upperText && formatted.lowerText) {
            ctx.font = `600 ${tolFontPx}px "JetBrains Mono", monospace`;
            devW =
              Math.max(
                ctx.measureText(formatted.upperText).width,
                ctx.measureText(formatted.lowerText).width
              ) + 6;
          }

          const totalW = mainW + symW + devW;
          const boxH =
            formatted.upperText && formatted.lowerText
              ? Math.max(fontPx + 8, tolFontPx * 2 + 6)
              : fontPx + 6;

          ctx.fillStyle = '#090D14';
          ctx.fillRect(
            smid.x - totalW / 2 - 4,
            smid.y - boxH / 2,
            totalW + 8,
            boxH
          );

          const textColor = isSelected ? '#38BDF8' : color;
          ctx.fillStyle = textColor;
          ctx.textBaseline = 'middle';

          const startX = smid.x - totalW / 2;
          ctx.font = `600 ${fontPx}px "JetBrains Mono", monospace`;
          ctx.textAlign = 'left';
          ctx.fillText(formatted.mainText, startX, smid.y);

          if (formatted.symmetricText) {
            ctx.font = `600 ${Math.max(8, Math.round(fontPx * 0.88))}px "JetBrains Mono", monospace`;
            ctx.fillText(
              ` ${formatted.symmetricText}`,
              startX + mainW,
              smid.y
            );
          } else if (formatted.upperText && formatted.lowerText) {
            ctx.font = `600 ${tolFontPx}px "JetBrains Mono", monospace`;
            ctx.fillText(
              formatted.upperText,
              startX + mainW + 4,
              smid.y - tolFontPx * 0.52
            );
            ctx.fillText(
              formatted.lowerText,
              startX + mainW + 4,
              smid.y + tolFontPx * 0.52
            );
          }
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
        case 'hatch': {
          ctx.setLineDash([]);
          ctx.lineWidth = isSelected || isHovered ? baseWidth + 0.8 : baseWidth;
          const hatchSegs = getHatchSegments(ent);
          if (hatchSegs.length > 0) {
            ctx.beginPath();
            for (const [p1, p2] of hatchSegs) {
              const s1 = worldToScreen(p1.x, p1.y);
              const s2 = worldToScreen(p2.x, p2.y);
              ctx.moveTo(s1.x, s1.y);
              ctx.lineTo(s2.x, s2.y);
            }
            ctx.stroke();
          }
          if (isSelected || isHovered) {
            ctx.save();
            ctx.setLineDash([4, 3]);
            ctx.lineWidth = 1.2;
            if (
              ent.boundaryType === 'circle' &&
              ent.center &&
              ent.radius
            ) {
              const sc = worldToScreen(ent.center.x, ent.center.y);
              ctx.beginPath();
              ctx.arc(sc.x, sc.y, Math.max(1, ent.radius * zoom), 0, Math.PI * 2);
              ctx.stroke();
            } else if (ent.points && ent.points.length >= 3) {
              ctx.beginPath();
              ent.points.forEach((pt, idx) => {
                const sp = worldToScreen(pt.x, pt.y);
                if (idx === 0) ctx.moveTo(sp.x, sp.y);
                else ctx.lineTo(sp.x, sp.y);
              });
              ctx.closePath();
              ctx.stroke();
            }
            ctx.restore();
          }
          break;
        }
      }
      ctx.restore();
    };

    const renderedEntities = dragPreviewEntities || entities;
    for (const ent of renderedEntities) {
      const isSelected = selectedIds.includes(ent.id);
      const isHovered = hoveredEntityId === ent.id;
      drawEntity(ent, undefined, isSelected, isHovered);
    }

    // 4. Render Live Trim (including Circles & 3-Point Arcs!) / Extend / Offset Previews
    const visibleLayerIds = new Set(
      layers.filter((l) => l.visible && !l.locked).map((l) => l.id)
    );
    const visibleEntities = entities.filter((e) =>
      visibleLayerIds.has(e.layerId)
    );

    if (activeTool === 'trim' && hoveredEntityId) {
      const hoveredEnt = visibleEntities.find((e) => e.id === hoveredEntityId);
      if (hoveredEnt) {
        const trimRes = computeTrimResult(
          cursorWorld,
          hoveredEnt,
          visibleEntities
        );
        if (trimRes) {
          ctx.save();
          ctx.strokeStyle = '#F43F5E';
          ctx.lineWidth = 3.5;
          ctx.setLineDash([6, 4]);
          if (trimRes.cutSegment) {
            const s1 = worldToScreen(
              trimRes.cutSegment[0].x,
              trimRes.cutSegment[0].y
            );
            const s2 = worldToScreen(
              trimRes.cutSegment[1].x,
              trimRes.cutSegment[1].y
            );
            ctx.beginPath();
            ctx.moveTo(s1.x, s1.y);
            ctx.lineTo(s2.x, s2.y);
            ctx.stroke();
          } else if (trimRes.cutArc) {
            const sc = worldToScreen(
              trimRes.cutArc.center.x,
              trimRes.cutArc.center.y
            );
            ctx.beginPath();
            ctx.arc(
              sc.x,
              sc.y,
              Math.max(1, trimRes.cutArc.radius * zoom),
              -trimRes.cutArc.endAngle,
              -trimRes.cutArc.startAngle
            );
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    }

    if (activeTool === 'extend') {
      if (extendFirstPick && hoveredEntityId) {
        const firstEnt = visibleEntities.find(
          (e) => e.id === extendFirstPick.entityId
        );
        const hoveredEnt = visibleEntities.find(
          (e) => e.id === hoveredEntityId
        );
        if (firstEnt && hoveredEnt && firstEnt.id !== hoveredEnt.id) {
          const mutualRes = computeMutualExtendResult(
            firstEnt,
            extendFirstPick.clickPt,
            hoveredEnt,
            cursorWorld
          );
          if (mutualRes) {
            ctx.save();
            ctx.strokeStyle = '#10B981';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([6, 4]);
            for (const [pA, pB] of mutualRes.extensionSegments) {
              const s1 = worldToScreen(pA.x, pA.y);
              const s2 = worldToScreen(pB.x, pB.y);
              ctx.beginPath();
              ctx.moveTo(s1.x, s1.y);
              ctx.lineTo(s2.x, s2.y);
              ctx.stroke();
            }
            const sInt = worldToScreen(
              mutualRes.intersectionPoint.x,
              mutualRes.intersectionPoint.y
            );
            ctx.setLineDash([]);
            ctx.fillStyle = '#10B981';
            ctx.beginPath();
            ctx.arc(sInt.x, sInt.y, 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.font = 'bold 10px "JetBrains Mono", monospace';
            ctx.fillText('互相延伸交點', sInt.x + 8, sInt.y - 6);
            ctx.restore();
          }
        } else if (hoveredEnt) {
          const extRes = computeExtendResult(
            cursorWorld,
            hoveredEnt,
            visibleEntities
          );
          if (extRes) {
            const s1 = worldToScreen(
              extRes.extensionSegment[0].x,
              extRes.extensionSegment[0].y
            );
            const s2 = worldToScreen(
              extRes.extensionSegment[1].x,
              extRes.extensionSegment[1].y
            );
            ctx.save();
            ctx.strokeStyle = '#10B981';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(s1.x, s1.y);
            ctx.lineTo(s2.x, s2.y);
            ctx.stroke();
            ctx.fillStyle = '#10B981';
            ctx.beginPath();
            ctx.arc(s2.x, s2.y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      } else if (hoveredEntityId) {
        const hoveredEnt = visibleEntities.find(
          (e) => e.id === hoveredEntityId
        );
        if (hoveredEnt) {
          const extRes = computeExtendResult(
            cursorWorld,
            hoveredEnt,
            visibleEntities
          );
          if (extRes) {
            const s1 = worldToScreen(
              extRes.extensionSegment[0].x,
              extRes.extensionSegment[0].y
            );
            const s2 = worldToScreen(
              extRes.extensionSegment[1].x,
              extRes.extensionSegment[1].y
            );
            ctx.save();
            ctx.strokeStyle = '#10B981';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(s1.x, s1.y);
            ctx.lineTo(s2.x, s2.y);
            ctx.stroke();
            ctx.fillStyle = '#10B981';
            ctx.beginPath();
            ctx.arc(s2.x, s2.y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }
    }

    if (
      (activeTool === 'chamfer' || activeTool === 'fillet') &&
      cornerFirstPick &&
      hoveredEntityId
    ) {
      const firstEnt = visibleEntities.find(
        (e) => e.id === cornerFirstPick.entityId
      );
      const hoveredEnt = visibleEntities.find((e) => e.id === hoveredEntityId);
      if (firstEnt && hoveredEnt) {
        const previewRes =
          activeTool === 'chamfer'
            ? computeChamferResult(
                firstEnt,
                cornerFirstPick.clickPt,
                hoveredEnt,
                cursorWorld,
                chamferDistance
              )
            : computeFilletResult(
                firstEnt,
                cornerFirstPick.clickPt,
                hoveredEnt,
                cursorWorld,
                filletRadius
              );
        if (previewRes) {
          ctx.save();
          // Draw trimmed corner segments in dashed rose
          ctx.strokeStyle = '#F43F5E';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 4]);
          for (const [pA, pB] of previewRes.trimmedSegments) {
            const s1 = worldToScreen(pA.x, pA.y);
            const s2 = worldToScreen(pB.x, pB.y);
            ctx.beginPath();
            ctx.moveTo(s1.x, s1.y);
            ctx.lineTo(s2.x, s2.y);
            ctx.stroke();
          }

          // Draw new chamfer line or fillet arc in bright emerald/sky
          ctx.setLineDash([]);
          ctx.strokeStyle = '#10B981';
          ctx.lineWidth = 3;
          if (previewRes.cornerEntity?.type === 'line') {
            const s1 = worldToScreen(
              previewRes.cornerEntity.p1.x,
              previewRes.cornerEntity.p1.y
            );
            const s2 = worldToScreen(
              previewRes.cornerEntity.p2.x,
              previewRes.cornerEntity.p2.y
            );
            ctx.beginPath();
            ctx.moveTo(s1.x, s1.y);
            ctx.lineTo(s2.x, s2.y);
            ctx.stroke();
          } else if (previewRes.cornerEntity?.type === 'arc') {
            const sc = worldToScreen(
              previewRes.cornerEntity.center.x,
              previewRes.cornerEntity.center.y
            );
            ctx.beginPath();
            ctx.arc(
              sc.x,
              sc.y,
              Math.max(1, previewRes.cornerEntity.radius * zoom),
              -previewRes.cornerEntity.endAngle,
              -previewRes.cornerEntity.startAngle
            );
            ctx.stroke();
          }

          const sInt = worldToScreen(
            previewRes.intersectionPoint.x,
            previewRes.intersectionPoint.y
          );
          ctx.fillStyle = '#10B981';
          ctx.font = 'bold 11px "JetBrains Mono", monospace';
          ctx.fillText(
            activeTool === 'chamfer'
              ? `倒角 D=${chamferDistance}mm`
              : `導圓角 R=${filletRadius}mm`,
            sInt.x + 10,
            sInt.y - 8
          );
          ctx.restore();
        }
      }
    }

    if (activeTool === 'offset' && selectedIds.length > 0) {
      const selectedEnts = entities.filter((e) => selectedIds.includes(e.id));
      const effectiveOffset =
        dynValue.trim() !== '' && !isNaN(parseFloat(dynValue))
          ? Math.max(0.01, parseFloat(dynValue))
          : offsetDistance;
      const previewEnts = offsetSelectedEntities(
        selectedEnts,
        cursorWorld,
        effectiveOffset,
        'preview_off'
      );
      for (const previewOff of previewEnts) {
        drawEntity({ ...previewOff, lineType: 'dashed' }, '#FBBF24');
      }
    }

    // Live 45° Hatch preview in 'hatch' mode (supports both Smart Fill and Select Range!)
    if (activeTool === 'hatch' && drawingPoints.length === 0) {
      const effectivePitch =
        dynValue.trim() !== '' && !isNaN(parseFloat(dynValue))
          ? Math.max(0.5, parseFloat(dynValue))
          : Math.max(0.5, hatchPitch);

      if (hatchMode === 'selectRange' && selectedIds.length > 0) {
        const selectedEnts = entities.filter(
          (e) => selectedIds.includes(e.id) && e.type !== 'hatch'
        );
        const previewHatches = createHatchFromEntities(
          selectedEnts,
          effectivePitch,
          wallLayerId,
          true
        );
        for (const ph of previewHatches) {
          drawEntity(ph, 'rgba(16, 185, 129, 0.78)');
        }
      } else if (hatchMode === 'smart') {
        const smartPreview = findSmartHatchBoundaryAtPoint(
          cursorWorld,
          visibleEntities,
          effectivePitch,
          wallLayerId,
          12 / zoom
        );
        if (smartPreview) {
          drawEntity(smartPreview, 'rgba(16, 185, 129, 0.78)');
        }
      }
    }

    // Live Radius Dimension (R 半徑標註) preview when pendingRadiusDimArc is active
    if (activeTool === 'dimension' && pendingRadiusDimArc) {
      const previewRDim = createRadiusDimensionForArc(
        pendingRadiusDimArc,
        activeLayerId,
        defaultDimFontSize,
        cursorWorld
      );
      drawEntity(previewRDim, '#FBBF24');
    }

    // 5. Render Grip Handles for Selected Entities in Select Mode
    if (activeTool === 'select' && selectedIds.length > 0) {
      for (const ent of renderedEntities) {
        if (!selectedIds.includes(ent.id)) continue;
        const grips = getEntityGripHandles(ent);
        const halfSz = ent.type === 'arc' ? 2 : 4;
        const fullSz = halfSz * 2;
        for (const g of grips) {
          const sg = worldToScreen(g.point.x, g.point.y);
          ctx.save();
          ctx.fillStyle =
            activeGrip &&
            activeGrip.entityId === g.entityId &&
            activeGrip.gripIndex === g.gripIndex
              ? '#EF4444'
              : g.type === 'midpoint'
                ? '#FBBF24'
                : '#0284C7';
          ctx.strokeStyle = '#E0F2FE';
          ctx.lineWidth = 1;
          ctx.fillRect(sg.x - halfSz, sg.y - halfSz, fullSz, fullSz);
          ctx.strokeRect(sg.x - halfSz, sg.y - halfSz, fullSz, fullSz);
          ctx.restore();
        }
      }
    }

    // 6. Render Dimension Alignment Guide Line (標註尺寸相互對齊輔助線)
    if (dimAlignGuide) {
      const sA = worldToScreen(dimAlignGuide[0].x, dimAlignGuide[0].y);
      const sB = worldToScreen(dimAlignGuide[1].x, dimAlignGuide[1].y);
      ctx.save();
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(sA.x, sA.y);
      ctx.lineTo(sB.x, sB.y);
      ctx.stroke();

      const midG = midpoint(sA, sB);
      ctx.font = '600 10px "JetBrains Mono", monospace';
      const label = '標註線對齊 (Aligned)';
      const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(midG.x - tw / 2, midG.y - 20, tw, 16);
      ctx.fillStyle = '#38BDF8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, midG.x, midG.y - 12);
      ctx.restore();
    }

    // 7. Render Polar / Ortho Alignment Guide Line
    if (guideAngle !== null && drawingPoints.length > 0) {
      const anchor = drawingPoints[drawingPoints.length - 1];
      const sa = worldToScreen(anchor.x, anchor.y);
      const rad = -guideAngle * DEG_TO_RAD;
      ctx.save();
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(sa.x - Math.cos(rad) * 2000, sa.y - Math.sin(rad) * 2000);
      ctx.lineTo(sa.x + Math.cos(rad) * 2000, sa.y + Math.sin(rad) * 2000);
      ctx.stroke();
      ctx.restore();
    }

    // 8. Render Relative Distance Dashed Reference Lines (相對距離虛線 ΔX / ΔY) & Rubber-Band Preview
    if (drawingPoints.length > 0) {
      const p0 = drawingPoints[0];
      const pLast = drawingPoints[drawingPoints.length - 1];
      const s0 = worldToScreen(p0.x, p0.y);
      const sLast = worldToScreen(pLast.x, pLast.y);
      const sCur = worldToScreen(cursorWorld.x, cursorWorld.y);

      const dxWorld = cursorWorld.x - pLast.x;
      const dyWorld = cursorWorld.y - pLast.y;
      const cornerScreen = worldToScreen(cursorWorld.x, pLast.y);

      if (Math.abs(dxWorld) > 0.5 || Math.abs(dyWorld) > 0.5) {
        ctx.save();
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.font = '500 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (Math.abs(sCur.x - sLast.x) > 24) {
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.75)';
          ctx.beginPath();
          ctx.moveTo(sLast.x, sLast.y);
          ctx.lineTo(cornerScreen.x, cornerScreen.y);
          ctx.stroke();

          const midHx = (sLast.x + cornerScreen.x) / 2;
          const midHy = sLast.y + (sCur.y > sLast.y ? -12 : 12);
          const dxLabel = `ΔX: ${dxWorld >= 0 ? '+' : ''}${dxWorld.toFixed(1)}`;
          const tw = ctx.measureText(dxLabel).width + 8;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
          ctx.fillRect(midHx - tw / 2, midHy - 8, tw, 16);
          ctx.fillStyle = '#FDA4AF';
          ctx.fillText(dxLabel, midHx, midHy);
        }

        if (Math.abs(sCur.y - sLast.y) > 24) {
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.75)';
          ctx.beginPath();
          ctx.moveTo(cornerScreen.x, cornerScreen.y);
          ctx.lineTo(sCur.x, sCur.y);
          ctx.stroke();

          const midVx = cornerScreen.x + (sCur.x >= sLast.x ? 34 : -34);
          const midVy = (cornerScreen.y + sCur.y) / 2;
          const dyLabel = `ΔY: ${dyWorld >= 0 ? '+' : ''}${dyWorld.toFixed(1)}`;
          const tw = ctx.measureText(dyLabel).width + 8;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
          ctx.fillRect(midVx - tw / 2, midVy - 8, tw, 16);
          ctx.fillStyle = '#6EE7B7';
          ctx.fillText(dyLabel, midVx, midVy);
        }

        ctx.restore();
      }

      // Draw Active Tool Rubber-Band Geometry
      ctx.save();
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);

      if (activeTool === 'zoomWindow') {
        const rx = Math.min(s0.x, sCur.x);
        const ry = Math.min(s0.y, sCur.y);
        const rw = Math.abs(sCur.x - s0.x);
        const rh = Math.abs(sCur.y - s0.y);
        ctx.fillStyle = 'rgba(168, 85, 247, 0.16)';
        ctx.strokeStyle = '#C084FC';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeRect(rx, ry, rw, rh);
      } else if (activeTool === 'pdfWindow') {
        const rx = Math.min(s0.x, sCur.x);
        const ry = Math.min(s0.y, sCur.y);
        const rw = Math.abs(sCur.x - s0.x);
        const rh = Math.abs(sCur.y - s0.y);
        ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeRect(rx, ry, rw, rh);

        const wMm = Math.abs(cursorWorld.x - p0.x).toFixed(1);
        const hMm = Math.abs(cursorWorld.y - p0.y).toFixed(1);
        const badgeText = `PDF 匯出區域: ${wMm} × ${hMm} mm`;
        ctx.setLineDash([]);
        ctx.font = 'bold 11px "JetBrains Mono", "Noto Sans TC", monospace';
        const tw = ctx.measureText(badgeText).width + 16;
        const bx = rx + rw / 2 - tw / 2;
        const by = Math.max(24, ry - 26);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
        ctx.fillRect(bx, by, tw, 22);
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, tw, 22);
        ctx.fillStyle = '#FDE68A';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, rx + rw / 2, by + 11);
      } else if (activeTool === 'line' || activeTool === 'measure') {
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
        if (rectangleMode === 'center') {
          const oppositeScreen = worldToScreen(
            2 * p0.x - cursorWorld.x,
            2 * p0.y - cursorWorld.y
          );
          const rx = Math.min(oppositeScreen.x, sCur.x);
          const ry = Math.min(oppositeScreen.y, sCur.y);
          const rw = Math.abs(sCur.x - oppositeScreen.x);
          const rh = Math.abs(sCur.y - oppositeScreen.y);
          ctx.strokeRect(rx, ry, rw, rh);
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
          ctx.beginPath();
          ctx.moveTo(s0.x - 8, s0.y);
          ctx.lineTo(s0.x + 8, s0.y);
          ctx.moveTo(s0.x, s0.y - 8);
          ctx.lineTo(s0.x, s0.y + 8);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.strokeRect(
            Math.min(s0.x, sCur.x),
            Math.min(s0.y, sCur.y),
            Math.abs(sCur.x - s0.x),
            Math.abs(sCur.y - s0.y)
          );
        }
      } else if (activeTool === 'hatch') {
        const minX = Math.min(p0.x, cursorWorld.x);
        const maxX = Math.max(p0.x, cursorWorld.x);
        const minY = Math.min(p0.y, cursorWorld.y);
        const maxY = Math.max(p0.y, cursorWorld.y);
        ctx.strokeStyle = '#10B981';
        ctx.strokeRect(
          Math.min(s0.x, sCur.x),
          Math.min(s0.y, sCur.y),
          Math.abs(sCur.x - s0.x),
          Math.abs(sCur.y - s0.y)
        );
        if (maxX - minX >= 0.5 && maxY - minY >= 0.5) {
          const previewSegs = getHatchSegments({
            id: 'preview_hatch',
            type: 'hatch',
            layerId: activeLayerId,
            pitch: Math.max(0.5, hatchPitch),
            angle: 45,
            boundaryType: 'polygon',
            points: [
              { x: minX, y: minY },
              { x: maxX, y: minY },
              { x: maxX, y: maxY },
              { x: minX, y: maxY },
            ],
          });
          ctx.setLineDash([]);
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (const [hp1, hp2] of previewSegs) {
            const hs1 = worldToScreen(hp1.x, hp1.y);
            const hs2 = worldToScreen(hp2.x, hp2.y);
            ctx.moveTo(hs1.x, hs1.y);
            ctx.lineTo(hs2.x, hs2.y);
          }
          ctx.stroke();
        }
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
        // 3-Point Arc Preview with P1, P2, P3 point dots shrunk by half (r = 2.25)
        if (drawingPoints.length === 1) {
          ctx.beginPath();
          ctx.moveTo(s0.x, s0.y);
          ctx.lineTo(sCur.x, sCur.y);
          ctx.stroke();

          ctx.setLineDash([]);
          ctx.fillStyle = '#10B981';
          ctx.beginPath();
          ctx.arc(s0.x, s0.y, 2.25, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = 'bold 10px "JetBrains Mono", monospace';
          ctx.fillText('1.起點 P1', s0.x + 6, s0.y - 5);

          ctx.fillStyle = '#FBBF24';
          ctx.beginPath();
          ctx.arc(sCur.x, sCur.y, 2.25, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillText('2.第二點 P2', sCur.x + 6, sCur.y - 5);
        } else if (drawingPoints.length === 2) {
          const p1 = drawingPoints[0];
          const p2 = drawingPoints[1];
          const s2 = worldToScreen(p2.x, p2.y);

          const arcData = arcFromThreePoints(p1, p2, cursorWorld);
          if (arcData) {
            const sc = worldToScreen(arcData.center.x, arcData.center.y);
            ctx.beginPath();
            ctx.arc(
              sc.x,
              sc.y,
              Math.max(1, arcData.radius * zoom),
              -arcData.endAngle,
              -arcData.startAngle
            );
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.moveTo(s0.x, s0.y);
            ctx.lineTo(s2.x, s2.y);
            ctx.lineTo(sCur.x, sCur.y);
            ctx.stroke();
          }

          // Render the 3 numbered points P1, P2, P3 with half-size dots (r = 2.25)
          ctx.setLineDash([]);
          ctx.font = 'bold 10px "JetBrains Mono", monospace';

          ctx.fillStyle = '#10B981';
          ctx.beginPath();
          ctx.arc(s0.x, s0.y, 2.25, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillText('1.起點 P1', s0.x + 6, s0.y - 5);

          ctx.fillStyle = '#FBBF24';
          ctx.beginPath();
          ctx.arc(s2.x, s2.y, 2.25, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillText('2.第二點 P2', s2.x + 6, s2.y - 5);

          ctx.fillStyle = '#F43F5E';
          ctx.beginPath();
          ctx.arc(sCur.x, sCur.y, 2.25, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillText('3.終點 P3', sCur.x + 6, sCur.y - 5);
        }
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
          const p1 = drawingPoints[0];
          const p2 = drawingPoints[1];
          const midPt = midpoint(p1, p2);
          const halfLen = dist(p1, p2) / 2;
          const isDia = entities.some(
            (ent) =>
              ent.type === 'circle' &&
              dist(ent.center, midPt) <= Math.max(2, ent.radius * 0.08) &&
              Math.abs(ent.radius - halfLen) <= Math.max(2, ent.radius * 0.08)
          );
          drawEntity(
            {
              id: 'preview-dim',
              type: 'dimension',
              layerId: activeLayerId,
              dimMode: isDia ? 'diameter' : 'linear',
              precision: 2,
              p1,
              p2,
              offsetPoint: cursorWorld,
              fontSize: defaultDimFontSize,
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
        const currentSelected = entities.filter((ent) =>
          selectedIds.includes(ent.id)
        );
        const previewList =
          activeTool === 'copy' && currentSelected.length === 0
            ? copySourceEntities
            : currentSelected;
        for (const ent of previewList) {
          drawEntity(translateEntity(ent, dx, dy), '#FBBF24');
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

    // 9. Render Completed Measure Ruler Overlay
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

    // 10. Render Window / Crossing Selection Box
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

    // 11. Render OSNAP Marker
    if (activeSnap && activeSnap.type !== 'grid') {
      const sp = worldToScreen(activeSnap.point.x, activeSnap.point.y);
      ctx.save();
      ctx.strokeStyle =
        activeSnap.type === 'dimAlign' ? '#38BDF8' : '#10B981';
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
      } else if (
        activeSnap.type === 'center' ||
        activeSnap.type === 'dimAlign'
      ) {
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

    // 12. Render Authentic AutoCAD UCS Icon
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

    // 13. Render Full AutoCAD Crosshair Cursor + Pickbox
    if (!isPanning && activeTool !== 'pan') {
      const cx = mouseScreen.x;
      const cy = mouseScreen.y;
      ctx.save();
      ctx.strokeStyle =
        activeTool === 'erase'
          ? 'rgba(244, 63, 94, 0.85)'
          : 'rgba(226, 232, 240, 0.75)';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      const armLen = 32;
      ctx.beginPath();
      ctx.moveTo(cx - armLen, cy);
      ctx.lineTo(cx + armLen, cy);
      ctx.moveTo(cx, cy - armLen);
      ctx.lineTo(cx, cy + armLen);
      ctx.stroke();

      if (
        activeTool === 'select' ||
        activeTool === 'erase' ||
        activeTool === 'offset' ||
        activeTool === 'trim' ||
        activeTool === 'extend' ||
        activeTool === 'join'
      ) {
        ctx.strokeRect(cx - 4, cy - 4, 8, 8);
      }

      if (cursorPinnedToOrigin) {
        ctx.strokeStyle = '#FBBF24';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.fillStyle = '#FBBF24';
        ctx.fillText('原點 (0,0)', cx + 12, cy - 10);
      }
      ctx.restore();
    }
  }, [
    activeGrip,
    activeEntityDrag,
    activeLayerId,
    activeSnap,
    activeTool,
    canvasSize.height,
    canvasSize.width,
    cursorPinnedToOrigin,
    cursorWorld,
    defaultDimFontSize,
    dimAlignGuide,
    dragPreviewEntities,
    drawingPoints,
    dynValue,
    entities,
    extendFirstPick,
    guideAngle,
    hatchPitch,
    hoveredEntityId,
    isPanning,
    layers,
    measureResult,
    mouseScreen,
    offsetDistance,
    pan,
    polygonSides,
    rectangleMode,
    screenToWorld,
    selectedIds,
    selectionBoxStart,
    settings.grid,
    settings.showLineWeight,
    worldToScreen,
    zoom,
    copySourceEntities,
  ]);

  const anchorPoint =
    drawingPoints.length > 0 ? drawingPoints[drawingPoints.length - 1] : null;
  const liveDist = anchorPoint ? dist(anchorPoint, cursorWorld) : 0;
  const liveAngle = anchorPoint ? angleDegrees(anchorPoint, cursorWorld) : 0;
  const liveWidth = anchorPoint
    ? rectangleMode === 'center'
      ? Math.abs(cursorWorld.x - anchorPoint.x) * 2
      : Math.abs(cursorWorld.x - anchorPoint.x)
    : 0;
  const liveHeight = anchorPoint
    ? rectangleMode === 'center'
      ? Math.abs(cursorWorld.y - anchorPoint.y) * 2
      : Math.abs(cursorWorld.y - anchorPoint.y)
    : 0;

  const selectedEntities = entities.filter((e) => selectedIds.includes(e.id));
  const singleSelected =
    selectedEntities.length === 1 ? selectedEntities[0] : null;
  const selectedDims = selectedEntities.filter(
    (e): e is DimensionEntity => e.type === 'dimension'
  );

  const updateSingleEntity = (patch: Partial<CadEntity>) => {
    if (!singleSelected) return;
    onUpdateEntities(
      entities.map((e) =>
        e.id === singleSelected.id ? ({ ...e, ...patch } as CadEntity) : e
      )
    );
  };

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
          isPanning || activeTool === 'pan'
            ? 'cursor-grab active:cursor-grabbing'
            : 'cursor-none'
        }`}
      />

      {/* Responsive Non-Blocking Active Tool Banner */}
      {showGuideBanner ? (
        <div className="absolute top-2 left-2 right-2 z-20 flex justify-center pointer-events-none">
          <div className="pointer-events-auto max-w-full flex items-center gap-2 px-3 py-1 bg-slate-900/90 border border-slate-700/80 rounded-lg shadow-md text-[11px] sm:text-xs">
            <span className="font-semibold text-sky-300 whitespace-nowrap shrink-0">
              {activeTool === 'select' && '選取模式 (V)'}
              {activeTool === 'zoomWindow' && '窗選局部放大 (Z)'}
              {activeTool === 'pan' && '平移畫布 (H)'}
              {activeTool === 'line' && '畫直線 (L)'}
              {activeTool === 'dimension' && '標註尺寸 (D)'}
              {activeTool === 'polyline' && '聚合線 (P)'}
              {activeTool === 'rectangle' &&
                (rectangleMode === 'center'
                  ? '畫中心矩形 (R)'
                  : '畫轉角矩形 (R)')}
              {activeTool === 'circle' && '畫圓形 (C)'}
              {activeTool === 'arc' && '三點圓弧 (A)'}
              {activeTool === 'polygon' && `正 ${polygonSides} 邊形 (G)`}
              {activeTool === 'hatch' &&
                `45° 剖面填充 (BH - 建築主牆/輪廓層 PITCH ${hatchPitch}mm)`}
              {activeTool === 'chamfer' &&
                `倒角 (CHA - D=${chamferDistance}mm)`}
              {activeTool === 'fillet' &&
                `導圓角 (F - R=${filletRadius}mm)`}
              {activeTool === 'text' && '文字註解 (T)'}
              {activeTool === 'measure' && '測量距離 (K)'}
              {activeTool === 'erase' && '刪除圖元 (E)'}
              {activeTool === 'move' && '移動物件 (M)'}
              {activeTool === 'copy' && '連續複製 (CO)'}
              {activeTool === 'rotate' && '旋轉物件 (Q)'}
              {activeTool === 'mirror' && '對稱鏡射 (W)'}
              {activeTool === 'offset' &&
                `偏移複製 (O - ${offsetDistance}mm)`}
              {activeTool === 'trim' && '剪切圖元 (TR)'}
              {activeTool === 'extend' && '延伸圖元 (EX)'}
              {activeTool === 'join' && '組裝圖元 (J)'}
            </span>

            {activeTool === 'chamfer' && (
              <div className="flex items-center gap-1 bg-slate-950 px-1.5 py-0.5 rounded border border-sky-500/50 shrink-0 font-mono">
                <span className="text-[10px] text-sky-300 font-sans">
                  倒角距離 D:
                </span>
                <input
                  type="number"
                  min={0.1}
                  step="0.5"
                  value={chamferDistance}
                  onChange={(e) =>
                    onChangeChamferDistance(
                      Math.max(0.1, Number(e.target.value))
                    )
                  }
                  className="w-14 px-1 py-0 text-[10px] bg-slate-900 border border-sky-500/60 rounded text-sky-200"
                />
                <span className="text-[10px] text-slate-400">mm</span>
              </div>
            )}

            {activeTool === 'fillet' && (
              <div className="flex items-center gap-1.5 bg-slate-950 px-1.5 py-0.5 rounded border border-sky-500/50 shrink-0 font-mono">
                <span className="text-[10px] text-sky-300 font-sans">
                  圓角半徑 R:
                </span>
                <input
                  type="number"
                  min={0.1}
                  step="0.5"
                  value={filletRadius}
                  onChange={(e) =>
                    onChangeFilletRadius(Math.max(0.1, Number(e.target.value)))
                  }
                  className="w-14 px-1 py-0 text-[10px] bg-slate-900 border border-sky-500/60 rounded text-sky-200"
                />
                <span className="text-[10px] text-slate-400">mm</span>
                <button
                  type="button"
                  onClick={() => onChangeFilletAutoDim(!filletAutoDim)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-sans border transition-colors ${
                    filletAutoDim
                      ? 'bg-amber-500 text-slate-950 border-amber-300 font-semibold'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:text-white'
                  }`}
                >
                  {filletAutoDim ? '✓ 自動標註半徑R' : '自動標註半徑R'}
                </button>
              </div>
            )}

            {activeTool === 'hatch' && (
              <div className="flex items-center gap-1.5 bg-slate-950 px-1.5 py-0.5 rounded border border-emerald-500/50 shrink-0 font-mono">
                <div className="flex items-center bg-slate-900 rounded p-0.5 border border-slate-800 font-sans">
                  <button
                    type="button"
                    onClick={() => onChangeHatchMode('smart')}
                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                      hatchMode === 'smart'
                        ? 'bg-emerald-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    智慧填充輸入
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeHatchMode('selectRange')}
                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                      hatchMode === 'selectRange'
                        ? 'bg-emerald-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    選取範圍再執行
                  </button>
                </div>
                <span className="text-[10px] text-emerald-300 font-sans">
                  PITCH:
                </span>
                <input
                  type="number"
                  min={0.5}
                  max={200}
                  step="0.5"
                  value={hatchPitch}
                  onChange={(e) =>
                    onChangeHatchPitch(Math.max(0.5, Number(e.target.value)))
                  }
                  className="w-12 px-1 py-0 text-[10px] bg-slate-900 border border-emerald-500/60 rounded text-emerald-200"
                />
                <span className="text-[10px] text-slate-400">mm</span>
                {selectedIds.length > 0 && (
                  <button
                    type="button"
                    onClick={onHatchSelected}
                    className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-sans font-semibold"
                  >
                    執行填充 ({selectedIds.length}) [Enter]
                  </button>
                )}
              </div>
            )}

            {activeTool === 'rectangle' && (
              <div className="flex items-center gap-1 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-700 shrink-0">
                <button
                  type="button"
                  onClick={() => onChangeRectangleMode('corner')}
                  className={`px-1.5 py-0.5 rounded text-[10px] ${
                    rectangleMode === 'corner'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  轉角矩形
                </button>
                <button
                  type="button"
                  onClick={() => onChangeRectangleMode('center')}
                  className={`px-1.5 py-0.5 rounded text-[10px] ${
                    rectangleMode === 'center'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  中心矩形
                </button>
              </div>
            )}

            {activeTool === 'dimension' && (
              <div className="flex items-center gap-1 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-700 shrink-0">
                <span className="text-[10px] text-amber-300">字高:</span>
                <input
                  type="number"
                  min={6}
                  max={72}
                  value={defaultDimFontSize}
                  onChange={(e) =>
                    onChangeDefaultDimFontSize(
                      Math.max(6, Math.min(72, Number(e.target.value)))
                    )
                  }
                  className="w-10 px-1 py-0 text-[10px] font-mono bg-slate-900 border border-slate-700 rounded text-amber-200"
                />
              </div>
            )}

            {activeTool === 'move' && selectedIds.length > 0 && (
              <div className="flex items-center gap-1 bg-slate-950 px-1.5 py-0.5 rounded border border-sky-500/50 shrink-0 font-mono">
                <span className="text-[10px] text-sky-300 font-sans">
                  座標跳轉 X:
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={moveTargetInputX}
                  onChange={(e) => setMoveTargetInputX(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const tx = parseFloat(moveTargetInputX);
                      const ty = parseFloat(moveTargetInputY);
                      if (!isNaN(tx) && !isNaN(ty)) {
                        executeMoveToCoordinates(tx, ty);
                      }
                    }
                  }}
                  className="w-14 px-1 py-0 text-[10px] bg-slate-900 border border-slate-700 rounded text-sky-200"
                />
                <span className="text-[10px] text-sky-300 font-sans">Y:</span>
                <input
                  type="number"
                  step="0.01"
                  value={moveTargetInputY}
                  onChange={(e) => setMoveTargetInputY(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const tx = parseFloat(moveTargetInputX);
                      const ty = parseFloat(moveTargetInputY);
                      if (!isNaN(tx) && !isNaN(ty)) {
                        executeMoveToCoordinates(tx, ty);
                      }
                    }
                  }}
                  className="w-14 px-1 py-0 text-[10px] bg-slate-900 border border-slate-700 rounded text-sky-200"
                />
                <button
                  type="button"
                  onClick={() => {
                    const tx = parseFloat(moveTargetInputX);
                    const ty = parseFloat(moveTargetInputY);
                    if (!isNaN(tx) && !isNaN(ty)) {
                      executeMoveToCoordinates(tx, ty);
                    }
                  }}
                  className="px-1.5 py-0.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-[10px] font-sans font-medium"
                >
                  跳轉移動
                </button>
              </div>
            )}

            {activeTool === 'join' && selectedIds.length >= 2 && (
              <button
                type="button"
                onClick={onJoinSelected}
                className="flex items-center gap-1 px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-medium shrink-0"
              >
                <Combine className="w-3 h-3" />
                <span>確認組裝 ({selectedIds.length}) [空白鍵]</span>
              </button>
            )}

            <span className="text-slate-600 shrink-0">·</span>
            <span className="text-slate-300 truncate">
              {activeTool === 'zoomWindow' &&
                (drawingPoints.length === 0
                  ? '步驟 1：點選放大區域的第一個角點'
                  : '步驟 2：拉出放大框並點選對角點，立即局部放大！')}
              {activeTool === 'line' &&
                (drawingPoints.length === 0
                  ? '點選直線起點'
                  : '點選終點，或直接打字輸入長度後按「空白鍵 / Enter」確認')}
              {activeTool === 'arc' &&
                (drawingPoints.length === 0
                  ? '步驟 1/3：點選圓弧「1.起點 P1」'
                  : drawingPoints.length === 1
                    ? '步驟 2/3：點選圓弧通過的「2.第二點 P2」'
                    : '步驟 3/3：點選圓弧「3.終點 P3」完成三點圓弧')}
              {activeTool === 'rectangle' &&
                (drawingPoints.length === 0
                  ? rectangleMode === 'center'
                    ? '步驟 1：點選矩形的「中心點」'
                    : '步驟 1：點選矩形的「第一個轉角點」'
                  : '步驟 2：點選角點或輸入寬[Tab]高後按「空白鍵 / Enter」')}
              {activeTool === 'dimension' &&
                (drawingPoints.length === 0
                  ? '直接點擊圓周可建立 ISO 國際規範 Ø 直徑標註，或點選第一端點建立線性標註'
                  : drawingPoints.length === 1
                    ? '點選第二個標註端點'
                    : '移動決定標註線位置（圓外自動產生國際規範水平折線引線，靠近既有標註自動對齊）')}
              {activeTool === 'move' &&
                (drawingPoints.length === 0
                  ? '點選基準點，或直接輸入 X,Y 座標（亦可使用上方/右側座標跳轉欄）按空白鍵/Enter 跳轉移動'
                  : '移動指定目標位置點，或直接輸入 X,Y 座標按「空白鍵 / Enter」')}
              {activeTool === 'erase' &&
                '直接點選畫布上的任何圖元即可立即刪除（或按 ESC 返回選取）'}
              {activeTool === 'trim' &&
                '支援剪切直線、矩形、圓形與三點圓弧！將游標移至圖元預覽紅虛線後點擊左鍵切除'}
              {activeTool === 'extend' &&
                (extendFirstPick
                  ? '已選取第一條線段 — 請點選第二條線段以互相延伸接合至交點（或再點一次延伸至最近邊界）'
                  : '依序點選兩個線段即可互相延伸至交點！（或點選同一線段兩次延伸至既有邊界）')}
              {activeTool === 'offset' &&
                '支援同時偏移選取的所有圖形（最小 0.01）！輸入距離按空白鍵/Enter 後點選要偏移的一側'}
              {activeTool === 'join' &&
                '點選 2 個以上圖元後按「空白鍵 / Enter」，保留原始位置組裝成單一物件'}
              {activeTool === 'hatch' &&
                '直接點選圓形、矩形、多邊形或封閉線段即可填充 45° 斜線（直接採用 A-WALL 建築主牆/輪廓圖層），可隨時調整 PITCH 間距'}
              {activeTool === 'chamfer' &&
                (cornerFirstPick
                  ? `已選取第一條邊 — 請移動預覽並點選相交的第二條邊建立倒角 (D=${chamferDistance}mm)`
                  : '依序點選兩條相交直線或矩形相鄰邊即可建立倒角（可直接輸入距離按空白鍵/Enter）')}
              {activeTool === 'fillet' &&
                (cornerFirstPick
                  ? `已選取第一條邊 — 請移動預覽並點選相交的第二條邊建立導圓角 (R=${filletRadius}mm)`
                  : '依序點選兩條相交直線或矩形相鄰邊即可建立導圓角（可直接輸入半徑按空白鍵/Enter）')}
              {activeTool === 'select' &&
                '點選或直接拖曳圖元移動；可在下方修改尺寸、設定正負公差（支援 0）與小數位數，或輸入 X,Y 座標跳轉'}
              {![
                'zoomWindow',
                'line',
                'arc',
                'rectangle',
                'dimension',
                'move',
                'erase',
                'trim',
                'extend',
                'offset',
                'join',
                'hatch',
                'chamfer',
                'fillet',
                'select',
              ].includes(activeTool) &&
                (drawingPoints.length === 0
                  ? '點選基準點開始（空白鍵/Enter 確認，Esc 返回）'
                  : '移動指定下一點或輸入數值按「空白鍵 / Enter」')}
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

      {/* Floating On-Canvas Quick Dimension & Action Bar when Entities are Selected */}
      {selectedEntities.length > 0 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 max-w-[96%] flex flex-wrap items-center gap-2 px-3 py-1.5 bg-slate-900/95 border border-sky-500/60 rounded-xl shadow-2xl text-xs font-mono">
          {singleSelected ? (
            <>
              <span className="font-sans font-semibold text-sky-300">
                {singleSelected.type === 'line' && '直線尺寸:'}
                {singleSelected.type === 'rectangle' && '矩形尺寸:'}
                {singleSelected.type === 'circle' && '圓形尺寸:'}
                {singleSelected.type === 'arc' && '三點圓弧:'}
                {singleSelected.type === 'polygon' && '多邊形尺寸:'}
                {singleSelected.type === 'hatch' && '45° 斜線填充:'}
                {singleSelected.type === 'dimension' && '標註設定:'}
                {singleSelected.type === 'text' && '文字設定:'}
                {singleSelected.type === 'group' &&
                  `組裝圖元 (${singleSelected.children.length} 個子圖元)`}
                {singleSelected.type === 'polyline' && '聚合線'}
              </span>

              {/* Line Direct Size Input */}
              {singleSelected.type === 'line' && (
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1">
                    <span className="text-slate-400">長度L:</span>
                    <input
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={Number(
                        dist(singleSelected.p1, singleSelected.p2).toFixed(2)
                      )}
                      onChange={(e) => {
                        const newLen = Math.max(0.01, Number(e.target.value));
                        const rad =
                          angleDegrees(singleSelected.p1, singleSelected.p2) *
                          DEG_TO_RAD;
                        updateSingleEntity({
                          p2: {
                            x: singleSelected.p1.x + newLen * Math.cos(rad),
                            y: singleSelected.p1.y + newLen * Math.sin(rad),
                          },
                        });
                      }}
                      className="w-16 px-1.5 py-0.5 bg-slate-950 border border-sky-500/60 rounded text-sky-200"
                    />
                    <span className="text-slate-500">mm</span>
                  </label>
                  <label className="flex items-center gap-1">
                    <span className="text-slate-400">∠:</span>
                    <input
                      type="number"
                      step="0.01"
                      value={Number(
                        angleDegrees(
                          singleSelected.p1,
                          singleSelected.p2
                        ).toFixed(2)
                      )}
                      onChange={(e) => {
                        const newDeg = Number(e.target.value);
                        const curLen = dist(
                          singleSelected.p1,
                          singleSelected.p2
                        );
                        const rad = newDeg * DEG_TO_RAD;
                        updateSingleEntity({
                          p2: {
                            x: singleSelected.p1.x + curLen * Math.cos(rad),
                            y: singleSelected.p1.y + curLen * Math.sin(rad),
                          },
                        });
                      }}
                      className="w-14 px-1.5 py-0.5 bg-slate-950 border border-sky-500/60 rounded text-sky-200"
                    />
                    <span className="text-slate-500">°</span>
                  </label>
                </div>
              )}

              {/* Rectangle Direct Size Input */}
              {singleSelected.type === 'rectangle' && (
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1">
                    <span className="text-slate-400">寬W:</span>
                    <input
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={Number(
                        Math.abs(
                          singleSelected.p2.x - singleSelected.p1.x
                        ).toFixed(2)
                      )}
                      onChange={(e) => {
                        const w = Math.max(0.01, Number(e.target.value));
                        const c = midpoint(
                          singleSelected.p1,
                          singleSelected.p2
                        );
                        updateSingleEntity({
                          p1: { ...singleSelected.p1, x: c.x - w / 2 },
                          p2: { ...singleSelected.p2, x: c.x + w / 2 },
                        });
                      }}
                      className="w-16 px-1.5 py-0.5 bg-slate-950 border border-sky-500/60 rounded text-sky-200"
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    <span className="text-slate-400">高H:</span>
                    <input
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={Number(
                        Math.abs(
                          singleSelected.p2.y - singleSelected.p1.y
                        ).toFixed(2)
                      )}
                      onChange={(e) => {
                        const h = Math.max(0.01, Number(e.target.value));
                        const c = midpoint(
                          singleSelected.p1,
                          singleSelected.p2
                        );
                        updateSingleEntity({
                          p1: { ...singleSelected.p1, y: c.y - h / 2 },
                          p2: { ...singleSelected.p2, y: c.y + h / 2 },
                        });
                      }}
                      className="w-16 px-1.5 py-0.5 bg-slate-950 border border-sky-500/60 rounded text-sky-200"
                    />
                    <span className="text-slate-500">mm</span>
                  </label>
                  <button
                    type="button"
                    onClick={onExplodeSelected}
                    className="flex items-center gap-1 px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-sans text-[11px]"
                  >
                    <Scissors className="w-3 h-3" />
                    <span>炸開 (X)</span>
                  </button>
                </div>
              )}

              {/* Circle Direct Size Input */}
              {singleSelected.type === 'circle' && (
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1">
                    <span className="text-slate-400">半徑R:</span>
                    <input
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={Number(singleSelected.radius.toFixed(2))}
                      onChange={(e) =>
                        updateSingleEntity({
                          radius: Math.max(0.01, Number(e.target.value)),
                        })
                      }
                      className="w-16 px-1.5 py-0.5 bg-slate-950 border border-sky-500/60 rounded text-sky-200"
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    <span className="text-slate-400">直徑Ø:</span>
                    <input
                      type="number"
                      min={0.02}
                      step="0.01"
                      value={Number((singleSelected.radius * 2).toFixed(2))}
                      onChange={(e) =>
                        updateSingleEntity({
                          radius: Math.max(0.01, Number(e.target.value) / 2),
                        })
                      }
                      className="w-16 px-1.5 py-0.5 bg-slate-950 border border-amber-500/60 rounded text-amber-200"
                    />
                    <span className="text-slate-500">mm</span>
                  </label>
                </div>
              )}

              {/* Arc Direct Size Input & 1-Click Radius Dimension (導圓角標註半徑 R) */}
              {singleSelected.type === 'arc' && (
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1">
                    <span className="text-slate-400">半徑R:</span>
                    <input
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={Number(singleSelected.radius.toFixed(2))}
                      onChange={(e) => {
                        const nextR = Math.max(0.01, Number(e.target.value));
                        const [p1, p2, p3] = getArcThreePoints({
                          ...singleSelected,
                          radius: nextR,
                        });
                        updateSingleEntity({ radius: nextR, p1, p2, p3 });
                      }}
                      className="w-16 px-1.5 py-0.5 bg-slate-950 border border-sky-500/60 rounded text-sky-200"
                    />
                    <span className="text-slate-500">mm</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const dimLayer = layers.some((l) => l.id === 'DIM')
                        ? 'DIM'
                        : activeLayerId;
                      const rDim = createRadiusDimensionForArc(
                        singleSelected,
                        dimLayer,
                        defaultDimFontSize
                      );
                      onUpdateEntities([...entities, rDim]);
                      onLogCommand(
                        `已為選取的導圓角/圓弧建立半徑標註: R${singleSelected.radius.toFixed(2)}`,
                        'success'
                      );
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-sans text-[11px] font-medium"
                  >
                    <span>+標註半徑 R</span>
                  </button>
                </div>
              )}

              {/* Polygon Direct Size Input */}
              {singleSelected.type === 'polygon' && (
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1">
                    <span className="text-slate-400">外接R:</span>
                    <input
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={Number(singleSelected.radius.toFixed(2))}
                      onChange={(e) =>
                        updateSingleEntity({
                          radius: Math.max(0.01, Number(e.target.value)),
                        })
                      }
                      className="w-16 px-1.5 py-0.5 bg-slate-950 border border-sky-500/60 rounded text-sky-200"
                    />
                    <span className="text-slate-500">mm</span>
                  </label>
                  <label className="flex items-center gap-1">
                    <span className="text-slate-400">邊數:</span>
                    <input
                      type="number"
                      min={3}
                      max={24}
                      value={singleSelected.sides}
                      onChange={(e) =>
                        updateSingleEntity({
                          sides: Math.max(
                            3,
                            Math.min(24, Number(e.target.value))
                          ),
                        })
                      }
                      className="w-12 px-1.5 py-0.5 bg-slate-950 border border-sky-500/60 rounded text-sky-200"
                    />
                  </label>
                </div>
              )}

              {/* Hatch Direct Pitch Input */}
              {singleSelected.type === 'hatch' && (
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1">
                    <span className="text-emerald-300 font-sans">
                      45° 斜線 PITCH:
                    </span>
                    <input
                      type="number"
                      min={0.5}
                      max={200}
                      step="0.5"
                      value={singleSelected.pitch}
                      onChange={(e) =>
                        updateSingleEntity({
                          pitch: Math.max(0.5, Number(e.target.value)),
                        })
                      }
                      className="w-16 px-1.5 py-0.5 bg-slate-950 border border-emerald-500/60 rounded text-emerald-200"
                    />
                    <span className="text-slate-500">mm</span>
                  </label>
                  <div className="flex items-center gap-1">
                    {[2, 5, 8, 10, 15].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => updateSingleEntity({ pitch: p })}
                        className={`px-1.5 py-0.5 rounded text-[10px] border ${
                          singleSelected.pitch === p
                            ? 'bg-emerald-600 text-white border-emerald-400'
                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-emerald-500/50'
                        }`}
                      >
                        {p}mm
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Dimension Direct Modification Bar: Mode (Linear / ISO Diameter), Precision (0 / 1 / 2), Tolerance (+/-), Font Size */}
              {singleSelected.type === 'dimension' && (
                <div className="flex flex-wrap items-center gap-2 font-sans">
                  {/* ISO Diameter / Radius / Linear toggle */}
                  <div className="flex items-center bg-slate-950 border border-slate-700 rounded p-0.5">
                    <button
                      type="button"
                      onClick={() => updateSingleEntity({ dimMode: 'linear' })}
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        (singleSelected.dimMode ?? 'linear') === 'linear'
                          ? 'bg-sky-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      線性
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateSingleEntity({ dimMode: 'diameter' })
                      }
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        singleSelected.dimMode === 'diameter'
                          ? 'bg-sky-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Ø直徑(ISO)
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSingleEntity({ dimMode: 'radius' })}
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        singleSelected.dimMode === 'radius'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      R半徑
                    </button>
                  </div>

                  {/* Decimal Precision: 0, 1, 2 */}
                  <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5">
                    <span className="text-[10px] text-slate-400">小數:</span>
                    {(
                      [
                        { p: 0, label: '第0位' },
                        { p: 1, label: '後1位' },
                        { p: 2, label: '後2位' },
                      ] as const
                    ).map(({ p, label }) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() =>
                          updateSingleEntity({
                            precision: p,
                            textOverride: undefined,
                          })
                        }
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                          (singleSelected.precision ?? 1) === p
                            ? 'bg-sky-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* +/- Tolerance Mode & Inputs (Supports 0!) */}
                  <div className="flex items-center gap-1 bg-slate-950 border border-amber-500/40 rounded px-1.5 py-0.5">
                    <span className="text-[10px] text-amber-300">公差:</span>
                    <select
                      value={singleSelected.toleranceMode ?? 'none'}
                      onChange={(e) =>
                        updateSingleEntity({
                          toleranceMode: e.target.value as
                            | 'none'
                            | 'symmetric'
                            | 'deviation',
                          toleranceUpper:
                            singleSelected.toleranceUpper !== undefined
                              ? singleSelected.toleranceUpper
                              : 0.05,
                          toleranceLower:
                            singleSelected.toleranceLower !== undefined
                              ? singleSelected.toleranceLower
                              : -0.05,
                          textOverride: undefined,
                        })
                      }
                      className="bg-slate-900 border border-slate-700 rounded px-1 py-0 text-[10px] text-amber-200"
                    >
                      <option value="none">無</option>
                      <option value="symmetric">±對稱公差</option>
                      <option value="deviation">+/-正負公差</option>
                    </select>

                    {singleSelected.toleranceMode === 'symmetric' && (
                      <label className="flex items-center gap-0.5 font-mono">
                        <span className="text-amber-300 text-[10px]">±</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={
                            singleSelected.toleranceUpper !== undefined
                              ? singleSelected.toleranceUpper
                              : 0.05
                          }
                          onChange={(e) => {
                            const raw = Math.abs(Number(e.target.value));
                            const v = raw === 0 ? 0 : Math.max(0.01, raw);
                            updateSingleEntity({
                              toleranceUpper: v,
                              toleranceLower: -v,
                              textOverride: undefined,
                            });
                          }}
                          className="w-14 px-1 py-0 bg-slate-900 border border-amber-500/60 rounded text-amber-200 text-[11px]"
                        />
                      </label>
                    )}

                    {singleSelected.toleranceMode === 'deviation' && (
                      <div className="flex items-center gap-1 font-mono">
                        <label className="flex items-center gap-0.5">
                          <span className="text-emerald-400 text-[10px]">
                            +
                          </span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={
                              singleSelected.toleranceUpper !== undefined
                                ? singleSelected.toleranceUpper
                                : 0.05
                            }
                            onChange={(e) => {
                              const raw = Number(e.target.value);
                              const v =
                                raw <= 0
                                  ? 0
                                  : raw < 0.01
                                    ? 0.01
                                    : raw;
                              updateSingleEntity({
                                toleranceUpper: v,
                                textOverride: undefined,
                              });
                            }}
                            className="w-14 px-1 py-0 bg-slate-900 border border-emerald-500/60 rounded text-emerald-200 text-[11px]"
                          />
                        </label>
                        <label className="flex items-center gap-0.5">
                          <span className="text-rose-400 text-[10px]">-</span>
                          <input
                            type="number"
                            max={0}
                            step="0.01"
                            value={
                              singleSelected.toleranceLower !== undefined
                                ? singleSelected.toleranceLower
                                : -0.05
                            }
                            onChange={(e) => {
                              const raw = Number(e.target.value);
                              const v =
                                raw === 0
                                  ? 0
                                  : raw > 0
                                    ? -Math.max(0.01, raw)
                                    : raw > -0.01
                                      ? -0.01
                                      : raw;
                              updateSingleEntity({
                                toleranceLower: v,
                                textOverride: undefined,
                              });
                            }}
                            className="w-14 px-1 py-0 bg-slate-900 border border-rose-500/60 rounded text-rose-200 text-[11px]"
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Font size */}
                  <label className="flex items-center gap-1">
                    <span className="text-amber-300 text-[10px]">字高:</span>
                    <input
                      type="number"
                      min={6}
                      max={72}
                      value={singleSelected.fontSize || 11}
                      onChange={(e) =>
                        updateSingleEntity({
                          fontSize: Math.max(
                            6,
                            Math.min(72, Number(e.target.value))
                          ),
                        })
                      }
                      className="w-12 px-1 py-0.5 font-mono bg-slate-950 border border-amber-500/60 rounded text-amber-200 text-[11px]"
                    />
                  </label>
                </div>
              )}

              {/* Group Explode Action */}
              {singleSelected.type === 'group' && (
                <button
                  type="button"
                  onClick={onExplodeSelected}
                  className="flex items-center gap-1 px-2.5 py-0.5 bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 border border-amber-500/50 rounded font-sans text-[11px]"
                >
                  <Scissors className="w-3 h-3" />
                  <span>炸開組裝圖元 (X)</span>
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 font-sans">
              <span className="text-sky-300 font-semibold">
                已選取 {selectedEntities.length} 個圖元
              </span>
              <button
                type="button"
                onClick={onJoinSelected}
                className="flex items-center gap-1 px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-medium"
              >
                <Combine className="w-3 h-3" />
                <span>組裝圖元 (J)</span>
              </button>
              {selectedDims.length >= 2 && (
                <button
                  type="button"
                  onClick={onAlignDimensions}
                  className="flex items-center gap-1 px-2.5 py-0.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-[11px] font-medium"
                >
                  <AlignCenterHorizontal className="w-3 h-3" />
                  <span>相互對齊標註 ({selectedDims.length})</span>
                </button>
              )}
            </div>
          )}

          {/* Quick Coordinate Jump (X, Y) for any selected object(s) */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-700/80 rounded px-1.5 py-0.5 font-mono">
            <span className="text-[10px] text-slate-400 font-sans">
              座標X:
            </span>
            <input
              type="number"
              step="0.01"
              value={moveTargetInputX}
              onChange={(e) => setMoveTargetInputX(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const tx = parseFloat(moveTargetInputX);
                  const ty = parseFloat(moveTargetInputY);
                  if (!isNaN(tx) && !isNaN(ty)) {
                    executeMoveToCoordinates(tx, ty);
                  }
                }
              }}
              className="w-14 px-1 py-0 bg-slate-900 border border-slate-700 rounded text-sky-200 text-[11px]"
            />
            <span className="text-[10px] text-slate-400 font-sans">Y:</span>
            <input
              type="number"
              step="0.01"
              value={moveTargetInputY}
              onChange={(e) => setMoveTargetInputY(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const tx = parseFloat(moveTargetInputX);
                  const ty = parseFloat(moveTargetInputY);
                  if (!isNaN(tx) && !isNaN(ty)) {
                    executeMoveToCoordinates(tx, ty);
                  }
                }
              }}
              className="w-14 px-1 py-0 bg-slate-900 border border-slate-700 rounded text-sky-200 text-[11px]"
            />
            <button
              type="button"
              onClick={() => {
                const tx = parseFloat(moveTargetInputX);
                const ty = parseFloat(moveTargetInputY);
                if (!isNaN(tx) && !isNaN(ty)) {
                  executeMoveToCoordinates(tx, ty);
                }
              }}
              title="將選取物件跳轉移動至指定 (X, Y) 座標"
              className="px-1.5 py-0.5 bg-sky-600/80 hover:bg-sky-500 text-white rounded text-[10px] font-sans"
            >
              跳轉
            </button>
          </div>

          <button
            type="button"
            onClick={onDeleteSelected}
            title="刪除選取圖元 (快捷鍵 E / DEL)"
            className="flex items-center gap-1 px-2 py-0.5 bg-rose-950/70 hover:bg-rose-900 text-rose-200 border border-rose-700/60 rounded font-sans text-[11px]"
          >
            <Trash2 className="w-3 h-3" />
            <span>刪除 (E)</span>
          </button>
        </div>
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

      {/* Offset / Hatch Floating Input HUD when in Offset or Hatch Mode */}
      {activeTool === 'offset' && (
        <div
          style={{
            transform: `translate(${Math.min(
              Math.max(8, canvasSize.width - 210),
              Math.max(8, mouseScreen.x + 16)
            )}px, ${Math.min(
              Math.max(8, canvasSize.height - 56),
              Math.max(8, mouseScreen.y + 16)
            )}px)`,
          }}
          className="pointer-events-none absolute top-0 left-0 z-20 flex items-center gap-1.5 bg-slate-900/95 border border-amber-500/60 rounded px-2.5 py-1 shadow-lg font-mono text-xs"
        >
          <span className="text-amber-300">偏移距離:</span>
          <span className="px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-100 border border-amber-400/50">
            {dynValue !== '' ? dynValue : offsetDistance} mm
          </span>
          <span className="text-[10px] text-slate-400">[打字+空白鍵]</span>
        </div>
      )}

      {activeTool === 'hatch' && (
        <div
          style={{
            transform: `translate(${Math.min(
              Math.max(8, canvasSize.width - 260),
              Math.max(8, mouseScreen.x + 16)
            )}px, ${Math.min(
              Math.max(8, canvasSize.height - 56),
              Math.max(8, mouseScreen.y + 16)
            )}px)`,
          }}
          className="pointer-events-none absolute top-0 left-0 z-20 flex items-center gap-1.5 bg-slate-900/95 border border-emerald-500/60 rounded px-2.5 py-1 shadow-lg font-mono text-xs"
        >
          <span className="text-emerald-300 font-sans">
            {hatchMode === 'smart' ? '智慧填充 PITCH:' : '選取範圍 PITCH:'}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/25 text-emerald-100 border border-emerald-400/50">
            {dynValue !== '' ? dynValue : hatchPitch} mm
          </span>
          <span className="text-[10px] text-slate-400">
            {hatchMode === 'smart'
              ? '[點擊或輸入+Enter]'
              : selectedIds.length > 0
                ? `[已選${selectedIds.length}項 按Enter執行]`
                : '[選取範圍後按Enter]'}
          </span>
        </div>
      )}

      {/* Dynamic Input (DYN - F12) Heads-Up Display next to Crosshair */}
      {settings.dynInput &&
        (anchorPoint || activeTool === 'move' || activeTool === 'copy') &&
        activeTool !== 'zoomWindow' && (
          <div
            style={{
              transform: `translate(${Math.min(
                Math.max(8, canvasSize.width - 260),
                Math.max(8, mouseScreen.x + 16)
              )}px, ${Math.min(
                Math.max(8, canvasSize.height - 56),
                Math.max(8, mouseScreen.y + 16)
              )}px)`,
            }}
            className="pointer-events-none absolute top-0 left-0 z-20 flex items-center gap-1.5 bg-slate-900/95 border border-sky-500/60 rounded px-2 py-1 shadow-lg font-mono text-xs"
          >
            {activeTool === 'move' || activeTool === 'copy' ? (
              <>
                <span className="text-sky-300 font-sans">目標X:</span>
                <span
                  className={`px-1 rounded ${
                    dynField === 'primary'
                      ? 'bg-sky-500/25 text-sky-200 border border-sky-400/50'
                      : 'text-slate-200'
                  }`}
                >
                  {dynValue !== '' ? dynValue : cursorWorld.x.toFixed(2)}
                </span>
                <span className="text-sky-300 font-sans">Y:</span>
                <span
                  className={`px-1 rounded ${
                    dynField === 'secondary'
                      ? 'bg-sky-500/25 text-sky-200 border border-sky-400/50'
                      : 'text-slate-200'
                  }`}
                >
                  {dynAngleValue !== ''
                    ? dynAngleValue
                    : cursorWorld.y.toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-400">
                  [輸入X,Y+空白鍵跳轉]
                </span>
              </>
            ) : activeTool === 'rectangle' ? (
              <>
                <span className="text-slate-400">
                  {rectangleMode === 'center' ? '總寬W:' : '寬W:'}
                </span>
                <span
                  className={`px-1 rounded ${
                    dynField === 'primary'
                      ? 'bg-sky-500/25 text-sky-200 border border-sky-400/50'
                      : 'text-slate-200'
                  }`}
                >
                  {dynValue !== '' ? dynValue : liveWidth.toFixed(2)}
                </span>
                <span className="text-slate-400">
                  {rectangleMode === 'center' ? '總高H:' : '高H:'}
                </span>
                <span
                  className={`px-1 rounded ${
                    dynField === 'secondary'
                      ? 'bg-sky-500/25 text-sky-200 border border-sky-400/50'
                      : 'text-slate-200'
                  }`}
                >
                  {dynAngleValue !== '' ? dynAngleValue : liveHeight.toFixed(2)}
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
                  {dynValue !== '' ? dynValue : liveDist.toFixed(2)} mm
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
            {activeTool !== 'move' && activeTool !== 'copy' && (
              <span className="text-[10px] text-slate-400">[空白鍵/Enter]</span>
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

      {/* PDF Window Selection Floating Banner */}
      {activeTool === 'pdfWindow' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2 rounded-xl bg-amber-950/95 border border-amber-400/80 text-amber-100 text-xs shadow-2xl backdrop-blur-md">
          <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-bold font-mono text-[11px]">
            PDF 窗選匯出
          </span>
          <span className="font-medium">
            {drawingPoints.length === 0
              ? '請在畫布上點選（或按住拖曳）要匯出為 PDF 的區域第一角點 P1'
              : '請移動滑鼠並點選對角點 P2 完成窗選區域匯出 PDF'}
          </span>
          <button
            type="button"
            onClick={() => {
              setDrawingPoints([]);
              onToolComplete();
            }}
            className="px-2.5 py-0.5 rounded bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 text-[11px]"
          >
            取消 (ESC)
          </button>
        </div>
      )}
    </div>
  );
};
