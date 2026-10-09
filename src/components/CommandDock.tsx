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
  onToggleSetting: (key: keyof Omit<DraftingSettings, 'osnapModes' | 'snapStep' | 'polarAngle'>) => void;
  onExecuteCommand: (rawInput: string) => void;
}

const TOOL_PROMPTS: Record<ToolType, string> = {
  select: '就緒 — 點選圖元、拖曳掣點或拉框選取 (左至右=窗選 Window，右至左=框選 Crossing)',
  pan: 'PAN 平移視景 — 按住滑鼠左鍵拖曳畫布，或滾動滾輪縮放',
  line: 'LINE 指定點或於動態輸入框直接輸入 [距離] / [X,Y] / [@距離<角度]',
  polyline: 'PLINE 指定下一頂點，輸入 C 封閉聚合線，或按 Enter 結束',
  rectangle: 'RECTANG 指定第一個角點與對角點，或直接輸入寬度 [Tab] 高度',
  circle: 'CIRCLE 指定圓心與半徑 R，或直接輸入半徑數值後按 Enter',
  arc: 'ARC 依序指定 [1.圓心] → [2.圓弧起點] → [3.圓弧終點角度]',
  ellipse: 'ELLIPSE 指定橢圓中心點與水平/垂直半軸長',
  polygon: 'POLYGON 指定正多邊形中心點與外接圓半徑方向',
  dimension: 'DIMLINEAR 依序點選兩端測量基準點，再決定標註線偏移位置',
  text: 'TEXT 點選圖面要放置工程文字註解的座標位置',
  measure: 'DIST 點選兩點以精確量測歐幾里得距離、ΔX、ΔY 與夾角',
  move: 'MOVE 指定移動基準點，再點選目標位移點',
  copy: 'COPY 指定複製基準點，可連續點選多個目標點放置副本',
  rotate: 'ROTATE 指定旋轉中心基準點，再拖曳或輸入旋轉角度',
  scale: 'SCALE 指定縮放基準點，再移動滑鼠或輸入比例因子',
  mirror: 'MIRROR 依序點選兩點定義對稱鏡射軸線',
  offset: 'OFFSET 點選要偏移的物件，再點選要偏移複製的一側方向',
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

  const latestLogs = expanded ? logs.slice(-25) : logs.slice(-2);

  return (
    <footer className="bg-[#0B0F17] border-t border-slate-800 select-none z-20">
      {/* Command History Output Strip */}
      <div
        className={`px-4 py-1.5 bg-[#090D14]/95 border-b border-slate-800/80 font-mono text-xs overflow-y-auto transition-all ${
          expanded ? 'h-36' : 'h-12'
        }`}
      >
        <div className="space-y-1">
          {latestLogs.map((item) => (
            <div key={item.id} className="flex items-center gap-2 leading-tight">
              <span className="text-slate-600 text-[10px] shrink-0">
                [{item.timestamp}]
              </span>
              <span
                className={
                  item.type === 'error'
                    ? 'text-rose-400'
                    : item.type === 'success'
                      ? 'text-emerald-400'
                      : item.type === 'command'
                        ? 'text-sky-300 font-semibold'
                        : 'text-slate-300'
                }
              >
                {item.text}
              </span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* Bottom Interactive Command Input + Precision Drafting Aids */}
      <div className="flex items-center justify-between gap-4 px-4 py-2">
        {/* Left: AutoCAD Command Prompt Input */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 flex items-center gap-2 bg-slate-900 border border-slate-700/90 focus-within:border-sky-500 rounded-md px-3 py-1"
        >
          <Terminal className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="font-mono text-xs font-semibold text-sky-400 shrink-0">
            COMMAND:
          </span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`${TOOL_PROMPTS[activeTool]} (輸入指令如 L, C, REC, DIM 或座標如 100,50 / @120<45)`}
            className="flex-1 min-w-0 bg-transparent text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? '收合指令歷程' : '展開完整指令歷程'}
            className="p-0.5 text-slate-400 hover:text-slate-200 rounded"
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
        </form>

        {/* Center: Live Calibrated Coordinates Readout */}
        <div className="hidden xl:flex items-center gap-3 px-3 py-1 bg-slate-900/90 border border-slate-800 rounded-md font-mono text-xs tabular-nums shrink-0">
          <div className="flex items-center gap-1">
            <span className="text-rose-400 font-semibold">X:</span>
            <span className="w-16 text-right text-slate-200">
              {cursorWorld.x.toFixed(2)}
            </span>
          </div>
          <span className="text-slate-700">|</span>
          <div className="flex items-center gap-1">
            <span className="text-emerald-400 font-semibold">Y:</span>
            <span className="w-16 text-right text-slate-200">
              {cursorWorld.y.toFixed(2)}
            </span>
          </div>
          <span className="text-slate-700">|</span>
          <div className="flex items-center gap-1">
            <span className="text-slate-400">ZOOM:</span>
            <span className="w-12 text-right text-sky-300">
              {Math.round(zoom * 100)}%
            </span>
          </div>
          {activeSnap && (
            <>
              <span className="text-slate-700">|</span>
              <span className="text-emerald-300 text-[11px]">
                {activeSnap.label}
              </span>
            </>
          )}
        </div>

        {/* Right: AutoCAD Drafting Aid Toggles */}
        <div className="flex items-center gap-1 shrink-0">
          {(
            [
              { key: 'grid', label: 'GRID', sub: 'F7', title: '顯示座標網格 (F7)' },
              { key: 'snap', label: 'SNAP', sub: 'F9', title: '網格點吸附鎖定 (F9)' },
              { key: 'ortho', label: 'ORTHO', sub: 'F8', title: '正交水平/垂直鎖定 (F8)' },
              { key: 'polar', label: 'POLAR', sub: 'F10', title: '極座標角度追蹤 (F10)' },
              { key: 'osnap', label: 'OSNAP', sub: 'F3', title: '幾何物件鎖點 (F3)' },
              { key: 'dynInput', label: 'DYN', sub: 'F12', title: '動態尺寸與角度輸入 (F12)' },
              { key: 'showLineWeight', label: 'LWT', sub: '線寬', title: '顯示真實工程線寬' },
            ] as const
          ).map((btn) => {
            const active = settings[btn.key];
            return (
              <button
                key={btn.key}
                type="button"
                title={btn.title}
                onClick={() => onToggleSetting(btn.key)}
                className={`px-2.5 py-1 text-[11px] font-mono font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {btn.label}{' '}
                <span className="text-[10px] opacity-75">({btn.sub})</span>
              </button>
            );
          })}
        </div>
      </div>
    </footer>
  );
};
