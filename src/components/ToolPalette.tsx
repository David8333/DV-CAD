import React from 'react';
import {
  MousePointer,
  Hand,
  Search,
  Minus,
  Waypoints,
  Square,
  Circle,
  Hexagon,
  Ruler,
  Type,
  Compass,
  Move,
  Copy,
  RotateCw,
  FlipHorizontal2,
  Layers2,
  Grid,
  Scissors,
  Trash2,
  Sparkles,
  ArrowUpRight,
  Combine,
  Clipboard,
  ClipboardCopy,
  AlignCenterHorizontal,
} from 'lucide-react';
import { RectangleMode, ToolType } from '../types/cad';

interface ToolPaletteProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  rectangleMode: RectangleMode;
  onChangeRectangleMode: (mode: RectangleMode) => void;
  offsetDistance: number;
  onChangeOffsetDistance: (dist: number) => void;
  hatchPitch: number;
  onChangeHatchPitch: (pitch: number) => void;
  selectedCount: number;
  hasClipboard: boolean;
  onCopyClipboard: () => void;
  onCutClipboard: () => void;
  onPasteClipboard: () => void;
  onAlignDimensions: () => void;
  onOpenArrayModal: () => void;
  onExplodeSelected: () => void;
  onJoinSelected: () => void;
  onDeleteSelected: () => void;
  onAutoDimensionSelected: () => void;
  onHatchSelected?: () => void;
}

/**
 * Custom 3-Point Arc Icon clearly showing an arc curve and 3 distinct point dots (P1, P2, P3)
 */
export const ThreePointArcIcon: React.FC<{ className?: string }> = ({
  className = 'w-4 h-4',
}) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    {/* Arc curve passing through 3 points */}
    <path d="M 4 18 A 11 11 0 0 1 20 18" />
    {/* Point 1 (Left Start) - reduced by half */}
    <circle cx="4" cy="18" r="1.15" fill="currentColor" stroke="none" />
    {/* Point 2 (Top Middle on Arc) - reduced by half */}
    <circle cx="12" cy="7.5" r="1.15" fill="#FBBF24" stroke="none" />
    {/* Point 3 (Right End) - reduced by half */}
    <circle cx="20" cy="18" r="1.15" fill="currentColor" stroke="none" />
  </svg>
);

/**
 * Custom 45° Hatch Icon showing a boundary box filled with 45° diagonal section lines
 */
export const HatchIcon: React.FC<{ className?: string }> = ({
  className = 'w-4 h-4',
}) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="10" x2="10" y2="3" />
    <line x1="3" y1="16" x2="16" y2="3" />
    <line x1="4" y1="21" x2="21" y2="4" />
    <line x1="10" y1="21" x2="21" y2="10" />
    <line x1="16" y1="21" x2="21" y2="16" />
  </svg>
);

interface ToolItem {
  id: ToolType;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
  highlight?: boolean;
}

const DRAW_TOOLS: ToolItem[] = [
  {
    id: 'select',
    label: '選取 / 掣點',
    shortcut: 'V / ESC',
    icon: <MousePointer className="w-4 h-4" />,
  },
  {
    id: 'zoomWindow',
    label: '窗選局部放大',
    shortcut: 'Z',
    icon: <Search className="w-4 h-4" />,
    highlight: true,
  },
  {
    id: 'line',
    label: '畫直線',
    shortcut: 'L',
    icon: <Minus className="w-4 h-4 -rotate-45" />,
    highlight: true,
  },
  {
    id: 'dimension',
    label: '標註尺寸',
    shortcut: 'D',
    icon: <Ruler className="w-4 h-4" />,
    highlight: true,
  },
  {
    id: 'rectangle',
    label: '矩形框',
    shortcut: 'R',
    icon: <Square className="w-4 h-4" />,
    highlight: true,
  },
  {
    id: 'arc',
    label: '三點圓弧',
    shortcut: 'A',
    icon: <ThreePointArcIcon className="w-4 h-4" />,
    highlight: true,
  },
  {
    id: 'circle',
    label: '圓形',
    shortcut: 'C',
    icon: <Circle className="w-4 h-4" />,
  },
  {
    id: 'polyline',
    label: '聚合線',
    shortcut: 'P',
    icon: <Waypoints className="w-4 h-4" />,
  },
  {
    id: 'polygon',
    label: '正多邊形',
    shortcut: 'G',
    icon: <Hexagon className="w-4 h-4" />,
  },
  {
    id: 'hatch',
    label: '剖面填充 (45°)',
    shortcut: 'BH',
    icon: <HatchIcon className="w-4 h-4" />,
    highlight: true,
  },
  {
    id: 'text',
    label: '文字註解',
    shortcut: 'T',
    icon: <Type className="w-4 h-4" />,
  },
  {
    id: 'measure',
    label: '測量距離',
    shortcut: 'K',
    icon: <Compass className="w-4 h-4" />,
  },
  {
    id: 'pan',
    label: '平移畫布',
    shortcut: 'H',
    icon: <Hand className="w-4 h-4" />,
  },
];

const MODIFY_TOOLS: ToolItem[] = [
  {
    id: 'erase',
    label: '刪除圖元',
    shortcut: 'E',
    icon: <Trash2 className="w-4 h-4" />,
    highlight: true,
  },
  {
    id: 'trim',
    label: '剪切圖元',
    shortcut: 'TR',
    icon: <Scissors className="w-4 h-4" />,
    highlight: true,
  },
  {
    id: 'extend',
    label: '延伸圖元',
    shortcut: 'EX',
    icon: <ArrowUpRight className="w-4 h-4" />,
    highlight: true,
  },
  {
    id: 'join',
    label: '組裝圖元',
    shortcut: 'J',
    icon: <Combine className="w-4 h-4" />,
    highlight: true,
  },
  {
    id: 'offset',
    label: '偏移複製',
    shortcut: 'O',
    icon: <Layers2 className="w-4 h-4" />,
    highlight: true,
  },
  {
    id: 'move',
    label: '移動物件',
    shortcut: 'M',
    icon: <Move className="w-4 h-4" />,
  },
  {
    id: 'copy',
    label: '連續複製',
    shortcut: 'CO',
    icon: <Copy className="w-4 h-4" />,
  },
  {
    id: 'rotate',
    label: '旋轉角度',
    shortcut: 'Q',
    icon: <RotateCw className="w-4 h-4" />,
  },
  {
    id: 'mirror',
    label: '對稱鏡射',
    shortcut: 'W',
    icon: <FlipHorizontal2 className="w-4 h-4" />,
  },
];

export const ToolPalette: React.FC<ToolPaletteProps> = ({
  activeTool,
  onSelectTool,
  rectangleMode,
  onChangeRectangleMode,
  offsetDistance,
  onChangeOffsetDistance,
  hatchPitch,
  onChangeHatchPitch,
  selectedCount,
  hasClipboard,
  onCopyClipboard,
  onCutClipboard,
  onPasteClipboard,
  onAlignDimensions,
  onOpenArrayModal,
  onExplodeSelected,
  onJoinSelected,
  onDeleteSelected,
  onAutoDimensionSelected,
  onHatchSelected,
}) => {
  return (
    <aside className="w-64 shrink-0 h-full bg-[#0F172A] border-r border-slate-800 flex flex-col justify-between p-3 overflow-y-auto select-none">
      <div className="space-y-4">
        {/* Clipboard Quick Bar (Copy / Cut / Paste) */}
        <div className="p-2 bg-slate-900/90 border border-slate-800 rounded-lg space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
            <span>剪貼簿操作</span>
            <span className="text-[10px] font-mono text-slate-500">
              Ctrl+C / X / V
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={onCopyClipboard}
              disabled={selectedCount === 0}
              title="複製選取圖元 (Ctrl+C)"
              className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded border text-[11px] font-medium transition-colors ${
                selectedCount > 0
                  ? 'bg-slate-950 text-sky-300 border-slate-700 hover:bg-slate-800'
                  : 'bg-slate-950/40 text-slate-600 border-slate-800/60 cursor-not-allowed'
              }`}
            >
              <ClipboardCopy className="w-3 h-3 shrink-0" />
              <span>複製</span>
            </button>
            <button
              type="button"
              onClick={onCutClipboard}
              disabled={selectedCount === 0}
              title="剪下選取圖元 (Ctrl+X)"
              className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded border text-[11px] font-medium transition-colors ${
                selectedCount > 0
                  ? 'bg-slate-950 text-amber-300 border-slate-700 hover:bg-slate-800'
                  : 'bg-slate-950/40 text-slate-600 border-slate-800/60 cursor-not-allowed'
              }`}
            >
              <Scissors className="w-3 h-3 shrink-0" />
              <span>剪下</span>
            </button>
            <button
              type="button"
              onClick={onPasteClipboard}
              disabled={!hasClipboard}
              title="貼上剪貼簿圖元 (Ctrl+V)"
              className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded border text-[11px] font-medium transition-colors ${
                hasClipboard
                  ? 'bg-sky-600/25 text-sky-200 border-sky-500/50 hover:bg-sky-600/40'
                  : 'bg-slate-950/40 text-slate-600 border-slate-800/60 cursor-not-allowed'
              }`}
            >
              <Clipboard className="w-3 h-3 shrink-0" />
              <span>貼上</span>
            </button>
          </div>
        </div>

        {/* Draw Tools Group */}
        <div>
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-xs font-semibold text-slate-300">
              繪圖與檢視工具
            </span>
            <span className="text-[10px] text-slate-500">空白鍵=Enter</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {DRAW_TOOLS.map((tool) => {
              const isActive = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => onSelectTool(tool.id)}
                  className={`flex flex-col items-start justify-between p-2 rounded-lg border text-left transition-colors ${
                    isActive
                      ? 'bg-sky-500/25 text-sky-100 border-sky-400 shadow-sm'
                      : tool.highlight
                        ? 'bg-slate-900 text-slate-200 border-sky-500/30 hover:bg-slate-800 hover:border-sky-500/60'
                        : 'bg-slate-900/70 text-slate-300 border-slate-800/90 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className={isActive ? 'text-sky-300' : 'text-slate-400'}>
                      {tool.icon}
                    </span>
                    <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-slate-950/90 text-sky-300 border border-slate-700/80 rounded">
                      {tool.shortcut}
                    </kbd>
                  </div>
                  <span className="text-xs font-medium whitespace-nowrap truncate w-full">
                    {tool.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 3-Point Arc Visual Schematic Diagram (三點圓弧示意圖 - 清楚顯示 P1、P2、P3 三個點) */}
          <div
            onClick={() => onSelectTool('arc')}
            className={`mt-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
              activeTool === 'arc'
                ? 'bg-sky-950/40 border-sky-500/70'
                : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-300 mb-1">
              <span>三點圓弧示意圖 (快捷鍵 A)</span>
              <span className="text-[10px] font-mono text-amber-300">
                P1 → P2 → P3
              </span>
            </div>
            <svg
              viewBox="0 0 200 62"
              className="w-full h-14 bg-slate-950/90 rounded border border-slate-800/90"
            >
              {/* Dashed chord lines P1-P2 and P2-P3 */}
              <line
                x1="28"
                y1="48"
                x2="100"
                y2="14"
                stroke="#475569"
                strokeWidth="1"
                strokeDasharray="3,3"
              />
              <line
                x1="100"
                y1="14"
                x2="172"
                y2="48"
                stroke="#475569"
                strokeWidth="1"
                strokeDasharray="3,3"
              />
              {/* Smooth Circular Arc passing through P1, P2, P3 */}
              <path
                d="M 28 48 A 96 96 0 0 1 172 48"
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2.2"
              />
              {/* Point 1: 起點 P1 (縮小一半 r=2.25) */}
              <circle
                cx="28"
                cy="48"
                r="2.25"
                fill="#10B981"
                stroke="#0F172A"
                strokeWidth="1"
              />
              <text
                x="28"
                y="36"
                fill="#6EE7B7"
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
                textAnchor="middle"
                fontWeight="bold"
              >
                1.起點
              </text>
              {/* Point 2: 弧上第二點 P2 (縮小一半 r=2.25) */}
              <circle
                cx="100"
                cy="14"
                r="2.25"
                fill="#FBBF24"
                stroke="#0F172A"
                strokeWidth="1"
              />
              <text
                x="134"
                y="16"
                fill="#FDE68A"
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
                textAnchor="middle"
                fontWeight="bold"
              >
                2.第二點
              </text>
              {/* Point 3: 終點 P3 (縮小一半 r=2.25) */}
              <circle
                cx="172"
                cy="48"
                r="2.25"
                fill="#F43F5E"
                stroke="#0F172A"
                strokeWidth="1"
              />
              <text
                x="172"
                y="36"
                fill="#FDA4AF"
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
                textAnchor="middle"
                fontWeight="bold"
              >
                3.終點
              </text>
            </svg>
          </div>

          {/* Rectangle Mode Selector (Corner vs Center Rectangle) */}
          <div className="mt-2 p-2 bg-slate-900/90 border border-slate-800 rounded-lg space-y-1.5">
            <div className="text-[11px] font-medium text-slate-400">
              矩形繪製模式 (快捷鍵 R)：
            </div>
            <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-950 rounded border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  onChangeRectangleMode('corner');
                  onSelectTool('rectangle');
                }}
                className={`py-1 px-2 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                  rectangleMode === 'corner'
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                轉角矩形
              </button>
              <button
                type="button"
                onClick={() => {
                  onChangeRectangleMode('center');
                  onSelectTool('rectangle');
                }}
                className={`py-1 px-2 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                  rectangleMode === 'center'
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                中心矩形
              </button>
            </div>
          </div>

          {/* 45° Section Hatch Tool & Pitch Control Box */}
          <div className="mt-2 p-2.5 bg-slate-900/90 border border-emerald-500/40 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  if (selectedCount > 0 && onHatchSelected) {
                    onHatchSelected();
                  } else {
                    onSelectTool('hatch');
                  }
                }}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300 hover:text-emerald-200"
              >
                <HatchIcon className="w-3.5 h-3.5 text-emerald-400" />
                <span>45° 斜線填充 PITCH 設定</span>
              </button>
              <span className="text-[10px] font-mono text-emerald-400/80">
                45° 斜線
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-300 whitespace-nowrap">
                斜線間距 PITCH：
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0.5}
                  max={200}
                  step="0.5"
                  value={hatchPitch}
                  onChange={(e) =>
                    onChangeHatchPitch(Math.max(0.5, Number(e.target.value)))
                  }
                  className="w-16 px-2 py-1 text-right text-xs font-mono bg-slate-950 border border-emerald-500/60 rounded text-emerald-200 focus:outline-none focus:border-emerald-400"
                />
                <span className="text-[11px] font-mono text-slate-400">mm</span>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-1 font-mono">
              {[2, 5, 8, 10, 15].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    onChangeHatchPitch(p);
                    if (activeTool !== 'hatch') onSelectTool('hatch');
                  }}
                  className={`py-0.5 rounded text-[10px] border transition-colors ${
                    hatchPitch === p
                      ? 'bg-emerald-600 text-white border-emerald-400 font-bold'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-emerald-500/50'
                  }`}
                >
                  {p}mm
                </button>
              ))}
            </div>
          </div>

          {/* Quick Auto-Dimension & Align Dimension Buttons */}
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={onAutoDimensionSelected}
              className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border bg-amber-500/15 text-amber-200 border-amber-500/40 hover:bg-amber-500/25 text-[11px] font-medium transition-colors whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>自動標註 (B)</span>
            </button>
            <button
              type="button"
              onClick={onAlignDimensions}
              title="將選取的多個標註尺寸相互對齊至同一標註線"
              className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border bg-sky-500/15 text-sky-200 border-sky-500/40 hover:bg-sky-500/25 text-[11px] font-medium transition-colors whitespace-nowrap"
            >
              <AlignCenterHorizontal className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>對齊標註</span>
            </button>
          </div>
        </div>

        {/* Modify Tools Group */}
        <div>
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-xs font-semibold text-slate-300">
              修改與編輯工具
            </span>
            {selectedCount > 0 && (
              <span className="text-[11px] font-mono text-sky-400">
                已選 {selectedCount} 個
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {MODIFY_TOOLS.map((tool) => {
              const isActive = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => {
                    if (tool.id === 'erase' && selectedCount > 0) {
                      onDeleteSelected();
                    } else if (tool.id === 'join' && selectedCount >= 2) {
                      onJoinSelected();
                    } else {
                      onSelectTool(tool.id);
                    }
                  }}
                  className={`flex flex-col items-start justify-between p-2 rounded-lg border text-left transition-colors ${
                    isActive
                      ? 'bg-amber-500/25 text-amber-100 border-amber-400 shadow-sm'
                      : tool.id === 'erase'
                        ? 'bg-rose-950/35 text-rose-200 border-rose-500/35 hover:bg-rose-900/50 hover:border-rose-400'
                        : tool.highlight
                          ? 'bg-slate-900 text-slate-200 border-amber-500/30 hover:bg-slate-800 hover:border-amber-500/60'
                          : 'bg-slate-900/70 text-slate-300 border-slate-800/90 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span
                      className={
                        isActive
                          ? 'text-amber-300'
                          : tool.id === 'erase'
                            ? 'text-rose-400'
                            : 'text-slate-400'
                      }
                    >
                      {tool.icon}
                    </span>
                    <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-950/90 text-amber-300 border border-slate-700/80 rounded">
                      {tool.shortcut}
                    </kbd>
                  </div>
                  <span className="text-xs font-medium whitespace-nowrap truncate w-full">
                    {tool.label}
                  </span>
                </button>
              );
            })}

            {/* Rectangular / Polar Array Button */}
            <button
              type="button"
              onClick={onOpenArrayModal}
              className="flex flex-col items-start justify-between p-2 rounded-lg border bg-slate-900/70 text-slate-300 border-slate-800/90 hover:bg-slate-800/80 hover:text-white text-left transition-colors"
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-slate-400">
                  <Grid className="w-4 h-4" />
                </span>
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-950/80 text-slate-400 border border-slate-800 rounded">
                  AR
                </kbd>
              </div>
              <span className="text-xs font-medium whitespace-nowrap truncate w-full">
                陣列複製
              </span>
            </button>

            {/* Explode Button (炸開中心矩形或組裝圖元) */}
            <button
              type="button"
              onClick={onExplodeSelected}
              className="flex flex-col items-start justify-between p-2 rounded-lg border bg-slate-900/70 text-slate-300 border-slate-800/90 hover:bg-slate-800/80 hover:text-white text-left transition-colors"
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-slate-400">
                  <Scissors className="w-4 h-4" />
                </span>
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-950/80 text-slate-400 border border-slate-800 rounded">
                  X
                </kbd>
              </div>
              <span className="text-xs font-medium whitespace-nowrap truncate w-full">
                炸開圖元
              </span>
            </button>
          </div>

          {/* Offset Distance Direct Numeric Input Box */}
          <div className="mt-2 p-2 bg-slate-900/90 border border-slate-800 rounded-lg flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-300 whitespace-nowrap">
              偏移距離 (O)：
            </span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0.01}
                step="0.01"
                value={offsetDistance}
                onChange={(e) =>
                  onChangeOffsetDistance(Math.max(0.01, Number(e.target.value)))
                }
                className="w-16 px-2 py-1 text-right text-xs font-mono bg-slate-950 border border-amber-500/50 rounded text-amber-200 focus:outline-none focus:border-amber-400"
              />
              <span className="text-[11px] font-mono text-slate-400">mm</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
