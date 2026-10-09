import React from 'react';
import {
  MousePointer,
  Hand,
  Search,
  Minus,
  Waypoints,
  Square,
  Circle,
  Spline,
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
} from 'lucide-react';
import { RectangleMode, ToolType } from '../types/cad';

interface ToolPaletteProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  rectangleMode: RectangleMode;
  onChangeRectangleMode: (mode: RectangleMode) => void;
  offsetDistance: number;
  onChangeOffsetDistance: (dist: number) => void;
  selectedCount: number;
  onOpenArrayModal: () => void;
  onExplodeSelected: () => void;
  onJoinSelected: () => void;
  onDeleteSelected: () => void;
  onAutoDimensionSelected: () => void;
}

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
    icon: <Spline className="w-4 h-4" />,
    highlight: true,
  },
  {
    id: 'polyline',
    label: '聚合線',
    shortcut: 'P',
    icon: <Waypoints className="w-4 h-4" />,
  },
  {
    id: 'circle',
    label: '圓形',
    shortcut: 'C',
    icon: <Circle className="w-4 h-4" />,
  },
  {
    id: 'ellipse',
    label: '橢圓形',
    shortcut: 'E',
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <ellipse cx="12" cy="12" rx="10" ry="6" />
      </svg>
    ),
  },
  {
    id: 'polygon',
    label: '正多邊形',
    shortcut: 'G',
    icon: <Hexagon className="w-4 h-4" />,
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
    id: 'offset',
    label: '偏移複製',
    shortcut: 'O',
    icon: <Layers2 className="w-4 h-4" />,
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
  selectedCount,
  onOpenArrayModal,
  onExplodeSelected,
  onJoinSelected,
  onDeleteSelected,
  onAutoDimensionSelected,
}) => {
  return (
    <aside className="w-60 shrink-0 h-full bg-[#0F172A] border-r border-slate-800 flex flex-col justify-between p-3 overflow-y-auto select-none">
      <div className="space-y-4">
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

          {/* Quick Auto-Dimension Button */}
          <button
            type="button"
            onClick={onAutoDimensionSelected}
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border bg-amber-500/15 text-amber-200 border-amber-500/40 hover:bg-amber-500/25 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>自動標註選取物件 (B)</span>
          </button>
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
                    if (tool.id === 'join' && selectedCount >= 2) {
                      onJoinSelected();
                    } else {
                      onSelectTool(tool.id);
                    }
                  }}
                  className={`flex flex-col items-start justify-between p-2 rounded-lg border text-left transition-colors ${
                    isActive
                      ? 'bg-amber-500/25 text-amber-100 border-amber-400 shadow-sm'
                      : tool.highlight
                        ? 'bg-slate-900 text-slate-200 border-amber-500/30 hover:bg-slate-800 hover:border-amber-500/60'
                        : 'bg-slate-900/70 text-slate-300 border-slate-800/90 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span
                      className={isActive ? 'text-amber-300' : 'text-slate-400'}
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

            {/* Explode Button */}
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
                min={0.5}
                step="1"
                value={offsetDistance}
                onChange={(e) =>
                  onChangeOffsetDistance(Math.max(0.5, Number(e.target.value)))
                }
                className="w-16 px-2 py-1 text-right text-xs font-mono bg-slate-950 border border-amber-500/50 rounded text-amber-200 focus:outline-none focus:border-amber-400"
              />
              <span className="text-[11px] font-mono text-slate-400">mm</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onDeleteSelected}
            disabled={selectedCount === 0}
            className={`mt-2 w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              selectedCount > 0
                ? 'bg-rose-950/50 text-rose-300 border-rose-800/60 hover:bg-rose-900/60'
                : 'bg-slate-900/40 text-slate-600 border-slate-800/50 cursor-not-allowed'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>刪除選取物件 (DEL)</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
