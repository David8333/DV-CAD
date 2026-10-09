import React, { useState, useCallback, useEffect } from 'react';
import {
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Download,
  Minus,
  Ruler,
  Sparkles,
  Keyboard,
  FolderOpen,
  Grid,
  Check,
} from 'lucide-react';
import {
  CadEntity,
  CadLayer,
  CommandLogItem,
  DraftingSettings,
  Point,
  SnapPoint,
  ToolType,
} from './types/cad';
import { BLUEPRINT_TEMPLATES, DEFAULT_LAYERS } from './data/templates';
import { CadViewport } from './components/CadViewport';
import { ToolPalette } from './components/ToolPalette';
import { InspectorSidebar } from './components/InspectorSidebar';
import { CommandDock } from './components/CommandDock';
import {
  angleDegrees,
  DEG_TO_RAD,
  dist,
  explodeEntity,
  exportToDXF,
  exportToSVG,
  getEntityBounds,
  midpoint,
  rotateEntity,
  translateEntity,
} from './utils/geometry';

const STORAGE_KEY = 'vektorcad_saved_state_v1';

function loadSavedState(): { entities: CadEntity[]; layers: CadLayer[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.entities) && Array.isArray(parsed.layers)) {
      return parsed;
    }
  } catch {
    // Ignore storage parse errors
  }
  return null;
}

export default function App() {
  const initialSaved = loadSavedState();

  // History stack for Undo / Redo
  const [history, setHistory] = useState<CadEntity[][]>([
    initialSaved ? initialSaved.entities : BLUEPRINT_TEMPLATES[0].entities,
  ]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  const entities = history[historyIndex];

  const [layers, setLayers] = useState<CadLayer[]>(
    initialSaved ? initialSaved.layers : DEFAULT_LAYERS
  );
  const [activeLayerId, setActiveLayerId] = useState<string>('0');
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drawingPoints, setDrawingPoints] = useState<Point[]>([]);

  // Auto-save to localStorage whenever entities or layers change
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ entities, layers })
      );
    } catch {
      // Ignore quota errors
    }
  }, [entities, layers]);

  // Viewport Pan & Zoom
  const [pan, setPan] = useState<Point>({ x: -40, y: 10 });
  const [zoom, setZoom] = useState<number>(1.35);

  // Cursor & Snap status
  const [cursorWorld, setCursorWorld] = useState<Point>({ x: 0, y: 0 });
  const [activeSnap, setActiveSnap] = useState<SnapPoint | null>(null);

  // Tool parameters
  const [polygonSides, setPolygonSides] = useState<number>(6);
  const [offsetDistance, setOffsetDistance] = useState<number>(20);

  // Drafting settings
  const [settings, setSettings] = useState<DraftingSettings>({
    grid: true,
    snap: false,
    snapStep: 10,
    ortho: false,
    polar: true,
    polarAngle: 45,
    osnap: true,
    osnapModes: {
      endpoint: true,
      midpoint: true,
      center: true,
      quadrant: true,
      intersection: true,
    },
    dynInput: true,
    showLineWeight: true,
  });

  // Modals state
  const [activeModal, setActiveModal] = useState<
    'templates' | 'shortcuts' | 'array' | 'export' | null
  >(null);

  // Array Modal parameters
  const [arrayMode, setArrayMode] = useState<'rect' | 'polar'>('rect');
  const [arrayRows, setArrayRows] = useState(3);
  const [arrayCols, setArrayCols] = useState(4);
  const [arraySpacingX, setArraySpacingX] = useState(60);
  const [arraySpacingY, setArraySpacingY] = useState(60);
  const [arrayPolarCount, setArrayPolarCount] = useState(6);
  const [arrayPolarCenterX, setArrayPolarCenterX] = useState(0);
  const [arrayPolarCenterY, setArrayPolarCenterY] = useState(0);

  // Command Logs
  const [logs, setLogs] = useState<CommandLogItem[]>([
    {
      id: 'init-1',
      timestamp: '00:00:01',
      text: 'VektorCAD 2D 工程製圖核心已啟動 — 支援直接按鍵盤快捷鍵：按 [L] 畫直線、按 [D] 標註尺寸、按 [R] 畫矩形、按 [C] 畫圓、按 [F8] 切換正交鎖定。',
      type: 'info',
    },
    {
      id: 'init-2',
      timestamp: '00:00:02',
      text: '已載入預設工程圖範本：「CNC-FLG-240 精密法蘭軸承座」（單位：mm）。',
      type: 'success',
    },
  ]);

  const logCommand = useCallback(
    (
      text: string,
      type: 'command' | 'info' | 'error' | 'success' = 'info'
    ) => {
      const now = new Date();
      const ts = now.toTimeString().slice(0, 8);
      setLogs((prev) => [
        ...prev,
        {
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: ts,
          text,
          type,
        },
      ]);
    },
    []
  );

  // Commit entity state to history
  const pushEntities = useCallback(
    (nextEntities: CadEntity[]) => {
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        return [...sliced, nextEntities];
      });
      setHistoryIndex((idx) => idx + 1);
    },
    [historyIndex]
  );

  const handleAddEntity = useCallback(
    (entity: CadEntity) => {
      pushEntities([...entities, entity]);
    },
    [entities, pushEntities]
  );

  const handleUpdateEntities = useCallback(
    (updated: CadEntity[]) => {
      pushEntities(updated);
    },
    [pushEntities]
  );

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex((i) => i - 1);
      setDrawingPoints([]);
      logCommand('UNDO 已復原上一步操作 (Ctrl+Z)', 'info');
    } else {
      logCommand('已經是最早的步驟，無法再復原。', 'error');
    }
  }, [historyIndex, logCommand]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex((i) => i + 1);
      setDrawingPoints([]);
      logCommand('REDO 已重做操作 (Ctrl+Y)', 'info');
    } else {
      logCommand('沒有可重做的步驟。', 'error');
    }
  }, [history.length, historyIndex, logCommand]);

  const handleSelectTool = useCallback(
    (tool: ToolType) => {
      setActiveTool(tool);
      setDrawingPoints([]);
      const toolNames: Record<ToolType, string> = {
        select: 'SELECT 選取與掣點編輯模式 (快捷鍵 V)',
        pan: 'PAN 平移視景模式 (快捷鍵 H / 空白鍵)',
        line: 'LINE 畫直線模式 (快捷鍵 L) — 請點選起點與終點，或直接輸入長度數值',
        polyline: 'PLINE 聚合線模式 (快捷鍵 P) — 連續點選頂點，按 C 封閉或 Enter 完成',
        rectangle: 'RECTANG 矩形模式 (快捷鍵 R) — 請點選對角兩點',
        circle: 'CIRCLE 圓形模式 (快捷鍵 C) — 請點選圓心與半徑',
        arc: 'ARC 三點圓弧模式 (快捷鍵 A) — 請依序指定圓心、起點、終點角度',
        ellipse: 'ELLIPSE 橢圓形模式 (快捷鍵 E) — 請點選中心與長短軸',
        polygon: 'POLYGON 正多邊形模式 (快捷鍵 G) — 請點選中心與外接圓半徑',
        dimension: 'DIMLINEAR 標註尺寸模式 (快捷鍵 D) — 請依序點選兩個測量端點，再拉出標註線高度點擊完成',
        text: 'TEXT 文字註解模式 (快捷鍵 T) — 請點選文字插入位置',
        measure: 'DIST 距離與角度量測模式 (快捷鍵 K) — 請點選兩點進行量測',
        move: 'MOVE 移動物件模式 (快捷鍵 M) — 請指定基準點與目標點',
        copy: 'COPY 連續複製模式 (快捷鍵 J) — 請指定基準點與放置點',
        rotate: 'ROTATE 旋轉模式 (快捷鍵 Q) — 請指定旋轉中心與角度',
        scale: 'SCALE 比例縮放模式 (快捷鍵 S) — 請指定縮放中心與比例',
        mirror: 'MIRROR 對稱鏡射模式 (快捷鍵 W) — 請點選兩點定義對稱軸線',
        offset: 'OFFSET 偏移複製模式 (快捷鍵 O) — 請點選物件與偏移方向',
      };
      logCommand(`指令切換: ${toolNames[tool]}`, 'command');
    },
    [logCommand]
  );

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.length === 0) {
      logCommand('請先選取要刪除的圖元物件。', 'error');
      return;
    }
    const remaining = entities.filter((e) => !selectedIds.includes(e.id));
    pushEntities(remaining);
    logCommand(`ERASE 已刪除 ${selectedIds.length} 個圖元物件 (DEL)`, 'success');
    setSelectedIds([]);
  }, [entities, logCommand, pushEntities, selectedIds]);

  const handleExplodeSelected = useCallback(() => {
    if (selectedIds.length === 0) {
      logCommand('EXPLODE 請先選取要炸開的矩形、聚合線或多邊形。', 'error');
      return;
    }
    let explodedCount = 0;
    const nextEntities: CadEntity[] = [];
    for (const ent of entities) {
      if (selectedIds.includes(ent.id)) {
        const segs = explodeEntity(ent);
        if (segs) {
          nextEntities.push(...segs);
          explodedCount++;
        } else {
          nextEntities.push(ent);
        }
      } else {
        nextEntities.push(ent);
      }
    }
    if (explodedCount > 0) {
      pushEntities(nextEntities);
      setSelectedIds([]);
      logCommand(`EXPLODE 已將 ${explodedCount} 個複合圖元炸開為獨立直線段`, 'success');
    } else {
      logCommand('所選物件無法再炸開（僅矩形、聚合線、正多邊形支援炸開為直線）。', 'error');
    }
  }, [entities, logCommand, pushEntities, selectedIds]);

  const handleDuplicateSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const copies = entities
      .filter((e) => selectedIds.includes(e.id))
      .map((e, idx) => ({
        ...translateEntity(e, 25, -25),
        id: `dup_${Date.now()}_${idx}`,
      }));
    pushEntities([...entities, ...copies]);
    setSelectedIds(copies.map((c) => c.id));
    logCommand(`已快速複製 ${copies.length} 個物件 (偏移 +25, -25 mm)`, 'success');
  }, [entities, logCommand, pushEntities, selectedIds]);

  // One-click Automatic Dimensioning for selected lines/rectangles/circles
  const handleAutoDimensionSelected = useCallback(() => {
    if (selectedIds.length === 0) {
      handleSelectTool('dimension');
      logCommand(
        '已切換至「標註尺寸 (D)」工具 — 您也可以先選取直線或矩形，再按 [B] 一鍵自動產生尺寸標註！',
        'info'
      );
      return;
    }

    const dimLayerId = layers.some((l) => l.id === 'DIM')
      ? 'DIM'
      : activeLayerId;
    const newDims: CadEntity[] = [];

    for (const ent of entities) {
      if (!selectedIds.includes(ent.id)) continue;

      if (ent.type === 'line') {
        const mid = midpoint(ent.p1, ent.p2);
        const dx = ent.p2.x - ent.p1.x;
        const dy = ent.p2.y - ent.p1.y;
        const len = Math.hypot(dx, dy);
        if (len > 1) {
          const nx = -dy / len;
          const ny = dx / len;
          newDims.push({
            id: `autodim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: 'dimension',
            layerId: dimLayerId,
            p1: ent.p1,
            p2: ent.p2,
            offsetPoint: { x: mid.x + nx * 24, y: mid.y + ny * 24 },
          });
        }
      } else if (ent.type === 'rectangle') {
        const minX = Math.min(ent.p1.x, ent.p2.x);
        const maxX = Math.max(ent.p1.x, ent.p2.x);
        const minY = Math.min(ent.p1.y, ent.p2.y);
        const maxY = Math.max(ent.p1.y, ent.p2.y);
        // Top width dimension
        newDims.push({
          id: `autodim_w_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'dimension',
          layerId: dimLayerId,
          p1: { x: minX, y: maxY },
          p2: { x: maxX, y: maxY },
          offsetPoint: { x: (minX + maxX) / 2, y: maxY + 26 },
        });
        // Right height dimension
        newDims.push({
          id: `autodim_h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'dimension',
          layerId: dimLayerId,
          p1: { x: maxX, y: minY },
          p2: { x: maxX, y: maxY },
          offsetPoint: { x: maxX + 26, y: (minY + maxY) / 2 },
        });
      } else if (ent.type === 'circle') {
        const { center, radius } = ent;
        newDims.push({
          id: `autodim_c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'dimension',
          layerId: dimLayerId,
          p1: { x: center.x - radius, y: center.y },
          p2: { x: center.x + radius, y: center.y },
          offsetPoint: { x: center.x, y: center.y + radius + 24 },
          textOverride: `Ø${(radius * 2).toFixed(1)} mm`,
        });
      }
    }

    if (newDims.length > 0) {
      pushEntities([...entities, ...newDims]);
      logCommand(`自動標註完成：已為選取物件產生 ${newDims.length} 組精確尺寸標註！`, 'success');
    } else {
      logCommand('請選取直線、矩形或圓形以執行自動尺寸標註，或按 [D] 手動點選兩點標註。', 'info');
    }
  }, [activeLayerId, entities, handleSelectTool, layers, logCommand, pushEntities, selectedIds]);

  const handleZoomExtents = useCallback(() => {
    if (entities.length === 0) {
      setPan({ x: 0, y: 0 });
      setZoom(1.2);
      return;
    }
    const bounds = entities.map(getEntityBounds);
    const minX = Math.min(...bounds.map((b) => b.minX));
    const maxX = Math.max(...bounds.map((b) => b.maxX));
    const minY = Math.min(...bounds.map((b) => b.minY));
    const maxY = Math.max(...bounds.map((b) => b.maxY));

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const w = Math.max(100, maxX - minX);
    const h = Math.max(100, maxY - minY);

    const nextZoom = Math.min(8, Math.max(0.25, Math.min(720 / w, 460 / h)));
    setZoom(nextZoom);
    setPan({ x: -cx * nextZoom, y: cy * nextZoom });
    logCommand('ZOOM EXTENTS 已自動縮放至全圖最佳視角 (快捷鍵 Z)', 'info');
  }, [entities, logCommand]);

  const toggleSetting = useCallback(
    (
      key: keyof Omit<
        DraftingSettings,
        'osnapModes' | 'snapStep' | 'polarAngle'
      >
    ) => {
      setSettings((prev) => {
        const nextVal = !prev[key];
        const names: Record<string, string> = {
          grid: '網格顯示 (GRID F7)',
          snap: '網格點鎖定 (SNAP F9)',
          ortho: '正交水平/垂直鎖定 (ORTHO F8)',
          polar: '極座標角度追蹤 (POLAR F10)',
          osnap: '幾何物件鎖點 (OSNAP F3)',
          dynInput: '動態尺寸輸入 (DYN F12)',
          showLineWeight: '工程線寬顯示 (LWT)',
        };
        logCommand(
          `${names[key]} 已${nextVal ? '啟用 (ON)' : '關閉 (OFF)'}`,
          'info'
        );
        return { ...prev, [key]: nextVal };
      });
    },
    [logCommand]
  );

  // Global Direct Keyboard Shortcuts (L, D, R, C, P, A, E, G, T, K, V, H, M, J, Q, S, W, O, X, B, Z, F3-F12, Ctrl+Z/Y)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Function Keys F3, F7, F8, F9, F10, F12
      if (e.key === 'F3') {
        e.preventDefault();
        toggleSetting('osnap');
        return;
      }
      if (e.key === 'F7') {
        e.preventDefault();
        toggleSetting('grid');
        return;
      }
      if (e.key === 'F8') {
        e.preventDefault();
        toggleSetting('ortho');
        return;
      }
      if (e.key === 'F9') {
        e.preventDefault();
        toggleSetting('snap');
        return;
      }
      if (e.key === 'F10') {
        e.preventDefault();
        toggleSetting('polar');
        return;
      }
      if (e.key === 'F12') {
        e.preventDefault();
        toggleSetting('dynInput');
        return;
      }

      // Undo / Redo / Duplicate
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleDuplicateSelected();
        return;
      }

      // Delete selected entities when not mid-drawing
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        drawingPoints.length === 0 &&
        selectedIds.length > 0
      ) {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const k = e.key.toLowerCase();

      // Avoid hijacking 'c' when closing a polyline with >=3 points
      if (k === 'c' && activeTool === 'polyline' && drawingPoints.length >= 3) {
        return;
      }

      switch (k) {
        case 'l':
          e.preventDefault();
          handleSelectTool('line');
          break;
        case 'd':
          e.preventDefault();
          handleSelectTool('dimension');
          break;
        case 'b':
          e.preventDefault();
          handleAutoDimensionSelected();
          break;
        case 'p':
          e.preventDefault();
          handleSelectTool('polyline');
          break;
        case 'r':
          e.preventDefault();
          handleSelectTool('rectangle');
          break;
        case 'c':
          e.preventDefault();
          handleSelectTool('circle');
          break;
        case 'a':
          e.preventDefault();
          handleSelectTool('arc');
          break;
        case 'e':
          e.preventDefault();
          handleSelectTool('ellipse');
          break;
        case 'g':
          e.preventDefault();
          handleSelectTool('polygon');
          break;
        case 't':
          e.preventDefault();
          handleSelectTool('text');
          break;
        case 'k':
          e.preventDefault();
          handleSelectTool('measure');
          break;
        case 'v':
          e.preventDefault();
          handleSelectTool('select');
          break;
        case 'h':
          e.preventDefault();
          handleSelectTool('pan');
          break;
        case 'm':
          e.preventDefault();
          handleSelectTool('move');
          break;
        case 'j':
          e.preventDefault();
          handleSelectTool('copy');
          break;
        case 'q':
          e.preventDefault();
          handleSelectTool('rotate');
          break;
        case 's':
          e.preventDefault();
          handleSelectTool('scale');
          break;
        case 'w':
          e.preventDefault();
          handleSelectTool('mirror');
          break;
        case 'o':
          e.preventDefault();
          handleSelectTool('offset');
          break;
        case 'x':
          e.preventDefault();
          handleExplodeSelected();
          break;
        case 'z':
          e.preventDefault();
          handleZoomExtents();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeTool,
    drawingPoints.length,
    handleAutoDimensionSelected,
    handleDeleteSelected,
    handleDuplicateSelected,
    handleExplodeSelected,
    handleRedo,
    handleSelectTool,
    handleUndo,
    handleZoomExtents,
    selectedIds.length,
    toggleSetting,
  ]);

  // Execute typed AutoCAD Command or Coordinate from Command Line
  const handleExecuteCommand = (rawInput: string) => {
    const trimmed = rawInput.trim();
    const upper = trimmed.toUpperCase();
    logCommand(`> ${trimmed}`, 'command');

    // 1. Check standard AutoCAD Command Aliases
    const cmdMap: Record<string, ToolType> = {
      L: 'line',
      LINE: 'line',
      直線: 'line',
      PL: 'polyline',
      PLINE: 'polyline',
      聚合線: 'polyline',
      REC: 'rectangle',
      RECTANG: 'rectangle',
      R: 'rectangle',
      矩形: 'rectangle',
      C: 'circle',
      CIRCLE: 'circle',
      圓: 'circle',
      A: 'arc',
      ARC: 'arc',
      圓弧: 'arc',
      EL: 'ellipse',
      ELLIPSE: 'ellipse',
      橢圓: 'ellipse',
      POL: 'polygon',
      POLYGON: 'polygon',
      多邊形: 'polygon',
      D: 'dimension',
      DIM: 'dimension',
      DIMLINEAR: 'dimension',
      標註: 'dimension',
      尺寸: 'dimension',
      T: 'text',
      TEXT: 'text',
      文字: 'text',
      DIST: 'measure',
      MEASURE: 'measure',
      測量: 'measure',
      M: 'move',
      MOVE: 'move',
      移動: 'move',
      CO: 'copy',
      CP: 'copy',
      COPY: 'copy',
      複製: 'copy',
      RO: 'rotate',
      ROTATE: 'rotate',
      旋轉: 'rotate',
      SC: 'scale',
      SCALE: 'scale',
      縮放: 'scale',
      MI: 'mirror',
      MIRROR: 'mirror',
      鏡射: 'mirror',
      O: 'offset',
      OFFSET: 'offset',
      偏移: 'offset',
      P: 'pan',
      PAN: 'pan',
      平移: 'pan',
      SELECT: 'select',
    };

    if (cmdMap[upper]) {
      handleSelectTool(cmdMap[upper]);
      return;
    }

    if (upper === 'U' || upper === 'UNDO' || upper === '復原') {
      handleUndo();
      return;
    }
    if (upper === 'REDO' || upper === '重做') {
      handleRedo();
      return;
    }
    if (upper === 'E' || upper === 'ERASE' || upper === 'DEL' || upper === '刪除') {
      handleDeleteSelected();
      return;
    }
    if (upper === 'X' || upper === 'EXPLODE' || upper === '炸開') {
      handleExplodeSelected();
      return;
    }
    if (upper === 'B' || upper === 'AUTODIM' || upper === '自動標註') {
      handleAutoDimensionSelected();
      return;
    }
    if (upper === 'Z' || upper === 'ZE' || upper === 'ZOOM') {
      handleZoomExtents();
      return;
    }
    if (upper === 'AR' || upper === 'ARRAY' || upper === '陣列') {
      setActiveModal('array');
      return;
    }
    if (upper === 'CLEAR' || upper === '清空') {
      pushEntities([]);
      setSelectedIds([]);
      logCommand('已清空整個圖面所有物件。', 'info');
      return;
    }

    // 2. Check Coordinate or Distance Input: e.g. "100,50", "@120,40", "@150<30", or "120"
    const anchor =
      drawingPoints.length > 0
        ? drawingPoints[drawingPoints.length - 1]
        : { x: 0, y: 0 };

    let targetPt: Point | null = null;

    // @distance<angle (Relative Polar)
    const polarMatch = trimmed.match(/^@?(-?\d+(?:\.\d+)?)<(-?\d+(?:\.\d+)?)$/);
    if (polarMatch) {
      const len = parseFloat(polarMatch[1]);
      const deg = parseFloat(polarMatch[2]);
      const rad = deg * DEG_TO_RAD;
      targetPt = {
        x: anchor.x + len * Math.cos(rad),
        y: anchor.y + len * Math.sin(rad),
      };
    }

    // @dx,dy (Relative Cartesian)
    if (!targetPt && trimmed.startsWith('@')) {
      const parts = trimmed.slice(1).split(',');
      if (parts.length === 2) {
        const dx = parseFloat(parts[0]);
        const dy = parseFloat(parts[1]);
        if (!isNaN(dx) && !isNaN(dy)) {
          targetPt = { x: anchor.x + dx, y: anchor.y + dy };
        }
      }
    }

    // x,y (Absolute Cartesian)
    if (!targetPt && trimmed.includes(',')) {
      const parts = trimmed.split(',');
      if (parts.length === 2) {
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        if (!isNaN(x) && !isNaN(y)) {
          targetPt = { x, y };
        }
      }
    }

    // Single number (Length along current cursor direction or Circle radius)
    if (!targetPt && /^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      const val = parseFloat(trimmed);
      if (!isNaN(val) && val > 0 && drawingPoints.length > 0) {
        const deg = angleDegrees(anchor, cursorWorld);
        const rad = deg * DEG_TO_RAD;
        targetPt = {
          x: anchor.x + val * Math.cos(rad),
          y: anchor.y + val * Math.sin(rad),
        };
      }
    }

    if (targetPt) {
      if (activeTool === 'line') {
        if (drawingPoints.length === 0) {
          setDrawingPoints([targetPt]);
          logCommand(`已指定直線起點: (${targetPt.x.toFixed(1)}, ${targetPt.y.toFixed(1)})`, 'info');
        } else {
          const prev = drawingPoints[drawingPoints.length - 1];
          handleAddEntity({
            id: `line_${Date.now()}`,
            type: 'line',
            layerId: activeLayerId,
            p1: prev,
            p2: targetPt,
          });
          setDrawingPoints([targetPt]);
          logCommand(
            `已依座標建立直線至 (${targetPt.x.toFixed(1)}, ${targetPt.y.toFixed(1)})，長度 = ${dist(prev, targetPt).toFixed(2)} mm`,
            'success'
          );
        }
      } else if (activeTool === 'circle' && drawingPoints.length === 1) {
        const r = dist(drawingPoints[0], targetPt);
        handleAddEntity({
          id: `cir_${Date.now()}`,
          type: 'circle',
          layerId: activeLayerId,
          center: drawingPoints[0],
          radius: r,
        });
        setDrawingPoints([]);
        logCommand(`已建立半徑 R=${r.toFixed(2)} mm 之圓形`, 'success');
      } else {
        setDrawingPoints((prev) => [...prev, targetPt!]);
        logCommand(`已輸入座標點: (${targetPt.x.toFixed(1)}, ${targetPt.y.toFixed(1)})`, 'info');
      }
      return;
    }

    logCommand(
      `未知指令「${trimmed}」— 支援指令：L (直線)、D (標註尺寸)、B (自動標註)、R (矩形)、C (圓)、A (圓弧)、M (移動)、O (偏移) 或座標如 100,50`,
      'error'
    );
  };

  // Execute Rectangular / Polar Array creation
  const handleCreateArray = () => {
    if (selectedIds.length === 0) {
      logCommand('請先選取要陣列複製的物件。', 'error');
      setActiveModal(null);
      return;
    }

    const baseEntities = entities.filter((e) => selectedIds.includes(e.id));
    const generated: CadEntity[] = [];

    if (arrayMode === 'rect') {
      for (let r = 0; r < arrayRows; r++) {
        for (let c = 0; c < arrayCols; c++) {
          if (r === 0 && c === 0) continue;
          const dx = c * arraySpacingX;
          const dy = r * arraySpacingY;
          for (const ent of baseEntities) {
            generated.push({
              ...translateEntity(ent, dx, dy),
              id: `arr_${r}_${c}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            });
          }
        }
      }
    } else {
      const center = { x: arrayPolarCenterX, y: arrayPolarCenterY };
      for (let i = 1; i < arrayPolarCount; i++) {
        const angleRad = (i * 2 * Math.PI) / arrayPolarCount;
        for (const ent of baseEntities) {
          generated.push({
            ...rotateEntity(ent, center, angleRad),
            id: `parr_${i}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          });
        }
      }
    }

    pushEntities([...entities, ...generated]);
    setActiveModal(null);
    logCommand(`ARRAY 已成功產生 ${generated.length} 個陣列複製物件！`, 'success');
  };

  // Download file helper
  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col w-screen h-screen bg-[#0B0F17] text-slate-100 overflow-hidden select-none">
      {/* Top Bar Contract: 3 Zones (Brand Wordmark — 4 Concise Nav Links — 1 Primary Action) */}
      <header className="flex items-center justify-between gap-8 px-5 py-2.5 bg-[#0F172A] border-b border-slate-800 shrink-0">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#workspace"
          onClick={(e) => e.preventDefault()}
          className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
        >
          VektorCAD 專業工程製圖
        </a>

        {/* Zone 2: 4 single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-300">
          <button
            type="button"
            onClick={() => setActiveModal('templates')}
            className="hover:text-sky-300 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            工程圖範本庫
          </button>
          <button
            type="button"
            onClick={() => setActiveModal('array')}
            className="hover:text-sky-300 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            陣列複製工具
          </button>
          <button
            type="button"
            onClick={() => setActiveModal('shortcuts')}
            className="hover:text-sky-300 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            鍵盤快捷鍵一覽
          </button>
          <button
            type="button"
            onClick={() => {
              pushEntities([]);
              setSelectedIds([]);
              logCommand('已清空畫布，可開始繪製新工程圖。', 'info');
            }}
            className="hover:text-rose-300 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            清空畫布重繪
          </button>
        </nav>

        {/* Zone 3: 1 primary CTA button */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setActiveModal('export')}
            className="px-3.5 py-1.5 text-xs font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0"
          >
            匯出 DXF / SVG 圖檔
          </button>
        </div>
      </header>

      {/* Secondary Workspace Ribbon Toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-1.5 bg-[#0B0F17] border-b border-slate-800/90 text-xs shrink-0 overflow-x-auto">
        {/* Left: Core Quick Actions (Line, Dimension, Auto-Dimension, Ortho) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => handleSelectTool('line')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium border transition-colors whitespace-nowrap shrink-0 ${
              activeTool === 'line'
                ? 'bg-sky-500 text-white border-sky-400 shadow-sm'
                : 'bg-slate-900 text-slate-200 border-slate-700 hover:border-sky-500/60'
            }`}
          >
            <Minus className="w-3.5 h-3.5 -rotate-45" />
            <span>畫直線 (L)</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTool('dimension')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium border transition-colors whitespace-nowrap shrink-0 ${
              activeTool === 'dimension'
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                : 'bg-slate-900 text-slate-200 border-slate-700 hover:border-amber-500/60'
            }`}
          >
            <Ruler className="w-3.5 h-3.5" />
            <span>標註尺寸 (D)</span>
          </button>

          <button
            type="button"
            onClick={handleAutoDimensionSelected}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md font-medium bg-slate-900 text-amber-300 border border-amber-500/40 hover:bg-amber-500/15 transition-colors whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>自動標註選取物件 (B)</span>
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          {/* Undo / Redo */}
          <button
            type="button"
            onClick={handleUndo}
            disabled={historyIndex === 0}
            title="復原 (Ctrl+Z)"
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>復原</span>
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            title="重做 (Ctrl+Y)"
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <Redo2 className="w-3.5 h-3.5" />
            <span>重做</span>
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          {/* Zoom Controls */}
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(25, z * 1.25))}
            title="放大視角"
            className="p-1.5 rounded bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.15, z / 1.25))}
            title="縮小視角"
            className="p-1.5 rounded bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleZoomExtents}
            title="縮放至全圖範圍 (快捷鍵 Z)"
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Maximize className="w-3.5 h-3.5" />
            <span>全圖視角 (Z)</span>
          </button>
        </div>

        {/* Right: Active Layer Quick Switcher & Tool Parameters */}
        <div className="flex items-center gap-3 shrink-0">
          {activeTool === 'polygon' && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">多邊形邊數:</span>
              <input
                type="number"
                min={3}
                max={24}
                value={polygonSides}
                onChange={(e) =>
                  setPolygonSides(
                    Math.max(3, Math.min(24, Number(e.target.value)))
                  )
                }
                className="w-14 px-2 py-0.5 font-mono bg-slate-900 border border-slate-700 rounded text-slate-100"
              />
            </div>
          )}

          {activeTool === 'offset' && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">偏移距離 (mm):</span>
              <input
                type="number"
                min={1}
                max={1000}
                value={offsetDistance}
                onChange={(e) =>
                  setOffsetDistance(Math.max(1, Number(e.target.value)))
                }
                className="w-16 px-2 py-0.5 font-mono bg-slate-900 border border-slate-700 rounded text-slate-100"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-slate-400 whitespace-nowrap">目前圖層:</span>
            <select
              value={activeLayerId}
              onChange={(e) => setActiveLayerId(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            >
              {layers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main 3-Column CAD Workspace: ToolPalette + CadViewport + InspectorSidebar */}
      <main className="flex-1 flex min-h-0 overflow-hidden">
        <ToolPalette
          activeTool={activeTool}
          onSelectTool={handleSelectTool}
          selectedCount={selectedIds.length}
          onOpenArrayModal={() => setActiveModal('array')}
          onExplodeSelected={handleExplodeSelected}
          onDeleteSelected={handleDeleteSelected}
          onAutoDimensionSelected={handleAutoDimensionSelected}
        />

        <CadViewport
          entities={entities}
          layers={layers}
          activeLayerId={activeLayerId}
          activeTool={activeTool}
          selectedIds={selectedIds}
          settings={settings}
          polygonSides={polygonSides}
          offsetDistance={offsetDistance}
          pan={pan}
          zoom={zoom}
          onPanZoomChange={(nextPan, nextZoom) => {
            setPan(nextPan);
            setZoom(nextZoom);
          }}
          onCursorMove={(pt, snap) => {
            setCursorWorld(pt);
            setActiveSnap(snap);
          }}
          onSelectChange={setSelectedIds}
          onAddEntity={handleAddEntity}
          onUpdateEntities={handleUpdateEntities}
          onLogCommand={logCommand}
          onToolComplete={() => handleSelectTool('select')}
          drawingPoints={drawingPoints}
          setDrawingPoints={setDrawingPoints}
        />

        <InspectorSidebar
          layers={layers}
          activeLayerId={activeLayerId}
          onSelectLayer={setActiveLayerId}
          onUpdateLayer={(updatedLayer) =>
            setLayers((prev) =>
              prev.map((l) => (l.id === updatedLayer.id ? updatedLayer : l))
            )
          }
          onAddLayer={(name, color) => {
            const newId = `L_${Date.now()}`;
            setLayers((prev) => [
              ...prev,
              {
                id: newId,
                name,
                color,
                visible: true,
                locked: false,
                lineType: 'continuous',
                lineWeight: 0.25,
              },
            ]);
            setActiveLayerId(newId);
            logCommand(`已建立新圖層：「${name}」`, 'success');
          }}
          onDeleteLayer={(id) => {
            if (id === '0') return;
            setLayers((prev) => prev.filter((l) => l.id !== id));
            if (activeLayerId === id) setActiveLayerId('0');
            logCommand('已刪除圖層', 'info');
          }}
          entities={entities}
          selectedIds={selectedIds}
          onUpdateEntities={handleUpdateEntities}
          onDeleteSelected={handleDeleteSelected}
          onExplodeSelected={handleExplodeSelected}
          onDuplicateSelected={handleDuplicateSelected}
          settings={settings}
          onUpdateSettings={setSettings}
        />
      </main>

      {/* Bottom AutoCAD Command Line & Precision Status Dock */}
      <CommandDock
        logs={logs}
        activeTool={activeTool}
        cursorWorld={cursorWorld}
        activeSnap={activeSnap}
        zoom={zoom}
        settings={settings}
        onToggleSetting={toggleSetting}
        onExecuteCommand={handleExecuteCommand}
      />

      {/* Modal 1: Blueprint Templates Library */}
      {activeModal === 'templates' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-sky-400" />
                <h2 className="text-base font-bold text-slate-100">
                  載入標準工程圖範本
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-xs text-slate-400 hover:text-white"
              >
                關閉 (ESC)
              </button>
            </div>
            <div className="space-y-3">
              {BLUEPRINT_TEMPLATES.map((tpl) => (
                <div
                  key={tpl.id}
                  className="flex items-center justify-between p-4 bg-slate-950/80 border border-slate-800 hover:border-sky-500/60 rounded-lg transition-colors"
                >
                  <div className="space-y-1 pr-4">
                    <div className="text-sm font-semibold text-slate-100">
                      {tpl.name}
                    </div>
                    <div className="text-xs text-slate-400">
                      {tpl.category} · {tpl.description}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      pushEntities(tpl.entities);
                      setSelectedIds([]);
                      setActiveModal(null);
                      logCommand(`已載入工程圖範本：「${tpl.name}」`, 'success');
                    }}
                    className="px-4 py-2 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-lg whitespace-nowrap shrink-0"
                  >
                    載入此圖面
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Keyboard Shortcuts Cheat Sheet */}
      {activeModal === 'shortcuts' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-sky-400" />
                <h2 className="text-base font-bold text-slate-100">
                  鍵盤快捷鍵與精確製圖指南
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-3 py-1 text-xs bg-slate-800 text-slate-200 rounded hover:bg-slate-700"
              >
                關閉
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-2">
                <h3 className="font-semibold text-sky-300 mb-2">
                  繪圖與標註快捷鍵（直接按鍵即可觸發）
                </h3>
                {[
                  ['L', '畫直線 (可連續繪製，支援直接輸入長度)'],
                  ['D', '標註尺寸 (點選兩端點後拉出標註線)'],
                  ['B', '一鍵自動標註目前已選取的直線/矩形/圓形'],
                  ['P', '聚合線 (按 C 封閉、按 Enter 結束)'],
                  ['R', '畫矩形 (支援輸入寬度 Tab 高度)'],
                  ['C', '畫圓形 (指定圓心與半徑 R)'],
                  ['A', '三點圓弧 (圓心 → 起點 → 終點角度)'],
                  ['G', '正多邊形 (3 至 24 邊形)'],
                  ['T', '插入工程文字標註'],
                  ['K', '測量兩點距離、ΔX、ΔY 與角度'],
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-slate-300">{desc}</span>
                    <kbd className="px-2 py-0.5 font-mono font-semibold bg-slate-900 text-sky-300 border border-slate-700 rounded">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-2">
                <h3 className="font-semibold text-amber-300 mb-2">
                  修改、鎖點與視角控制快捷鍵
                </h3>
                {[
                  ['V / ESC', '選取模式 / 取消目前步驟'],
                  ['F8', '切換「正交鎖定 ORTHO」(畫水平/垂直線必備)'],
                  ['F3', '切換「物件鎖點 OSNAP」(自動吸附端點/中點/圓心)'],
                  ['F12', '切換「動態輸入 DYN」(游標旁即時輸入長度/角度)'],
                  ['M / J / Q', '移動 (M) / 連續複製 (J) / 旋轉 (Q)'],
                  ['S / W / O', '縮放 (S) / 對稱鏡射 (W) / 偏移複製 (O)'],
                  ['X / DEL', '炸開圖元為直線 (X) / 刪除選取物件 (DEL)'],
                  ['Z', '自動縮放至全圖最佳視角 (Zoom Extents)'],
                  ['Ctrl+Z / Y', '復原上一步 / 重做'],
                  ['空白鍵 / 中鍵', '按住拖曳平移畫布，滾輪縮放'],
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-slate-300">{desc}</span>
                    <kbd className="px-2 py-0.5 font-mono font-semibold bg-slate-900 text-amber-300 border border-slate-700 rounded">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Rectangular & Polar Array Generator */}
      {activeModal === 'array' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Grid className="w-5 h-5 text-sky-400" />
                <h2 className="text-base font-bold text-slate-100">
                  陣列複製工具 (ARRAY)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-xs text-slate-400 hover:text-white"
              >
                關閉
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setArrayMode('rect')}
                  className={`py-1.5 rounded font-medium ${
                    arrayMode === 'rect'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  矩形陣列 (Rectangular)
                </button>
                <button
                  type="button"
                  onClick={() => setArrayMode('polar')}
                  className={`py-1.5 rounded font-medium ${
                    arrayMode === 'polar'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  環形陣列 (Polar 360°)
                </button>
              </div>

              {arrayMode === 'rect' ? (
                <div className="grid grid-cols-2 gap-3 font-mono">
                  <div>
                    <label className="block text-slate-400 mb-1">列數 (Rows)</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={arrayRows}
                      onChange={(e) => setArrayRows(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">欄數 (Columns)</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={arrayCols}
                      onChange={(e) => setArrayCols(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">水平間距 ΔX (mm)</label>
                    <input
                      type="number"
                      value={arraySpacingX}
                      onChange={(e) => setArraySpacingX(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">垂直間距 ΔY (mm)</label>
                    <input
                      type="number"
                      value={arraySpacingY}
                      onChange={(e) => setArraySpacingY(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3 font-mono">
                  <div>
                    <label className="block text-slate-400 mb-1">
                      環形陣列總數量 (360° 等分)
                    </label>
                    <input
                      type="number"
                      min={2}
                      max={36}
                      value={arrayPolarCount}
                      onChange={(e) => setArrayPolarCount(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">旋轉中心 X (mm)</label>
                      <input
                        type="number"
                        value={arrayPolarCenterX}
                        onChange={(e) =>
                          setArrayPolarCenterX(Number(e.target.value))
                        }
                        className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">旋轉中心 Y (mm)</label>
                      <input
                        type="number"
                        value={arrayPolarCenterY}
                        onChange={(e) =>
                          setArrayPolarCenterY(Number(e.target.value))
                        }
                        className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleCreateArray}
                  className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 text-white font-medium rounded-lg hover:bg-sky-500"
                >
                  <Check className="w-4 h-4" />
                  <span>套用陣列 ({selectedIds.length} 個已選物件)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Export DXF / SVG / JSON */}
      {activeModal === 'export' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-sky-400" />
                <h2 className="text-base font-bold text-slate-100">
                  匯出工程圖檔 (DXF / SVG / JSON)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-xs text-slate-400 hover:text-white"
              >
                關閉
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <button
                type="button"
                onClick={() => {
                  const dxf = exportToDXF(entities, layers);
                  downloadFile(dxf, `vektorcad_${Date.now()}.dxf`, 'application/dxf');
                  setActiveModal(null);
                  logCommand('已匯出標準 AutoCAD .DXF 圖檔！', 'success');
                }}
                className="w-full flex items-center justify-between p-3.5 bg-slate-950 hover:bg-slate-800/90 border border-slate-800 hover:border-sky-500/60 rounded-lg text-left transition-colors"
              >
                <div>
                  <div className="font-semibold text-slate-100">
                    匯出 AutoCAD 標準交換格式 (.DXF)
                  </div>
                  <div className="text-slate-400 mt-0.5">
                    相容於 AutoCAD、SolidWorks、Rhino 與各類 CNC 軟體
                  </div>
                </div>
                <span className="px-2.5 py-1 font-mono bg-sky-500/20 text-sky-300 rounded">
                  .DXF
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const svg = exportToSVG(entities, layers);
                  downloadFile(svg, `vektorcad_${Date.now()}.svg`, 'image/svg+xml');
                  setActiveModal(null);
                  logCommand('已匯出高解析向量 .SVG 工程圖檔！', 'success');
                }}
                className="w-full flex items-center justify-between p-3.5 bg-slate-950 hover:bg-slate-800/90 border border-slate-800 hover:border-emerald-500/60 rounded-lg text-left transition-colors"
              >
                <div>
                  <div className="font-semibold text-slate-100">
                    匯出可縮放向量圖形 (.SVG)
                  </div>
                  <div className="text-slate-400 mt-0.5">
                    保留圖層顏色、虛線中心線型與尺寸標註，適合列印與報告
                  </div>
                </div>
                <span className="px-2.5 py-1 font-mono bg-emerald-500/20 text-emerald-300 rounded">
                  .SVG
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const json = JSON.stringify({ layers, entities }, null, 2);
                  downloadFile(
                    json,
                    `vektorcad_project_${Date.now()}.json`,
                    'application/json'
                  );
                  setActiveModal(null);
                  logCommand('已儲存專案原始檔 (.JSON)', 'success');
                }}
                className="w-full flex items-center justify-between p-3.5 bg-slate-950 hover:bg-slate-800/90 border border-slate-800 hover:border-amber-500/60 rounded-lg text-left transition-colors"
              >
                <div>
                  <div className="font-semibold text-slate-100">
                    儲存完整專案檔 (.JSON)
                  </div>
                  <div className="text-slate-400 mt-0.5">
                    包含完整圖層設定與幾何參數備份
                  </div>
                </div>
                <span className="px-2.5 py-1 font-mono bg-amber-500/20 text-amber-300 rounded">
                  .JSON
                </span>
              </button>

              <label className="w-full flex items-center justify-between p-3.5 bg-slate-950 hover:bg-slate-800/90 border border-slate-800 hover:border-sky-500/60 rounded-lg text-left transition-colors cursor-pointer">
                <div>
                  <div className="font-semibold text-slate-100">
                    匯入並還原專案檔 (.JSON)
                  </div>
                  <div className="text-slate-400 mt-0.5">
                    從電腦讀取先前備份的 VektorCAD .JSON 檔案
                  </div>
                </div>
                <span className="px-2.5 py-1 font-mono bg-slate-800 text-slate-200 rounded">
                  讀取檔案
                </span>
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      try {
                        const parsed = JSON.parse(String(reader.result));
                        if (Array.isArray(parsed.entities)) {
                          pushEntities(parsed.entities);
                          if (Array.isArray(parsed.layers)) {
                            setLayers(parsed.layers);
                          }
                          setSelectedIds([]);
                          setActiveModal(null);
                          logCommand(`已成功匯入專案檔：「${file.name}」`, 'success');
                        } else {
                          logCommand('檔案格式不符，請選擇有效的 VektorCAD .JSON 專案檔。', 'error');
                        }
                      } catch {
                        logCommand('讀取 JSON 專案檔失敗。', 'error');
                      }
                    };
                    reader.readAsText(file);
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
