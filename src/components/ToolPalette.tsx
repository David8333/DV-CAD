import React from 'react';
import {
  MousePointer,
  Hand,
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
  Maximize2,
  FlipHorizontal2,
  Layers2,
  Grid,
  Scissors,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { ToolType } from '../types/cad';

interface ToolPaletteProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  selectedCount: number;
  onOpenArrayModal: () => void;
  onExplodeSelected: () => void;
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
    id: 'pan',
    label: '平移畫布',
    shortcut: 'H / 空白鍵',
    icon: <Hand className="w-4 h-4" />,
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
    id: 'polyline',
    label: '聚合線',
    shortcut: 'P',
    icon: <Waypoints className="w-4 h-4" />,
  },
  {
    id: 'rectangle',
    label: '矩形框',
    shortcut: 'R',
    icon: <Square className="w-4 h-4" />,
  },
  {
    id: 'circle',
    label: '圓形',
    shortcut: 'C',
    icon: <Circle className="w-4 h-4" />,
  },
  {
    id: 'arc',
    label: '三點圓弧',
    shortcut: 'A',
    icon: <Spline className="w-4 h-4" />,
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
];

const MODIFY_TOOLS: ToolItem[] = [
  {
    id: 'move',
    label: '移動物件',
    shortcut: 'M',
    icon: <Move className="w-4 h-4" />,
  },
  {
    id: 'copy',
    label: '連續複製',
    shortcut: 'J',
    icon: <Copy className="w-4 h-4" />,
  },
  {
    id: 'rotate',
    label: '旋轉角度',
    shortcut: 'Q',
    icon: <RotateCw className="w-4 h-4" />,
  },
  {
    id: 'scale',
    label: '比例縮放',
    shortcut: 'S',
    icon: <Maximize2 className="w-4 h-4" />,
  },
  {
    id: 'mirror',
    label: '對稱鏡射',
    shortcut: 'W',
    icon: <FlipHorizontal2 className="w-4 h-4" />,
  },
  {
    id: 'offset',
    label: '偏移複製',
    shortcut: 'O',
    icon: <Layers2 className="w-4 h-4" />,
  },
];

export const ToolPalette: React.FC<ToolPaletteProps> = ({
  activeTool,
  onSelectTool,
  selectedCount,
  onOpenArrayModal,
  onExplodeSelected,
  onDeleteSelected,
  onAutoDimensionSelected,
}) => {
  return (
    <aside className="w-60 shrink-0 h-full bg-[#0F172A] border-r border-slate-800 flex flex-col justify-between p-3 overflow-y-auto select-none">
      <div className="space-y-5">
        {/* Draw Tools Group */}
        <div>
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-xs font-semibold text-slate-300">
              繪圖與標註工具
            </span>
            <span className="text-[11px] text-slate-500">直接按鍵觸發</span>
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

          {/* Quick Auto-Dimension Button for Selected Line/Rect */}
          <button
            type="button"
            onClick={onAutoDimensionSelected}
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border bg-amber-500/15 text-amber-200 border-amber-500/40 hover:bg-amber-500/25 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>自動標註選取線段/矩形 (B)</span>
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
                  onClick={() => onSelectTool(tool.id)}
                  className={`flex flex-col items-start justify-between p-2 rounded-lg border text-left transition-colors ${
                    isActive
                      ? 'bg-amber-500/20 text-amber-200 border-amber-500/60 shadow-sm'
                      : 'bg-slate-900/70 text-slate-300 border-slate-800/90 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span
                      className={isActive ? 'text-amber-300' : 'text-slate-400'}
                    >
                      {tool.icon}
                    </span>
                    <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-950/80 text-slate-400 border border-slate-800 rounded">
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
