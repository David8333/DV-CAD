import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Layers,
  Sliders,
  Scissors,
  Copy,
} from 'lucide-react';
import {
  CadEntity,
  CadLayer,
  DraftingSettings,
  LineType,
} from '../types/cad';
import { getEntityMetrics } from '../utils/geometry';

interface InspectorSidebarProps {
  layers: CadLayer[];
  activeLayerId: string;
  onSelectLayer: (id: string) => void;
  onUpdateLayer: (layer: CadLayer) => void;
  onAddLayer: (name: string, color: string) => void;
  onDeleteLayer: (id: string) => void;
  entities: CadEntity[];
  selectedIds: string[];
  onUpdateEntities: (updated: CadEntity[]) => void;
  onDeleteSelected: () => void;
  onExplodeSelected: () => void;
  onDuplicateSelected: () => void;
  settings: DraftingSettings;
  onUpdateSettings: React.Dispatch<React.SetStateAction<DraftingSettings>>;
}

const PRESET_COLORS = [
  '#F8FAFC',
  '#38BDF8',
  '#34D399',
  '#FBBF24',
  '#F43F5E',
  '#A855F7',
  '#FB923C',
  '#94A3B8',
];

export const InspectorSidebar: React.FC<InspectorSidebarProps> = ({
  layers,
  activeLayerId,
  onSelectLayer,
  onUpdateLayer,
  onAddLayer,
  onDeleteLayer,
  entities,
  selectedIds,
  onUpdateEntities,
  onDeleteSelected,
  onExplodeSelected,
  onDuplicateSelected,
  settings,
  onUpdateSettings,
}) => {
  const [activeTab, setActiveTab] = useState<'properties' | 'layers'>('properties');
  const [newLayerName, setNewLayerName] = useState('');
  const [newLayerColor, setNewLayerColor] = useState('#38BDF8');

  const selectedEntities = entities.filter((e) => selectedIds.includes(e.id));
  const singleEntity = selectedEntities.length === 1 ? selectedEntities[0] : null;
  const singleMetrics = singleEntity ? getEntityMetrics(singleEntity) : null;

  const updateSingleEntity = (patch: Partial<CadEntity>) => {
    if (!singleEntity) return;
    onUpdateEntities(
      entities.map((e) =>
        e.id === singleEntity.id ? ({ ...e, ...patch } as CadEntity) : e
      )
    );
  };

  const updateSelectedCommon = (patch: Partial<CadEntity>) => {
    onUpdateEntities(
      entities.map((e) =>
        selectedIds.includes(e.id) ? ({ ...e, ...patch } as CadEntity) : e
      )
    );
  };

  return (
    <aside className="w-80 shrink-0 h-full bg-[#0F172A] border-l border-slate-800 flex flex-col select-none">
      {/* Segmented Tab Control */}
      <div className="p-2.5 border-b border-slate-800">
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800/80">
          <button
            type="button"
            onClick={() => setActiveTab('properties')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'properties'
                ? 'bg-slate-800 text-slate-100 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>性質與精確輸入 ({selectedEntities.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('layers')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'layers'
                ? 'bg-slate-800 text-slate-100 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>圖層管理 ({layers.length})</span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {activeTab === 'properties' ? (
          selectedEntities.length === 0 ? (
            /* Document & OSNAP Configuration when nothing is selected */
            <div className="space-y-5">
              <div>
                <h3 className="text-xs font-semibold text-slate-200 mb-2.5">
                  圖面概況與目前設定
                </h3>
                <div className="bg-slate-900/70 border border-slate-800 rounded-lg divide-y divide-slate-800/80 text-xs">
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-slate-400">製圖單位</span>
                    <span className="font-mono text-slate-200">公釐 (mm)</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-slate-400">圖元物件總數</span>
                    <span className="font-mono text-slate-200 tabular-nums">
                      {entities.length} 個
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-slate-400">作用中圖層</span>
                    <select
                      value={activeLayerId}
                      onChange={(e) => onSelectLayer(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
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

              {/* Object Snap (OSNAP) Precision Modes */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-semibold text-slate-200">
                    物件鎖點過濾器 (OSNAP F3)
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings((s) => ({ ...s, osnap: !s.osnap }))
                    }
                    className={`px-2 py-0.5 text-[11px] font-mono rounded transition-colors ${
                      settings.osnap
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {settings.osnap ? 'ON 啟用中' : 'OFF 關閉'}
                  </button>
                </div>

                <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 space-y-2 text-xs">
                  {(
                    [
                      { key: 'endpoint', label: '端點 (Endpoint)', symbol: '□' },
                      { key: 'midpoint', label: '中點 (Midpoint)', symbol: '△' },
                      { key: 'center', label: '圓心 (Center)', symbol: '○' },
                      { key: 'quadrant', label: '四分點 (Quadrant)', symbol: '◇' },
                      { key: 'intersection', label: '交點 (Intersection)', symbol: '×' },
                    ] as const
                  ).map((item) => (
                    <label
                      key={item.key}
                      className="flex items-center justify-between py-1 cursor-pointer hover:text-slate-100 text-slate-300"
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-4 text-center font-mono text-emerald-400 font-bold">
                          {item.symbol}
                        </span>
                        <span>{item.label}</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.osnapModes[item.key]}
                        onChange={(e) =>
                          onUpdateSettings((s) => ({
                            ...s,
                            osnapModes: {
                              ...s.osnapModes,
                              [item.key]: e.target.checked,
                            },
                          }))
                        }
                        className="rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-0"
                      />
                    </label>
                  ))}
                </div>
              </div>

              {/* Grid & Polar Precision Step */}
              <div>
                <h3 className="text-xs font-semibold text-slate-200 mb-2.5">
                  網格與極座標間距參數
                </h3>
                <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">網格鎖點間距 (F9)</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={settings.snapStep}
                        onChange={(e) =>
                          onUpdateSettings((s) => ({
                            ...s,
                            snapStep: Math.max(1, Number(e.target.value)),
                          }))
                        }
                        className="w-16 px-2 py-1 text-right font-mono bg-slate-950 border border-slate-700 rounded text-slate-100"
                      />
                      <span className="text-slate-500 font-mono">mm</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">極座標增量角 (F10)</span>
                    <select
                      value={settings.polarAngle}
                      onChange={(e) =>
                        onUpdateSettings((s) => ({
                          ...s,
                          polarAngle: Number(e.target.value),
                        }))
                      }
                      className="bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-slate-100"
                    >
                      <option value={15}>15°</option>
                      <option value={30}>30°</option>
                      <option value={45}>45°</option>
                      <option value={90}>90°</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Quick Keyboard Guide */}
              <div>
                <h3 className="text-xs font-semibold text-slate-200 mb-2">
                  AutoCAD 常用快捷鍵
                </h3>
                <div className="bg-slate-900/50 border border-slate-800/80 rounded-lg p-3 space-y-1.5 text-[11px] text-slate-400 font-mono">
                  <div className="flex justify-between">
                    <span>L / PL / REC</span>
                    <span className="text-slate-300">直線 / 聚合線 / 矩形</span>
                  </div>
                  <div className="flex justify-between">
                    <span>C / A / POL</span>
                    <span className="text-slate-300">圓形 / 圓弧 / 多邊形</span>
                  </div>
                  <div className="flex justify-between">
                    <span>DIM / DIST</span>
                    <span className="text-slate-300">尺寸標註 / 距離測量</span>
                  </div>
                  <div className="flex justify-between">
                    <span>M / CO / RO / MI</span>
                    <span className="text-slate-300">移動 / 複製 / 旋轉 / 鏡射</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Space / 滑鼠中鍵</span>
                    <span className="text-slate-300">平移畫布視角</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Selected Entity / Entities Properties Editor */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-slate-100">
                    {singleEntity
                      ? `圖元性質: ${singleEntity.type.toUpperCase()}`
                      : `已選取 ${selectedEntities.length} 個圖元物件`}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {singleEntity ? `ID: ${singleEntity.id.slice(0, 14)}` : '批次屬性編輯模式'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={onDuplicateSelected}
                    title="快速複製選取物件"
                    className="p-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={onExplodeSelected}
                    title="炸開為獨立線段 (EXPLODE)"
                    className="p-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={onDeleteSelected}
                    title="刪除選取物件 (Delete)"
                    className="p-1.5 text-rose-400 hover:text-rose-200 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/50 rounded transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Common Layer / Linetype / Weight Controls */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">所屬圖層 (Layer)</span>
                  <select
                    value={singleEntity ? singleEntity.layerId : ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        updateSelectedCommon({ layerId: e.target.value });
                      }
                    }}
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
                  >
                    {!singleEntity && <option value="">-- 多重圖層 --</option>}
                    {layers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">線型 (Linetype)</span>
                  <select
                    value={singleEntity?.lineType || ''}
                    onChange={(e) =>
                      updateSelectedCommon({
                        lineType: (e.target.value || undefined) as
                          | LineType
                          | undefined,
                      })
                    }
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
                  >
                    <option value="">依圖層 (ByLayer)</option>
                    <option value="continuous">Continuous 實線</option>
                    <option value="dashed">Dashed 虛線</option>
                    <option value="center">Center 中心線</option>
                    <option value="dotted">Dotted 點線</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">線寬 (Lineweight)</span>
                  <select
                    value={singleEntity?.lineWeight || ''}
                    onChange={(e) =>
                      updateSelectedCommon({
                        lineWeight: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-slate-100"
                  >
                    <option value="">依圖層 (ByLayer)</option>
                    <option value="0.13">0.13 mm (極細)</option>
                    <option value="0.18">0.18 mm (標註線)</option>
                    <option value="0.25">0.25 mm (一般線)</option>
                    <option value="0.35">0.35 mm (輪廓線)</option>
                    <option value="0.5">0.50 mm (結構粗線)</option>
                    <option value="0.7">0.70 mm (重剖面線)</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-slate-400">顏色覆寫 (Color)</span>
                    <button
                      type="button"
                      onClick={() => updateSelectedCommon({ color: undefined })}
                      className="text-[11px] text-sky-400 hover:underline"
                    >
                      重設為 ByLayer
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => updateSelectedCommon({ color: c })}
                        style={{ backgroundColor: c }}
                        className={`w-5 h-5 rounded border ${
                          singleEntity?.color === c
                            ? 'border-white scale-110'
                            : 'border-slate-700'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Single Entity Geometric Coordinates & Parametric Editing */}
              {singleEntity && (
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-3 text-xs">
                  <h4 className="font-semibold text-slate-200">
                    幾何座標與參數微調
                  </h4>

                  {singleEntity.type === 'line' && (
                    <div className="grid grid-cols-2 gap-2 font-mono">
                      <div>
                        <label className="block text-[10px] text-slate-400">
                          起點 X1 (mm)
                        </label>
                        <input
                          type="number"
                          step="1"
                          value={Number(singleEntity.p1.x.toFixed(2))}
                          onChange={(e) =>
                            updateSingleEntity({
                              p1: {
                                ...singleEntity.p1,
                                x: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">
                          起點 Y1 (mm)
                        </label>
                        <input
                          type="number"
                          step="1"
                          value={Number(singleEntity.p1.y.toFixed(2))}
                          onChange={(e) =>
                            updateSingleEntity({
                              p1: {
                                ...singleEntity.p1,
                                y: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">
                          終點 X2 (mm)
                        </label>
                        <input
                          type="number"
                          step="1"
                          value={Number(singleEntity.p2.x.toFixed(2))}
                          onChange={(e) =>
                            updateSingleEntity({
                              p2: {
                                ...singleEntity.p2,
                                x: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">
                          終點 Y2 (mm)
                        </label>
                        <input
                          type="number"
                          step="1"
                          value={Number(singleEntity.p2.y.toFixed(2))}
                          onChange={(e) =>
                            updateSingleEntity({
                              p2: {
                                ...singleEntity.p2,
                                y: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-slate-100"
                        />
                      </div>
                    </div>
                  )}

                  {singleEntity.type === 'circle' && (
                    <div className="space-y-2 font-mono">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-400">
                            圓心 X (mm)
                          </label>
                          <input
                            type="number"
                            value={Number(singleEntity.center.x.toFixed(2))}
                            onChange={(e) =>
                              updateSingleEntity({
                                center: {
                                  ...singleEntity.center,
                                  x: Number(e.target.value),
                                },
                              })
                            }
                            className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400">
                            圓心 Y (mm)
                          </label>
                          <input
                            type="number"
                            value={Number(singleEntity.center.y.toFixed(2))}
                            onChange={(e) =>
                              updateSingleEntity({
                                center: {
                                  ...singleEntity.center,
                                  y: Number(e.target.value),
                                },
                              })
                            }
                            className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-slate-100"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-400">
                            半徑 R (mm)
                          </label>
                          <input
                            type="number"
                            min={0.5}
                            value={Number(singleEntity.radius.toFixed(2))}
                            onChange={(e) =>
                              updateSingleEntity({
                                radius: Math.max(0.5, Number(e.target.value)),
                              })
                            }
                            className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400">
                            直徑 Ø (mm)
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={Number((singleEntity.radius * 2).toFixed(2))}
                            onChange={(e) =>
                              updateSingleEntity({
                                radius: Math.max(0.5, Number(e.target.value) / 2),
                              })
                            }
                            className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-slate-100"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {singleEntity.type === 'rectangle' && (
                    <div className="grid grid-cols-2 gap-2 font-mono">
                      <div>
                        <label className="block text-[10px] text-slate-400">
                          寬度 W (mm)
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={Number(
                            Math.abs(
                              singleEntity.p2.x - singleEntity.p1.x
                            ).toFixed(2)
                          )}
                          onChange={(e) => {
                            const w = Math.max(1, Number(e.target.value));
                            const dir =
                              singleEntity.p2.x >= singleEntity.p1.x ? 1 : -1;
                            updateSingleEntity({
                              p2: {
                                ...singleEntity.p2,
                                x: singleEntity.p1.x + dir * w,
                              },
                            });
                          }}
                          className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">
                          高度 H (mm)
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={Number(
                            Math.abs(
                              singleEntity.p2.y - singleEntity.p1.y
                            ).toFixed(2)
                          )}
                          onChange={(e) => {
                            const h = Math.max(1, Number(e.target.value));
                            const dir =
                              singleEntity.p2.y >= singleEntity.p1.y ? 1 : -1;
                            updateSingleEntity({
                              p2: {
                                ...singleEntity.p2,
                                y: singleEntity.p1.y + dir * h,
                              },
                            });
                          }}
                          className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-slate-100"
                        />
                      </div>
                    </div>
                  )}

                  {singleEntity.type === 'polygon' && (
                    <div className="grid grid-cols-2 gap-2 font-mono">
                      <div>
                        <label className="block text-[10px] text-slate-400">
                          正多邊形邊數
                        </label>
                        <input
                          type="number"
                          min={3}
                          max={24}
                          value={singleEntity.sides}
                          onChange={(e) =>
                            updateSingleEntity({
                              sides: Math.max(
                                3,
                                Math.min(24, Number(e.target.value))
                              ),
                            })
                          }
                          className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">
                          外接半徑 R (mm)
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={Number(singleEntity.radius.toFixed(2))}
                          onChange={(e) =>
                            updateSingleEntity({
                              radius: Math.max(1, Number(e.target.value)),
                            })
                          }
                          className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-slate-100"
                        />
                      </div>
                    </div>
                  )}

                  {singleEntity.type === 'text' && (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">
                          文字內容
                        </label>
                        <input
                          type="text"
                          value={singleEntity.content}
                          onChange={(e) =>
                            updateSingleEntity({ content: e.target.value })
                          }
                          className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-slate-100"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2 font-mono">
                        <div>
                          <label className="block text-[10px] text-slate-400">
                            字高 (mm)
                          </label>
                          <input
                            type="number"
                            min={4}
                            value={singleEntity.fontSize}
                            onChange={(e) =>
                              updateSingleEntity({
                                fontSize: Math.max(4, Number(e.target.value)),
                              })
                            }
                            className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400">
                            旋轉角度 (°)
                          </label>
                          <input
                            type="number"
                            value={singleEntity.rotation}
                            onChange={(e) =>
                              updateSingleEntity({
                                rotation: Number(e.target.value),
                              })
                            }
                            className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-slate-100"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {singleEntity.type === 'dimension' && (
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">
                        自訂公差或標註文字覆寫 (空白則自動計算)
                      </label>
                      <input
                        type="text"
                        placeholder="例如: Ø240.0 ±0.05"
                        value={singleEntity.textOverride || ''}
                        onChange={(e) =>
                          updateSingleEntity({
                            textOverride: e.target.value || undefined,
                          })
                        }
                        className="w-full px-2 py-1 font-mono bg-slate-950 border border-slate-700 rounded text-slate-100"
                      />
                    </div>
                  )}

                  {/* Computed Geometric Readouts */}
                  {singleMetrics && (
                    <div className="pt-2 border-t border-slate-800 space-y-1.5 font-mono">
                      {singleMetrics.length !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">長度 / 周長</span>
                          <span className="text-sky-300 tabular-nums">
                            {singleMetrics.length.toFixed(2)} mm
                          </span>
                        </div>
                      )}
                      {singleMetrics.area !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">封閉面積</span>
                          <span className="text-emerald-300 tabular-nums">
                            {singleMetrics.area.toFixed(1)} mm² (
                            {(singleMetrics.area / 1e6).toFixed(4)} m²)
                          </span>
                        </div>
                      )}
                      {singleMetrics.angleDeg !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">向量傾角</span>
                          <span className="text-slate-200 tabular-nums">
                            {singleMetrics.angleDeg.toFixed(2)}°
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        ) : (
          /* Layers Manager Tab */
          <div className="space-y-4">
            {/* Add New Layer Form */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-2.5">
              <h4 className="text-xs font-semibold text-slate-200">
                新增工程圖層
              </h4>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newLayerColor}
                  onChange={(e) => setNewLayerColor(e.target.value)}
                  className="w-7 h-7 rounded bg-transparent border border-slate-700 cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  placeholder="輸入圖層名稱 (如: E-POWR)"
                  value={newLayerName}
                  onChange={(e) => setNewLayerName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newLayerName.trim()) {
                      onAddLayer(newLayerName.trim(), newLayerColor);
                      setNewLayerName('');
                    }
                  }}
                  className="flex-1 min-w-0 px-2.5 py-1 text-xs bg-slate-950 border border-slate-700 rounded text-slate-100 focus:outline-none focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newLayerName.trim()) {
                      onAddLayer(newLayerName.trim(), newLayerColor);
                      setNewLayerName('');
                    }
                  }}
                  className="p-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded transition-colors shrink-0"
                  title="新增圖層"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Layer List */}
            <div className="space-y-1.5">
              {layers.map((layer) => {
                const isActive = layer.id === activeLayerId;
                const count = entities.filter((e) => e.layerId === layer.id).length;

                return (
                  <div
                    key={layer.id}
                    onClick={() => onSelectLayer(layer.id)}
                    className={`p-2.5 rounded-lg border transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-sky-950/30 border-sky-500/60'
                        : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="color"
                          value={layer.color}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            onUpdateLayer({ ...layer, color: e.target.value })
                          }
                          className="w-4 h-4 rounded border border-slate-600 bg-transparent cursor-pointer shrink-0"
                        />
                        <span className="text-xs font-medium text-slate-100 truncate">
                          {layer.name}
                        </span>
                      </div>

                      <div
                        className="flex items-center gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-[11px] font-mono text-slate-400 mr-1 tabular-nums">
                          {count}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateLayer({ ...layer, visible: !layer.visible })
                          }
                          title={layer.visible ? '隱藏圖層' : '顯示圖層'}
                          className={`p-1 rounded ${
                            layer.visible
                              ? 'text-slate-300 hover:bg-slate-800'
                              : 'text-slate-600 bg-slate-950'
                          }`}
                        >
                          {layer.visible ? (
                            <Eye className="w-3.5 h-3.5" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateLayer({ ...layer, locked: !layer.locked })
                          }
                          title={layer.locked ? '解鎖圖層' : '鎖定圖層'}
                          className={`p-1 rounded ${
                            layer.locked
                              ? 'text-amber-400 bg-amber-950/50'
                              : 'text-slate-400 hover:bg-slate-800'
                          }`}
                        >
                          {layer.locked ? (
                            <Lock className="w-3.5 h-3.5" />
                          ) : (
                            <Unlock className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {layer.id !== '0' && (
                          <button
                            type="button"
                            onClick={() => onDeleteLayer(layer.id)}
                            title="刪除圖層"
                            className="p-1 text-slate-500 hover:text-rose-400 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Layer Linetype & Weight Row */}
                    <div
                      className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-800/60 text-[11px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <select
                        value={layer.lineType}
                        onChange={(e) =>
                          onUpdateLayer({
                            ...layer,
                            lineType: e.target.value as LineType,
                          })
                        }
                        className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-slate-300 font-mono"
                      >
                        <option value="continuous">Continuous</option>
                        <option value="dashed">Dashed</option>
                        <option value="center">Center</option>
                        <option value="dotted">Dotted</option>
                      </select>

                      <select
                        value={layer.lineWeight}
                        onChange={(e) =>
                          onUpdateLayer({
                            ...layer,
                            lineWeight: Number(e.target.value),
                          })
                        }
                        className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-slate-300 font-mono"
                      >
                        <option value={0.13}>0.13 mm</option>
                        <option value={0.18}>0.18 mm</option>
                        <option value={0.25}>0.25 mm</option>
                        <option value={0.35}>0.35 mm</option>
                        <option value={0.5}>0.50 mm</option>
                        <option value={0.7}>0.70 mm</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
