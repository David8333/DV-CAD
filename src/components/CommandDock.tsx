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
  pendingKeyPrefix?: string | null;
  onToggleSetting: (
    key: keyof Omit<DraftingSettings, 'osnapModes' | 'snapStep' | 'polarAngle'>
  ) => void;
  onExecuteCommand: (rawInput: string) => void;
}

const TOOL_PROMPTS: Record<ToolType, string> = {
  select:
    '就緒 — 點選圖元可修改尺寸；按 TAB 選取全部線段；按 JO 將鼠標跳至座標原點 X,Y=(0,0)；支援雙字母快捷鍵 TR、EX、CO、AR、JO',
  pan: 'PAN 平移視景 — 拖曳畫布或雙指縮放平移',
  zoomWindow: 'ZOOM WINDOW 請依序點選放大框的第一角點與對角點，立即局部放大',
  line: 'LINE 指定點或輸入 [長度] 按空白鍵/Enter / 按 JO 跳至原點 (0,0)',
  polyline: 'PLINE 指定下一頂點，輸入 C 封閉，或按空白鍵/Enter 結束',
  rectangle: 'RECTANG 指定角點或中心點，或直接輸入寬度 [Tab] 高度按空白鍵/Enter',
  circle: 'CIRCLE 指定圓心與半徑 R，或輸入半徑數值按空白鍵/Enter',
  arc: 'ARC [三點圓弧] 依序點選 [1.起點 P1] → [2.弧上第二點 P2] → [3.終點 P3]',
  polygon: 'POLYGON 指定正多邊形中心點與外接圓半徑方向',
  dimension:
    'DIM 直接點擊圓周建立 ISO 國際規範 Ø 直徑標註，或點選兩點建立線性標註（可調小數位數與正負公差）',
  text: 'TEXT 點選圖面要放置工程文字註解的座標位置',
  measure: 'DIST 點選兩點以量測距離、ΔX、ΔY 與夾角',
  erase: 'ERASE 刪除圖元模式 (E) — 點選畫布上的任何圖元立即刪除，或按 ESC 返回',
  move: 'MOVE 點選基準點與目標點，或直接輸入 X,Y 座標（例如 100,50）按空白鍵/Enter 跳轉移動',
  copy: 'COPY 指定複製基準點，可連續點選多個目標點或輸入 X,Y 座標放置副本',
  rotate: 'ROTATE 指定旋轉中心基準點，再拖曳或輸入旋轉角度',
  mirror: 'MIRROR 依序點選兩點定義對稱鏡射軸線',
  offset: 'OFFSET 支援同時偏移選取的所有圖形（最小 0.01）！輸入距離按空白鍵/Enter，點選要偏移的一側',
  trim: 'TRIM 剪切模式 (TR) — 支援剪切直線、矩形、圓形與三點圓弧！移至圖元預覽紅虛線後點擊切除',
  extend: 'EXTEND 延伸模式 (EX) — 依序點選兩個線段可互相延伸接合至交點（或點選同一線段延伸至邊界）',
  join: 'JOIN 組裝圖元 (J) — 保留所有選取圖元原始位置並合併成單一物件，按空白鍵或 Enter 完成',
};

export const CommandDock: React.FC<CommandDockProps> = ({
  logs,
  activeTool,
  cursorWorld,
  activeSnap,
  zoom,
  settings,
  pendingKeyPrefix,
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
          {pendingKeyPrefix && (
            <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-amber-500/25 text-amber-300 border border-amber-400/60 rounded shrink-0">
              按鍵序列: {pendingKeyPrefix}_
            </span>
          )}
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

        {/* Right: AutoCAD Drafting Aid Toggles */}
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
