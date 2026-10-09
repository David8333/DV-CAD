import React, { useState, useRef, useEffect } from 'react';
import { Terminal, ChevronUp, ChevronDown } from 'lucide-react';
import {
  CommandLogItem,
  DraftingSettings,
  Point,
  SnapPoint,
  ToolType,
} from '../types/cad';

interface CommandDockProps {
  logs: CommandLogItem[];
  activeTool: ToolType;
  cursorWorld: Point;
  activeSnap: SnapPoint | null;
  zoom: number;
  settings: DraftingSettings;
  onToggleSetting: (
    key: keyof Omit<DraftingSettings, 'osnapModes' | 'snapStep' | 'polarAngle'>
  ) => void;
  onExecuteCommand: (rawInput: string) => void;
}

const TOOL_PROMPTS: Record<ToolType, string> = {
  select: '就緒 — 點選圖元、拖曳掣點或拉框選取 (空白鍵=Enter；按 Z 窗選放大、L 直線、R 矩形)',
  pan: 'PAN 平移視景 — 拖曳畫布或雙指縮放平移',
  zoomWindow: 'ZOOM WINDOW 請依序點選放大框的第一角點與對角點，立即局部放大',
  line: 'LINE 指定點或輸入 [長度] 按空白鍵/Enter / [X,Y] / [@距離<角度]',
  polyline: 'PLINE 指定下一頂點，輸入 C 封閉，或按空白鍵/Enter 結束',
  rectangle: 'RECTANG 指定角點或中心點，或直接輸入寬度 [Tab] 高度按空白鍵/Enter',
  circle: 'CIRCLE 指定圓心與半徑 R，或輸入半徑數值按空白鍵/Enter',
  arc: 'ARC [三點圓弧] 依序點選 [1.起點] → [2.弧上第二點] → [3.終點]',
  ellipse: 'ELLIPSE 指定橢圓中心點與水平/垂直半軸長',
  polygon: 'POLYGON 指定正多邊形中心點與外接圓半徑方向',
  dimension: 'DIMLINEAR 依序點選兩端測量點，再決定標註線偏移位置',
  text: 'TEXT 點選圖面要放置工程文字註解的座標位置',
  measure: 'DIST 點選兩點以量測距離、ΔX、ΔY 與夾角',
  move: 'MOVE 指定移動基準點，再點選目標位移點',
  copy: 'COPY 指定複製基準點，可連續點選多個目標點放置副本',
  rotate: 'ROTATE 指定旋轉中心基準點，再拖曳或輸入旋轉角度',
  mirror: 'MIRROR 依序點選兩點定義對稱鏡射軸線',
  offset: 'OFFSET 可輸入偏移距離數值按空白鍵/Enter，點選物件後再點選要偏移的一側',
  trim: 'TRIM 剪切模式 — 將游標移至相交線段預覽紅虛線切除區段，點擊左鍵立即剪切',
  extend: 'EXTEND 延伸模式 — 將游標移至線段端點預覽綠虛線延伸路徑，點擊左鍵延伸至邊界',
  join: 'JOIN 組裝圖元 — 點選 2 個以上圖元後，按空白鍵或 Enter 組裝合併為單一聚合線',
};

export const CommandDock: React.FC<CommandDockProps> = ({
  logs,
  activeTool,
  cursorWorld,
  activeSnap,
  zoom,
  settings,
  onToggleSetting,
  onExecuteCommand,
}) => {
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, expanded]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onExecuteCommand(input.trim());
    setInput('');
  };

  const latestLogs = expanded ? logs.slice(-20) : logs.slice(-1);

  return (
    <footer className="shrink-0 bg-[#0B0F17] border-t border-slate-800 select-none z-20">
      {/* Compact Command History Output Strip */}
      <div
        className={`px-3 py-1 bg-[#090D14]/95 border-b border-slate-800/80 font-mono text-[11px] overflow-y-auto transition-all ${
          expanded ? 'h-28' : 'h-7'
        }`}
      >
        <div className="space-y-0.5">
          {latestLogs.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 leading-tight truncate"
            >
              <span className="text-slate-600 text-[10px] shrink-0">
                [{item.timestamp}]
              </span>
              <span
                className={`truncate ${
                  item.type === 'error'
                    ? 'text-rose-400'
                    : item.type === 'success'
                      ? 'text-emerald-400'
                      : item.type === 'command'
                        ? 'text-sky-300 font-semibold'
                        : 'text-slate-300'
                }`}
              >
                {item.text}
              </span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* Bottom Interactive Command Input + Precision Drafting Aids */}
      <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 px-3 py-1.5">
        {/* Left: AutoCAD Command Prompt Input */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 min-w-[200px] flex items-center gap-1.5 bg-slate-900 border border-slate-700/90 focus-within:border-sky-500 rounded-md px-2.5 py-1"
        >
          <Terminal className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="font-mono text-[11px] font-semibold text-sky-400 shrink-0">
            指令:
          </span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={TOOL_PROMPTS[activeTool]}
            className="flex-1 min-w-0 bg-transparent text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? '收合指令歷程' : '展開完整指令歷程'}
            className="p-0.5 text-slate-400 hover:text-slate-200 rounded shrink-0"
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>
        </form>

        {/* Center: Live Calibrated Coordinates Readout */}
        <div className="hidden md:flex items-center gap-2.5 px-2.5 py-1 bg-slate-900/90 border border-slate-800 rounded-md font-mono text-[11px] tabular-nums shrink-0">
          <div className="flex items-center gap-1">
            <span className="text-rose-400 font-semibold">X:</span>
            <span className="w-14 text-right text-slate-200">
              {cursorWorld.x.toFixed(1)}
            </span>
          </div>
          <span className="text-slate-700">|</span>
          <div className="flex items-center gap-1">
            <span className="text-emerald-400 font-semibold">Y:</span>
            <span className="w-14 text-right text-slate-200">
              {cursorWorld.y.toFixed(1)}
            </span>
          </div>
          <span className="text-slate-700">|</span>
          <span className="text-sky-300">{Math.round(zoom * 100)}%</span>
          {activeSnap && (
            <>
              <span className="text-slate-700">|</span>
              <span className="text-emerald-300 text-[10px]">
                {activeSnap.label}
              </span>
            </>
          )}
        </div>

        {/* Right: AutoCAD Drafting Aid Toggles (Horizontally scrollable on small screens) */}
        <div className="flex items-center gap-1 overflow-x-auto max-w-full shrink-0">
          {(
            [
              { key: 'grid', label: '網格', sub: 'F7', title: '顯示座標網格 (F7)' },
              { key: 'snap', label: '鎖格', sub: 'F9', title: '網格點吸附鎖定 (F9)' },
              {
                key: 'ortho',
                label: '正交',
                sub: 'F8',
                title: '正交水平/垂直鎖定 (F8)',
              },
              {
                key: 'polar',
                label: '極座標',
                sub: 'F10',
                title: '極座標角度追蹤 (F10)',
              },
              {
                key: 'osnap',
                label: '物件鎖點',
                sub: 'F3',
                title: '幾何物件鎖點 (F3)',
              },
              {
                key: 'dynInput',
                label: '動態輸入',
                sub: 'F12',
                title: '動態尺寸與角度輸入 (F12)',
              },
              {
                key: 'showLineWeight',
                label: '線寬',
                sub: 'LWT',
                title: '顯示真實工程線寬',
              },
            ] as const
          ).map((btn) => {
            const active = settings[btn.key];
            return (
              <button
                key={btn.key}
                type="button"
                title={btn.title}
                onClick={() => onToggleSetting(btn.key)}
                className={`px-2 py-1 text-[11px] font-mono font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {btn.label}{' '}
                <span className="hidden sm:inline text-[10px] opacity-75">
                  ({btn.sub})
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </footer>
  );
};
