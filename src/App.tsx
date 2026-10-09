import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Search,
  Download,
  Minus,
  Ruler,
  Sparkles,
  Keyboard,
  FolderOpen,
  Grid,
  Check,
  PanelLeft,
  PanelRight,
  Scissors,
  ArrowUpRight,
  Combine,
  Trash2,
  Clipboard,
  ClipboardCopy,
  AlignCenterHorizontal,
  X,
} from 'lucide-react';
import {
  CadEntity,
  CadLayer,
  CommandLogItem,
  DraftingSettings,
  Point,
  RectangleMode,
  SnapPoint,
  ToolType,
} from './types/cad';
import { BLUEPRINT_TEMPLATES, DEFAULT_LAYERS } from './data/templates';
import { CadViewport } from './components/CadViewport';
import { ToolPalette, ThreePointArcIcon } from './components/ToolPalette';
import { InspectorSidebar } from './components/InspectorSidebar';
import { CommandDock } from './components/CommandDock';
import {
  alignSelectedDimensions,
  angleDegrees,
  DEG_TO_RAD,
  dist,
  explodeEntity,
  exportToDXF,
  exportToSVG,
  joinSelectedEntities,
  midpoint,
  rotateEntity,
  translateEntity,
} from './utils/geometry';

const STORAGE_KEY = 'vektorcad_saved_state_v1';

const VALID_ENTITY_TYPES = new Set([
  'line',
  'polyline',
  'rectangle',
  'circle',
  'arc',
  'polygon',
  'dimension',
  'text',
  'group',
]);

function sanitizeLoadedEntities(rawEntities: unknown[]): CadEntity[] {
  const result: CadEntity[] = [];
  for (const item of rawEntities) {
    if (!item || typeof item !== 'object') continue;
    const ent = item as Record<string, unknown>;
    if (typeof ent.type !== 'string' || !VALID_ENTITY_TYPES.has(ent.type)) {
      continue;
    }
    if (ent.type === 'group') {
      const children = Array.isArray(ent.children)
        ? sanitizeLoadedEntities(ent.children)
        : [];
      if (children.length > 0) {
        result.push({ ...(ent as unknown as CadEntity), children } as CadEntity);
      }
      continue;
    }
    result.push(ent as unknown as CadEntity);
  }
  return result;
}

function loadSavedState(): { entities: CadEntity[]; layers: CadLayer[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.entities) && Array.isArray(parsed.layers)) {
      return {
        entities: sanitizeLoadedEntities(parsed.entities),
        layers: parsed.layers,
      };
    }
  } catch {
    // Ignore storage parse errors
  }
  return null;
}

function cloneEntityWithNewIds(entity: CadEntity, dx: number, dy: number): CadEntity {
  const shifted = translateEntity(entity, dx, dy);
  const newId = `paste_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  if (shifted.type === 'group') {
    return {
      ...shifted,
      id: newId,
      children: shifted.children.map((c) => cloneEntityWithNewIds(c, 0, 0)),
    };
  }
  return {
    ...shifted,
    id: newId,
  };
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
  const [rectangleMode, setRectangleMode] = useState<RectangleMode>('corner');
  const [defaultDimFontSize, setDefaultDimFontSize] = useState<number>(11);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drawingPoints, setDrawingPoints] = useState<Point[]>([]);

  // Clipboard state for Copy (Ctrl+C), Cut (Ctrl+X), Paste (Ctrl+V)
  const [clipboard, setClipboard] = useState<CadEntity[]>([]);
  const [pasteCount, setPasteCount] = useState<number>(0);

  // Sequential 2-letter shortcut state (e.g. T -> R = TR, E -> X = EX, C -> O = CO, A -> R = AR, Z -> E = ZE)
  const [pendingKeyPrefix, setPendingKeyPrefix] = useState<string | null>(null);
  const prefixTimeoutRef = useRef<number | null>(null);
  const eraseDelayTimeoutRef = useRef<number | null>(null);

  // Responsive sidebar visibility
  const [showLeftPanel, setShowLeftPanel] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [showRightPanel, setShowRightPanel] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1200 : false
  );

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

  // Viewport Pan, Zoom & Auto-Fit Trigger
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1.0);
  const [fitTrigger, setFitTrigger] = useState<number>(1);

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
      text: 'VektorCAD 已就緒 — 支援複製(Ctrl+C)/剪下(Ctrl+X)/貼上(Ctrl+V)、保留原位置組裝圖元(J)、圓形與三點圓弧剪切(TR)、刪除圖元(E)及雙字母快捷鍵依序按鍵執行！',
      type: 'info',
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
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setShowLeftPanel(false);
      }
      const toolNames: Record<ToolType, string> = {
        select: 'SELECT 選取與尺寸修改模式 (快捷鍵 V)',
        pan: 'PAN 平移視景模式 (快捷鍵 H)',
        zoomWindow: 'ZOOM WINDOW 窗選局部放大模式 (快捷鍵 Z) — 請點選放大區域的兩個對角點',
        line: 'LINE 畫直線模式 (快捷鍵 L) — 點選起點與終點，或輸入長度按空白鍵/Enter',
        polyline: 'PLINE 聚合線模式 (快捷鍵 P) — 連續點選頂點，按 C 封閉或按空白鍵/Enter 完成',
        rectangle: `RECTANG 矩形模式 (快捷鍵 R - 目前為${rectangleMode === 'center' ? '中心矩形' : '轉角矩形'})`,
        circle: 'CIRCLE 圓形模式 (快捷鍵 C) — 請點選圓心與半徑',
        arc: 'ARC 三點圓弧模式 (快捷鍵 A) — 依序點選 1.起點 P1、2.弧上第二點 P2、3.終點 P3',
        polygon: 'POLYGON 正多邊形模式 (快捷鍵 G) — 請點選中心與外接圓半徑',
        dimension: 'DIMLINEAR 標註尺寸模式 (快捷鍵 D) — 靠近既有標註線時可自動相互對齊',
        text: 'TEXT 文字註解模式 (快捷鍵 T) — 請點選文字插入位置',
        measure: 'DIST 距離與角度量測模式 (快捷鍵 K) — 請點選兩點進行量測',
        erase: 'ERASE 刪除圖元模式 (快捷鍵 E) — 點選畫布上的任何圖元立即刪除',
        move: 'MOVE 移動物件模式 (快捷鍵 M) — 請指定基準點與目標點',
        copy: 'COPY 連續複製模式 (快捷鍵 CO) — 請指定基準點與放置點',
        rotate: 'ROTATE 旋轉模式 (快捷鍵 Q) — 請指定旋轉中心與角度',
        mirror: 'MIRROR 對稱鏡射模式 (快捷鍵 W) — 請點選兩點定義對稱軸線',
        offset: `OFFSET 偏移複製模式 (快捷鍵 O - 目前偏移距離 ${offsetDistance}mm)`,
        trim: 'TRIM 剪切圖元模式 (快捷鍵 TR) — 支援剪切直線、矩形、圓形與三點圓弧',
        extend: 'EXTEND 延伸圖元模式 (快捷鍵 EX) — 點選線段端點附近延伸至相交邊界',
        join: 'JOIN 組裝圖元模式 (快捷鍵 J) — 保留選取圖元位置並合併為單一組裝物件',
      };
      logCommand(`指令切換: ${toolNames[tool]}`, 'command');
    },
    [logCommand, offsetDistance, rectangleMode]
  );

  // Copy / Cut / Paste Handlers
  const handleCopyClipboard = useCallback(() => {
    const selected = entities.filter((e) => selectedIds.includes(e.id));
    if (selected.length === 0) {
      logCommand('請先選取要複製到剪貼簿的圖元 (Ctrl+C)。', 'error');
      return;
    }
    setClipboard(selected);
    setPasteCount(0);
    logCommand(
      `COPYCLIP 已複製 ${selected.length} 個圖元至剪貼簿 (按 Ctrl+V 貼上)`,
      'success'
    );
  }, [entities, logCommand, selectedIds]);

  const handleCutClipboard = useCallback(() => {
    const selected = entities.filter((e) => selectedIds.includes(e.id));
    if (selected.length === 0) {
      logCommand('請先選取要剪下的圖元 (Ctrl+X)。', 'error');
      return;
    }
    setClipboard(selected);
    setPasteCount(0);
    const remaining = entities.filter((e) => !selectedIds.includes(e.id));
    pushEntities(remaining);
    setSelectedIds([]);
    logCommand(
      `CUTCLIP 已剪下 ${selected.length} 個圖元至剪貼簿 (按 Ctrl+V 貼上)`,
      'success'
    );
  }, [entities, logCommand, pushEntities, selectedIds]);

  const handlePasteClipboard = useCallback(() => {
    if (clipboard.length === 0) {
      logCommand('剪貼簿目前為空，請先複製 (Ctrl+C) 或剪下 (Ctrl+X) 圖元。', 'error');
      return;
    }
    const nextStep = pasteCount + 1;
    setPasteCount(nextStep);
    const offset = nextStep * 20;
    const pasted = clipboard.map((ent) =>
      cloneEntityWithNewIds(ent, offset, -offset)
    );
    pushEntities([...entities, ...pasted]);
    setSelectedIds(pasted.map((p) => p.id));
    setActiveTool('select');
    logCommand(
      `PASTECLIP 已貼上 ${pasted.length} 個圖元 (偏移 +${offset}, -${offset} mm) — 可直接拖曳或按 M 移動`,
      'success'
    );
  }, [clipboard, entities, logCommand, pasteCount, pushEntities]);

  // Assemble / Join (組裝圖元) selected entities into a single composite GroupEntity preserving exact positions!
  const handleJoinSelected = useCallback(() => {
    const selectedEntities = entities.filter((e) => selectedIds.includes(e.id));
    if (selectedEntities.length < 2) {
      handleSelectTool('join');
      logCommand(
        'JOIN 組裝圖元：請先點選 2 個以上要組裝的圖元，再按空白鍵或 Enter 保留原位置組裝為單一物件。',
        'info'
      );
      return;
    }

    const grouped = joinSelectedEntities(selectedEntities, activeLayerId);
    if (!grouped) {
      logCommand('請選取至少 2 個圖元進行組裝。', 'error');
      return;
    }

    const remaining = entities.filter((e) => !selectedIds.includes(e.id));
    pushEntities([...remaining, grouped]);
    setSelectedIds([grouped.id]);
    setActiveTool('select');
    logCommand(
      `JOIN 已保留原始位置將 ${selectedEntities.length} 個圖元組裝為單一物件（共包含 ${grouped.children.length} 個子圖元，按 X 可隨時炸開）！`,
      'success'
    );
  }, [
    activeLayerId,
    entities,
    handleSelectTool,
    logCommand,
    pushEntities,
    selectedIds,
  ]);

  // Align multiple selected dimensions
  const handleAlignDimensions = useCallback(() => {
    const { updated, alignedCount } = alignSelectedDimensions(
      entities,
      selectedIds
    );
    if (alignedCount < 2) {
      logCommand(
        '請先同時選取 2 個以上的「標註尺寸」物件（按住 Shift 點選或拉框選取），即可一鍵相互對齊！或者在繪製標註時將游標靠近既有標註線也會自動吸附對齊。',
        'info'
      );
      return;
    }
    pushEntities(updated);
    logCommand(
      `DIM ALIGN 已將 ${alignedCount} 個標註尺寸相互對齊至同一標註基準線！`,
      'success'
    );
  }, [entities, logCommand, pushEntities, selectedIds]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.length === 0) {
      handleSelectTool('erase');
      return;
    }
    const remaining = entities.filter((e) => !selectedIds.includes(e.id));
    pushEntities(remaining);
    logCommand(`ERASE 已刪除 ${selectedIds.length} 個圖元物件 (E / DEL)`, 'success');
    setSelectedIds([]);
  }, [entities, handleSelectTool, logCommand, pushEntities, selectedIds]);

  const handleExplodeSelected = useCallback(() => {
    if (selectedIds.length === 0) {
      logCommand(
        'EXPLODE 請先選取要炸開的「組裝圖元」、「中心矩形 / 轉角矩形」、聚合線或多邊形。',
        'error'
      );
      return;
    }
    let explodedCount = 0;
    const nextEntities: CadEntity[] = [];
    const newSelectedIds: string[] = [];
    for (const ent of entities) {
      if (selectedIds.includes(ent.id)) {
        const parts = explodeEntity(ent);
        if (parts && parts.length > 0) {
          nextEntities.push(...parts);
          newSelectedIds.push(...parts.map((p) => p.id));
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
      setSelectedIds(newSelectedIds);
      logCommand(
        `EXPLODE 已成功炸開 ${explodedCount} 個物件（還原為 ${newSelectedIds.length} 個獨立圖元）！`,
        'success'
      );
    } else {
      logCommand(
        '所選物件為單一直線或圓形，無法再炸開（組裝圖元、中心矩形、轉角矩形、聚合線、正多邊形皆可炸開）。',
        'error'
      );
    }
  }, [entities, logCommand, pushEntities, selectedIds]);

  const handleDuplicateSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const copies = entities
      .filter((e) => selectedIds.includes(e.id))
      .map((e) => cloneEntityWithNewIds(e, 25, -25));
    pushEntities([...entities, ...copies]);
    setSelectedIds(copies.map((c) => c.id));
    logCommand(
      `已快速複製 ${copies.length} 個物件 (偏移 +25, -25 mm)`,
      'success'
    );
  }, [entities, logCommand, pushEntities, selectedIds]);

  // One-click Automatic Dimensioning
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
            fontSize: defaultDimFontSize,
          });
        }
      } else if (ent.type === 'rectangle') {
        const minX = Math.min(ent.p1.x, ent.p2.x);
        const maxX = Math.max(ent.p1.x, ent.p2.x);
        const minY = Math.min(ent.p1.y, ent.p2.y);
        const maxY = Math.max(ent.p1.y, ent.p2.y);
        newDims.push({
          id: `autodim_w_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'dimension',
          layerId: dimLayerId,
          p1: { x: minX, y: maxY },
          p2: { x: maxX, y: maxY },
          offsetPoint: { x: (minX + maxX) / 2, y: maxY + 26 },
          fontSize: defaultDimFontSize,
        });
        newDims.push({
          id: `autodim_h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'dimension',
          layerId: dimLayerId,
          p1: { x: maxX, y: minY },
          p2: { x: maxX, y: maxY },
          offsetPoint: { x: maxX + 26, y: (minY + maxY) / 2 },
          fontSize: defaultDimFontSize,
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
          fontSize: defaultDimFontSize,
        });
      }
    }

    if (newDims.length > 0) {
      pushEntities([...entities, ...newDims]);
      logCommand(
        `自動標註完成：已為選取物件產生 ${newDims.length} 組精確尺寸標註！`,
        'success'
      );
    } else {
      logCommand(
        '請選取直線、矩形或圓形以執行自動尺寸標註，或按 [D] 手動點選兩點標註。',
        'info'
      );
    }
  }, [
    activeLayerId,
    defaultDimFontSize,
    entities,
    handleSelectTool,
    layers,
    logCommand,
    pushEntities,
    selectedIds,
  ]);

  const handleZoomExtents = useCallback(() => {
    setFitTrigger((t) => t + 1);
    logCommand('ZOOM EXTENTS 已自動縮放並置中顯示完整圖面 (ZE)', 'info');
  }, [logCommand]);

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

  // Global Direct & Sequential Multi-Letter Keyboard Shortcuts
  useEffect(() => {
    const clearPrefix = () => {
      if (prefixTimeoutRef.current) {
        window.clearTimeout(prefixTimeoutRef.current);
        prefixTimeoutRef.current = null;
      }
      setPendingKeyPrefix(null);
    };

    const startPrefix = (letter: string) => {
      if (prefixTimeoutRef.current) {
        window.clearTimeout(prefixTimeoutRef.current);
      }
      setPendingKeyPrefix(letter);
      prefixTimeoutRef.current = window.setTimeout(() => {
        setPendingKeyPrefix(null);
        prefixTimeoutRef.current = null;
      }, 950);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

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

      // Ctrl/Cmd + Z, Y, C, X, V, D
      if (e.ctrlKey || e.metaKey) {
        const lower = e.key.toLowerCase();
        if (lower === 'z') {
          e.preventDefault();
          if (e.shiftKey) handleRedo();
          else handleUndo();
          return;
        }
        if (lower === 'y') {
          e.preventDefault();
          handleRedo();
          return;
        }
        if (lower === 'c') {
          e.preventDefault();
          handleCopyClipboard();
          return;
        }
        if (lower === 'x') {
          e.preventDefault();
          handleCutClipboard();
          return;
        }
        if (lower === 'v') {
          e.preventDefault();
          handlePasteClipboard();
          return;
        }
        if (lower === 'd') {
          e.preventDefault();
          handleDuplicateSelected();
          return;
        }
        return;
      }

      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        drawingPoints.length === 0 &&
        selectedIds.length > 0 &&
        activeTool !== 'offset'
      ) {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }

      if (e.altKey) return;

      const k = e.key.toLowerCase();
      if (!/^[a-z]$/.test(k)) return;

      // Allow 'c' to close a polyline if currently drawing a polyline with >= 3 points
      if (k === 'c' && activeTool === 'polyline' && drawingPoints.length >= 3) {
        return;
      }

      // 1. Check 2-letter sequential shortcut combinations first (when drawingPoints.length === 0)
      if (pendingKeyPrefix && drawingPoints.length === 0) {
        const combo = `${pendingKeyPrefix}${k.toUpperCase()}`;
        if (combo === 'TR') {
          e.preventDefault();
          clearPrefix();
          handleSelectTool('trim');
          return;
        }
        if (combo === 'EX') {
          e.preventDefault();
          if (eraseDelayTimeoutRef.current) {
            window.clearTimeout(eraseDelayTimeoutRef.current);
            eraseDelayTimeoutRef.current = null;
          }
          clearPrefix();
          handleSelectTool('extend');
          return;
        }
        if (combo === 'CO' || combo === 'CP') {
          e.preventDefault();
          clearPrefix();
          handleSelectTool('copy');
          return;
        }
        if (combo === 'AR') {
          e.preventDefault();
          clearPrefix();
          setActiveTool('select');
          setActiveModal('array');
          logCommand('指令切換: ARRAY 陣列複製工具 (快捷鍵 AR)', 'command');
          return;
        }
        if (combo === 'ZE') {
          e.preventDefault();
          clearPrefix();
          setActiveTool('select');
          handleZoomExtents();
          return;
        }
        if (combo === 'ZW') {
          e.preventDefault();
          clearPrefix();
          handleSelectTool('zoomWindow');
          return;
        }
      }

      // 2. Single-key shortcuts (and start prefix if it's T, E, C, A, Z)
      switch (k) {
        case 't':
          e.preventDefault();
          startPrefix('T');
          handleSelectTool('text');
          break;
        case 'e':
          e.preventDefault();
          startPrefix('E');
          if (selectedIds.length > 0) {
            // Delay 300ms in case the user is typing E -> X for Extend (EX)
            if (eraseDelayTimeoutRef.current) {
              window.clearTimeout(eraseDelayTimeoutRef.current);
            }
            eraseDelayTimeoutRef.current = window.setTimeout(() => {
              eraseDelayTimeoutRef.current = null;
              setPendingKeyPrefix(null);
              handleDeleteSelected();
            }, 300);
          } else {
            handleSelectTool('erase');
          }
          break;
        case 'c':
          e.preventDefault();
          startPrefix('C');
          handleSelectTool('circle');
          break;
        case 'a':
          e.preventDefault();
          startPrefix('A');
          handleSelectTool('arc');
          break;
        case 'z':
          e.preventDefault();
          startPrefix('Z');
          handleSelectTool('zoomWindow');
          break;
        case 'l':
          e.preventDefault();
          clearPrefix();
          handleSelectTool('line');
          break;
        case 'd':
          e.preventDefault();
          clearPrefix();
          handleSelectTool('dimension');
          break;
        case 'b':
          e.preventDefault();
          clearPrefix();
          handleAutoDimensionSelected();
          break;
        case 'p':
          e.preventDefault();
          clearPrefix();
          handleSelectTool('polyline');
          break;
        case 'r':
          e.preventDefault();
          clearPrefix();
          handleSelectTool('rectangle');
          break;
        case 'g':
          e.preventDefault();
          clearPrefix();
          handleSelectTool('polygon');
          break;
        case 'k':
          e.preventDefault();
          clearPrefix();
          handleSelectTool('measure');
          break;
        case 'v':
          e.preventDefault();
          clearPrefix();
          handleSelectTool('select');
          break;
        case 'h':
          e.preventDefault();
          clearPrefix();
          handleSelectTool('pan');
          break;
        case 'm':
          e.preventDefault();
          clearPrefix();
          handleSelectTool('move');
          break;
        case 'j':
          e.preventDefault();
          clearPrefix();
          if (selectedIds.length >= 2) {
            handleJoinSelected();
          } else {
            handleSelectTool('join');
          }
          break;
        case 'q':
          e.preventDefault();
          clearPrefix();
          handleSelectTool('rotate');
          break;
        case 'w':
          e.preventDefault();
          clearPrefix();
          handleSelectTool('mirror');
          break;
        case 'o':
          e.preventDefault();
          clearPrefix();
          handleSelectTool('offset');
          break;
        case 'x':
          e.preventDefault();
          clearPrefix();
          handleExplodeSelected();
          break;
        default:
          clearPrefix();
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeTool,
    drawingPoints.length,
    handleAutoDimensionSelected,
    handleCopyClipboard,
    handleCutClipboard,
    handleDeleteSelected,
    handleDuplicateSelected,
    handleExplodeSelected,
    handleJoinSelected,
    handlePasteClipboard,
    handleRedo,
    handleSelectTool,
    handleUndo,
    handleZoomExtents,
    logCommand,
    pendingKeyPrefix,
    selectedIds.length,
    toggleSetting,
  ]);

  // Execute typed AutoCAD Command or Coordinate from Command Line
  const handleExecuteCommand = (rawInput: string) => {
    const trimmed = rawInput.trim();
    const upper = trimmed.toUpperCase();
    logCommand(`> ${trimmed}`, 'command');

    if (upper === 'E' || upper === 'ERASE' || upper === 'DEL' || upper === '刪除') {
      if (selectedIds.length > 0) {
        handleDeleteSelected();
      } else {
        handleSelectTool('erase');
      }
      return;
    }

    if (upper === 'J' || upper === 'JOIN' || upper === '組裝' || upper === '組裝圖元') {
      handleJoinSelected();
      return;
    }

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
      三點圓弧: 'arc',
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
      MI: 'mirror',
      MIRROR: 'mirror',
      鏡射: 'mirror',
      O: 'offset',
      OFFSET: 'offset',
      偏移: 'offset',
      TR: 'trim',
      TRIM: 'trim',
      剪切: 'trim',
      修剪: 'trim',
      EX: 'extend',
      EXTEND: 'extend',
      延伸: 'extend',
      Z: 'zoomWindow',
      ZW: 'zoomWindow',
      窗選放大: 'zoomWindow',
      局部放大: 'zoomWindow',
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
    if (upper === 'X' || upper === 'EXPLODE' || upper === '炸開') {
      handleExplodeSelected();
      return;
    }
    if (upper === 'B' || upper === 'AUTODIM' || upper === '自動標註') {
      handleAutoDimensionSelected();
      return;
    }
    if (upper === 'ALIGN' || upper === '對齊標註') {
      handleAlignDimensions();
      return;
    }
    if (upper === 'ZE' || upper === 'ZOOM' || upper === '全圖置中') {
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

    if (activeTool === 'offset' && /^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      const val = parseFloat(trimmed);
      if (!isNaN(val) && val > 0) {
        setOffsetDistance(val);
        logCommand(`OFFSET 已設定偏移距離 = ${val.toFixed(2)} mm`, 'success');
        return;
      }
    }

    const anchor =
      drawingPoints.length > 0
        ? drawingPoints[drawingPoints.length - 1]
        : { x: 0, y: 0 };

    let targetPt: Point | null = null;

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
          logCommand(
            `已指定直線起點: (${targetPt.x.toFixed(1)}, ${targetPt.y.toFixed(1)})`,
            'info'
          );
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
        logCommand(
          `已輸入座標點: (${targetPt.x.toFixed(1)}, ${targetPt.y.toFixed(1)})`,
          'info'
        );
      }
      return;
    }

    logCommand(
      `未知指令「${trimmed}」— 支援指令：L (直線)、D (標註)、R (矩形)、A (三點圓弧)、E (刪除)、TR (剪切)、EX (延伸)、J (組裝圖元)、X (炸開)、O (偏移)、Z (窗選放大)`,
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
            generated.push(cloneEntityWithNewIds(ent, dx, dy));
          }
        }
      }
    } else {
      const center = { x: arrayPolarCenterX, y: arrayPolarCenterY };
      for (let i = 1; i < arrayPolarCount; i++) {
        const angleRad = (i * 2 * Math.PI) / arrayPolarCount;
        for (const ent of baseEntities) {
          const rotated = rotateEntity(ent, center, angleRad);
          generated.push(cloneEntityWithNewIds(rotated, 0, 0));
        }
      }
    }

    pushEntities([...entities, ...generated]);
    setActiveModal(null);
    logCommand(
      `ARRAY 已成功產生 ${generated.length} 個陣列複製物件！`,
      'success'
    );
  };

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
    <div className="safe-app-container flex flex-col w-full h-full max-h-[100dvh] bg-[#0B0F17] text-slate-100 overflow-hidden select-none">
      {/* Top Bar Contract: 3 Zones */}
      <header className="flex items-center justify-between gap-4 sm:gap-8 px-3 sm:px-5 py-2 bg-[#0F172A] border-b border-slate-800 shrink-0">
        <a
          href="#workspace"
          onClick={(e) => e.preventDefault()}
          className="text-sm sm:text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
        >
          VektorCAD 專業工程製圖
        </a>

        <nav className="flex items-center gap-3 sm:gap-6 text-xs font-medium text-slate-300 overflow-x-auto">
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
            陣列複製 (AR)
          </button>
          <button
            type="button"
            onClick={() => setActiveModal('shortcuts')}
            className="hover:text-sky-300 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            快捷鍵一覽
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
            清空畫布
          </button>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveModal('export')}
            className="px-3 py-1.5 text-xs font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0"
          >
            匯出 / 匯入圖檔
          </button>
        </div>
      </header>

      {/* Secondary Workspace Ribbon Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#0B0F17] border-b border-slate-800/90 text-xs shrink-0 overflow-x-auto">
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowLeftPanel((v) => !v)}
            title="展開 / 收合左側繪圖工具箱"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md border font-medium transition-colors whitespace-nowrap shrink-0 ${
              showLeftPanel
                ? 'bg-slate-800 text-sky-300 border-slate-700'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <PanelLeft className="w-3.5 h-3.5" />
            <span>工具箱</span>
          </button>

          <div className="h-4 w-px bg-slate-800 mx-0.5" />

          <button
            type="button"
            onClick={() => handleSelectTool('line')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium border transition-colors whitespace-nowrap shrink-0 ${
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
            onClick={() => handleSelectTool('arc')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium border transition-colors whitespace-nowrap shrink-0 ${
              activeTool === 'arc'
                ? 'bg-sky-500 text-white border-sky-400 shadow-sm'
                : 'bg-slate-900 text-slate-200 border-slate-700 hover:border-sky-500/60'
            }`}
          >
            <ThreePointArcIcon className="w-3.5 h-3.5" />
            <span>三點圓弧 (A)</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTool('dimension')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium border transition-colors whitespace-nowrap shrink-0 ${
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
            onClick={() => handleSelectTool('trim')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium border transition-colors whitespace-nowrap shrink-0 ${
              activeTool === 'trim'
                ? 'bg-rose-600 text-white border-rose-400 shadow-sm'
                : 'bg-slate-900 text-slate-200 border-slate-700 hover:border-rose-500/60'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>剪切 (TR)</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTool('extend')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium border transition-colors whitespace-nowrap shrink-0 ${
              activeTool === 'extend'
                ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm'
                : 'bg-slate-900 text-slate-200 border-slate-700 hover:border-emerald-500/60'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>延伸 (EX)</span>
          </button>

          <button
            type="button"
            onClick={handleJoinSelected}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium border transition-colors whitespace-nowrap shrink-0 ${
              activeTool === 'join'
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                : 'bg-slate-900 text-slate-200 border-slate-700 hover:border-amber-500/60'
            }`}
          >
            <Combine className="w-3.5 h-3.5" />
            <span>組裝圖元 (J)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (selectedIds.length > 0) handleDeleteSelected();
              else handleSelectTool('erase');
            }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium border transition-colors whitespace-nowrap shrink-0 ${
              activeTool === 'erase'
                ? 'bg-rose-600 text-white border-rose-400 shadow-sm'
                : 'bg-slate-900 text-rose-300 border-rose-500/40 hover:bg-rose-950/50'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>刪除圖元 (E)</span>
          </button>

          <div className="h-4 w-px bg-slate-800 mx-0.5" />

          {/* Copy / Cut / Paste Ribbon Buttons */}
          <button
            type="button"
            onClick={handleCopyClipboard}
            disabled={selectedIds.length === 0}
            title="複製選取圖元 (Ctrl+C)"
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <ClipboardCopy className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">複製</span>
          </button>
          <button
            type="button"
            onClick={handleCutClipboard}
            disabled={selectedIds.length === 0}
            title="剪下選取圖元 (Ctrl+X)"
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">剪下</span>
          </button>
          <button
            type="button"
            onClick={handlePasteClipboard}
            disabled={clipboard.length === 0}
            title="貼上剪貼簿圖元 (Ctrl+V)"
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 text-sky-300 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <Clipboard className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">貼上</span>
          </button>

          {/* Undo / Redo */}
          <button
            type="button"
            onClick={handleUndo}
            disabled={historyIndex === 0}
            title="復原 (Ctrl+Z)"
            className="p-1.5 rounded bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 shrink-0"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            title="重做 (Ctrl+Y)"
            className="p-1.5 rounded bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 shrink-0"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          {/* Zoom Controls */}
          <button
            type="button"
            onClick={() => handleSelectTool('zoomWindow')}
            title="窗選局部放大 (快捷鍵 Z)"
            className={`flex items-center gap-1 px-2.5 py-1 rounded border font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTool === 'zoomWindow'
                ? 'bg-purple-600 text-white border-purple-400 shadow-sm'
                : 'bg-purple-950/50 text-purple-300 border-purple-500/40 hover:bg-purple-900/50'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>窗選放大 (Z)</span>
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(25, z * 1.25))}
            title="放大視角"
            className="p-1.5 rounded bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800 shrink-0"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.15, z / 1.25))}
            title="縮小視角"
            className="p-1.5 rounded bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800 shrink-0"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleZoomExtents}
            title="自動縮放並置中顯示完整圖面 (快捷鍵 ZE)"
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-sky-950/60 text-sky-300 border border-sky-500/40 hover:bg-sky-900/60 whitespace-nowrap shrink-0"
          >
            <Maximize className="w-3.5 h-3.5" />
            <span>全圖置中 (ZE)</span>
          </button>
        </div>

        {/* Right: Active Tool Options, Layer Quick Switcher & Inspector Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          {activeTool === 'rectangle' && (
            <div className="flex items-center gap-1 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">
              <button
                type="button"
                onClick={() => setRectangleMode('corner')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                  rectangleMode === 'corner'
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                轉角矩形
              </button>
              <button
                type="button"
                onClick={() => setRectangleMode('center')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium ${
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
            <div className="flex items-center gap-1.5">
              <span className="text-amber-300 font-medium">標註字高:</span>
              <input
                type="number"
                min={6}
                max={72}
                value={defaultDimFontSize}
                onChange={(e) =>
                  setDefaultDimFontSize(
                    Math.max(6, Math.min(72, Number(e.target.value)))
                  )
                }
                className="w-12 px-1.5 py-0.5 font-mono bg-slate-900 border border-amber-500/50 rounded text-amber-200"
              />
              <button
                type="button"
                onClick={handleAlignDimensions}
                title="相互對齊選取的標註尺寸"
                className="flex items-center gap-1 px-2 py-0.5 bg-sky-950/80 hover:bg-sky-900 text-sky-300 border border-sky-500/40 rounded text-[11px]"
              >
                <AlignCenterHorizontal className="w-3 h-3" />
                <span>對齊標註</span>
              </button>
            </div>
          )}

          {activeTool === 'polygon' && (
            <div className="flex items-center gap-1">
              <span className="text-slate-400">邊數:</span>
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
                className="w-12 px-1.5 py-0.5 font-mono bg-slate-900 border border-slate-700 rounded text-slate-100"
              />
            </div>
          )}

          {activeTool === 'offset' && (
            <div className="flex items-center gap-1">
              <span className="text-amber-300 font-medium">偏移距離(mm):</span>
              <input
                type="number"
                min={0.5}
                max={5000}
                step="1"
                value={offsetDistance}
                onChange={(e) =>
                  setOffsetDistance(Math.max(0.5, Number(e.target.value)))
                }
                className="w-16 px-2 py-0.5 font-mono bg-slate-900 border border-amber-500/60 rounded text-amber-200 focus:outline-none focus:border-amber-400"
              />
            </div>
          )}

          <select
            value={activeLayerId}
            onChange={(e) => setActiveLayerId(e.target.value)}
            title="切換目前繪圖圖層"
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-sky-500 max-w-[150px] truncate"
          >
            {layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowRightPanel((v) => !v)}
            title="展開 / 收合右側性質與圖層面板"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md border font-medium transition-colors whitespace-nowrap shrink-0 ${
              showRightPanel
                ? 'bg-slate-800 text-sky-300 border-slate-700'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <PanelRight className="w-3.5 h-3.5" />
            <span>性質/修改尺寸</span>
          </button>
        </div>
      </div>

      {/* Main Responsive CAD Workspace */}
      <main className="relative flex-1 flex min-w-0 min-h-0 overflow-hidden">
        {/* Left Tool Palette */}
        {showLeftPanel && (
          <div className="absolute inset-y-0 left-0 z-30 lg:static lg:z-auto flex h-full shadow-2xl lg:shadow-none">
            <ToolPalette
              activeTool={activeTool}
              onSelectTool={handleSelectTool}
              rectangleMode={rectangleMode}
              onChangeRectangleMode={setRectangleMode}
              offsetDistance={offsetDistance}
              onChangeOffsetDistance={setOffsetDistance}
              selectedCount={selectedIds.length}
              hasClipboard={clipboard.length > 0}
              onCopyClipboard={handleCopyClipboard}
              onCutClipboard={handleCutClipboard}
              onPasteClipboard={handlePasteClipboard}
              onAlignDimensions={handleAlignDimensions}
              onOpenArrayModal={() => setActiveModal('array')}
              onExplodeSelected={handleExplodeSelected}
              onJoinSelected={handleJoinSelected}
              onDeleteSelected={handleDeleteSelected}
              onAutoDimensionSelected={handleAutoDimensionSelected}
            />
            <button
              type="button"
              onClick={() => setShowLeftPanel(false)}
              className="lg:hidden absolute top-2 right-2 p-1 bg-slate-800 text-slate-300 rounded"
              title="關閉工具面板"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Center High-Precision CAD Viewport */}
        <CadViewport
          entities={entities}
          layers={layers}
          activeLayerId={activeLayerId}
          activeTool={activeTool}
          rectangleMode={rectangleMode}
          onChangeRectangleMode={setRectangleMode}
          defaultDimFontSize={defaultDimFontSize}
          onChangeDefaultDimFontSize={setDefaultDimFontSize}
          selectedIds={selectedIds}
          settings={settings}
          polygonSides={polygonSides}
          offsetDistance={offsetDistance}
          onChangeOffsetDistance={setOffsetDistance}
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
          onJoinSelected={handleJoinSelected}
          onExplodeSelected={handleExplodeSelected}
          onDeleteSelected={handleDeleteSelected}
          onAlignDimensions={handleAlignDimensions}
          onLogCommand={logCommand}
          onToolComplete={() => handleSelectTool('select')}
          drawingPoints={drawingPoints}
          setDrawingPoints={setDrawingPoints}
          fitTrigger={fitTrigger}
        />

        {/* Right Inspector & Layers Sidebar */}
        {showRightPanel && (
          <div className="absolute inset-y-0 right-0 z-30 xl:static xl:z-auto flex h-full shadow-2xl xl:shadow-none">
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
              onJoinSelected={handleJoinSelected}
              onAlignDimensions={handleAlignDimensions}
              onDuplicateSelected={handleDuplicateSelected}
              settings={settings}
              onUpdateSettings={setSettings}
            />
          </div>
        )}
      </main>

      {/* Bottom AutoCAD Command Line & Precision Status Dock */}
      <CommandDock
        logs={logs}
        activeTool={activeTool}
        cursorWorld={cursorWorld}
        activeSnap={activeSnap}
        zoom={zoom}
        settings={settings}
        pendingKeyPrefix={pendingKeyPrefix}
        onToggleSetting={toggleSetting}
        onExecuteCommand={handleExecuteCommand}
      />

      {/* Modal 1: Blueprint Templates Library */}
      {activeModal === 'templates' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 overflow-y-auto">
          <div className="w-full max-w-xl max-h-[90dvh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-xl p-5 shadow-2xl">
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
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-950/80 border border-slate-800 hover:border-sky-500/60 rounded-lg transition-colors"
                >
                  <div className="space-y-1">
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
                      setTimeout(() => setFitTrigger((t) => t + 1), 30);
                      logCommand(
                        `已載入工程圖範本：「${tpl.name}」並自動縮放至全圖視角`,
                        'success'
                      );
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-sky-400" />
                <h2 className="text-base font-bold text-slate-100">
                  鍵盤快捷鍵與雙字母連續按鍵指南
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
                  繪圖、檢視與剪貼簿快捷鍵
                </h3>
                {[
                  ['Ctrl+C / X / V', '複製 / 剪下 / 貼上圖元物件'],
                  ['空白鍵 / Enter', '確認輸入數值 / 結束繪製 / 確認組裝'],
                  ['Z / ZE', '窗選局部放大 (Z) / 全圖置中 (按 Z 再按 E)'],
                  ['L', '畫直線 (即時顯示 ΔX/ΔY 相對距離虛線)'],
                  ['R', '畫矩形 (支援「轉角矩形」與「中心矩形」)'],
                  ['A', '三點圓弧 (依序點選 P1 起點、P2 第二點、P3 終點)'],
                  ['D / B', '標註尺寸 (自動吸附對齊) / 自動標註 (B)'],
                  ['C / P / G', '圓形 (C) / 聚合線 (P) / 正多邊形 (G)'],
                  ['T / K', '文字註解 (T) / 測量距離與角度 (K)'],
                ].map(([key, desc]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-slate-300">{desc}</span>
                    <kbd className="px-2 py-0.5 font-mono font-semibold bg-slate-900 text-sky-300 border border-slate-700 rounded shrink-0">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-2">
                <h3 className="font-semibold text-amber-300 mb-2">
                  修改編輯與雙字母順序按鍵快捷鍵
                </h3>
                {[
                  ['E', '刪除圖元 (刪已選物件，或進入點選刪除模式)'],
                  ['T → R (TR)', '依序按 T 與 R：剪切直線、圓形與三點圓弧'],
                  ['E → X (EX)', '依序按 E 與 X：延伸圖元至相交邊界'],
                  ['C → O (CO)', '依序按 C 與 O：連續複製物件'],
                  ['A → R (AR)', '依序按 A 與 R：開啟矩形/環形陣列複製'],
                  ['J', '組裝圖元 (保留選取圖形原位置合併成單一物件)'],
                  ['X', '炸開圖元 (可炸開組裝圖元、中心矩形、多邊形)'],
                  ['O / M / Q / W', '偏移複製 (O) / 移動 (M) / 旋轉 (Q) / 鏡射 (W)'],
                  ['F8 / F3 / F12', '正交鎖定 (F8) / 物件鎖點 (F3) / 動態輸入 (F12)'],
                ].map(([key, desc]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-slate-300">{desc}</span>
                    <kbd className="px-2 py-0.5 font-mono font-semibold bg-slate-900 text-amber-300 border border-slate-700 rounded shrink-0">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 overflow-y-auto">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Grid className="w-5 h-5 text-sky-400" />
                <h2 className="text-base font-bold text-slate-100">
                  陣列複製工具 (ARRAY - 快捷鍵 AR)
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
                    <label className="block text-slate-400 mb-1">
                      列數 (Rows)
                    </label>
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
                    <label className="block text-slate-400 mb-1">
                      欄數 (Columns)
                    </label>
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
                    <label className="block text-slate-400 mb-1">
                      水平間距 ΔX (mm)
                    </label>
                    <input
                      type="number"
                      value={arraySpacingX}
                      onChange={(e) => setArraySpacingX(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">
                      垂直間距 ΔY (mm)
                    </label>
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
                      onChange={(e) =>
                        setArrayPolarCount(Number(e.target.value))
                      }
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">
                        旋轉中心 X (mm)
                      </label>
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
                      <label className="block text-slate-400 mb-1">
                        旋轉中心 Y (mm)
                      </label>
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

      {/* Modal 4: Export DXF / SVG / JSON & Import JSON */}
      {activeModal === 'export' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 overflow-y-auto">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-sky-400" />
                <h2 className="text-base font-bold text-slate-100">
                  匯出與匯入工程圖檔
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
                  downloadFile(
                    dxf,
                    `vektorcad_${Date.now()}.dxf`,
                    'application/dxf'
                  );
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
                <span className="px-2.5 py-1 font-mono bg-sky-500/20 text-sky-300 rounded shrink-0">
                  .DXF
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const svg = exportToSVG(entities, layers);
                  downloadFile(
                    svg,
                    `vektorcad_${Date.now()}.svg`,
                    'image/svg+xml'
                  );
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
                <span className="px-2.5 py-1 font-mono bg-emerald-500/20 text-emerald-300 rounded shrink-0">
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
                <span className="px-2.5 py-1 font-mono bg-amber-500/20 text-amber-300 rounded shrink-0">
                  .JSON
                </span>
              </button>

              <label className="w-full flex items-center justify-between p-3.5 bg-slate-950 hover:bg-slate-800/90 border border-slate-800 hover:border-sky-500/60 rounded-lg text-left transition-colors cursor-pointer">
                <div>
                  <div className="font-semibold text-slate-100">
                    匯入並還原專案檔 (.JSON)
                  </div>
                  <div className="text-slate-400 mt-0.5">
                    從裝置讀取先前備份的 VektorCAD .JSON 檔案
                  </div>
                </div>
                <span className="px-2.5 py-1 font-mono bg-slate-800 text-slate-200 rounded shrink-0">
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
                          setTimeout(() => setFitTrigger((t) => t + 1), 30);
                          logCommand(
                            `已成功匯入專案檔：「${file.name}」`,
                            'success'
                          );
                        } else {
                          logCommand(
                            '檔案格式不符，請選擇有效的 VektorCAD .JSON 專案檔。',
                            'error'
                          );
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
