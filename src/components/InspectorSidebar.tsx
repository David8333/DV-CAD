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
  Combine,
  AlignCenterHorizontal,
} from 'lucide-react';
import {
  CadEntity,
  CadLayer,
  DimensionEntity,
  DraftingSettings,
  LineType,
} from '../types/cad';
import {
  angleDegrees,
  createRadiusDimensionForArc,
  DEG_TO_RAD,
  dist,
  getArcThreePoints,
  getEntityBounds,
  getEntityMetrics,
  getSelectionReferencePoint,
  midpoint,
  RAD_TO_DEG,
  translateEntity,
} from '../utils/geometry';

interface InspectorSidebarProps {
  layers: CadLayer[];
  activeLayerId: string;
  onSelectLayer: (id: string) => void;
  onUpdateLayer: (layer: CadLayer) => void;
  onToggleAllLayers: (visible: boolean) => void;
  onAddLayer: (name: string, color: string) => void;
  onDeleteLayer: (id: string) => void;
  entities: CadEntity[];
  selectedIds: string[];
  onUpdateEntities: (updated: CadEntity[]) => void;
  onDeleteSelected: () => void;
  onExplodeSelected: () => void;
  onJoinSelected: () => void;
  onAlignDimensions: () => void;
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
  onToggleAllLayers,
  onAddLayer,
  onDeleteLayer,
  entities,
  selectedIds,
  onUpdateEntities,
  onDeleteSelected,
  onExplodeSelected,
  onJoinSelected,
  onAlignDimensions,
  onDuplicateSelected,
  settings,
  onUpdateSettings,
}) => {
  const [activeTab, setActiveTab] = useState<'properties' | 'layers'>(
    'properties'
  );
  const [newLayerName, setNewLayerName] = useState('');
  const [newLayerColor, setNewLayerColor] = useState('#38BDF8');

  const selectedEntities = entities.filter((e) => selectedIds.includes(e.id));
  const singleEntity =
    selectedEntities.length === 1 ? selectedEntities[0] : null;
  const singleMetrics = singleEntity ? getEntityMetrics(singleEntity) : null;
  const selectedDimensions = selectedEntities.filter(
    (e): e is DimensionEntity => e.type === 'dimension'
  );

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

  const updateSelectedDimensions = (patch: Partial<DimensionEntity>) => {
    onUpdateEntities(
      entities.map((e) =>
        selectedIds.includes(e.id) && e.type === 'dimension'
          ? { ...e, ...patch }
          : e
      )
    );
  };

  const selectionRefPt = getSelectionReferencePoint(selectedEntities);

  const jumpSelectionToCoord = (nextX: number, nextY: number) => {
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return;
    const dx = nextX - selectionRefPt.x;
    const dy = nextY - selectionRefPt.y;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return;
    onUpdateEntities(
      entities.map((ent) =>
        selectedIds.includes(ent.id) ? translateEntity(ent, dx, dy) : ent
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
            <span>性質與修改尺寸 ({selectedEntities.length})</span>
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
                      {
                        key: 'intersection',
                        label: '交點 (Intersection)',
                        symbol: '×',
                      },
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
                        className="accent-sky-500 rounded"
                      />
                    </label>
                  ))}
                </div>
              </div>

              {/* Grid & Polar Interval Configuration */}
              <div>
                <h3 className="text-xs font-semibold text-slate-200 mb-2.5">
                  極座標與網格參數
                </h3>
                <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">網格吸附間距 (F9)</span>
                    <div className="flex items-center gap-1">
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
                      className="bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-slate-100"
                    >
                      <option value={15}>15°</option>
                      <option value={30}>30°</option>
                      <option value={45}>45°</option>
                      <option value={90}>90°</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Selected Entities Inspector */
            <div className="space-y-5">
              {/* Header & Quick Actions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-sky-400">
                    {singleEntity
                      ? `選取物件: ${
                          singleEntity.type === 'group'
                            ? '組裝圖元 (GROUP)'
                            : singleEntity.type.toUpperCase()
                        }`
                      : `多重選取 (${selectedEntities.length} 個圖元)`}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={onDuplicateSelected}
                      title="複製選取物件"
                      className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={onExplodeSelected}
                      title="炸開為獨立圖元 (X)"
                      className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={onDeleteSelected}
                      title="刪除 (E / DEL)"
                      className="p-1.5 rounded bg-rose-950/60 hover:bg-rose-900/70 text-rose-300 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Multi-entity Join or Dimension Alignment Quick Buttons */}
                {selectedEntities.length >= 2 && (
                  <div className="grid grid-cols-1 gap-1.5">
                    <button
                      type="button"
                      onClick={onJoinSelected}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-emerald-600/25 hover:bg-emerald-600/35 text-emerald-200 border border-emerald-500/50 rounded-lg text-xs font-medium transition-colors"
                    >
                      <Combine className="w-3.5 h-3.5" />
                      <span>
                        組裝為單一圖元物件 ({selectedEntities.length} 個) [J]
                      </span>
                    </button>
                    {selectedDimensions.length >= 2 && (
                      <button
                        type="button"
                        onClick={onAlignDimensions}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-sky-600/25 hover:bg-sky-600/35 text-sky-200 border border-sky-500/50 rounded-lg text-xs font-medium transition-colors"
                      >
                        <AlignCenterHorizontal className="w-3.5 h-3.5" />
                        <span>
                          相互對齊所選標註尺寸 ({selectedDimensions.length} 個)
                        </span>
                      </button>
                    )}
                  </div>
                )}

                {singleEntity?.type === 'group' && (
                  <button
                    type="button"
                    onClick={onExplodeSelected}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-lg text-xs font-medium transition-colors"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>
                      炸開此組裝圖元 (還原 {singleEntity.children.length} 個獨立物件) [X]
                    </span>
                  </button>
                )}
              </div>

              {/* Move / Jump Selected Entities by X, Y Coordinates */}
              <div className="bg-slate-900/90 border border-emerald-500/40 rounded-lg p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-300">
                    移動物件座標跳轉 (X, Y)
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    基準點座標
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">
                      目標 X 座標 (mm)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={Number(selectionRefPt.x.toFixed(2))}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          jumpSelectionToCoord(val, selectionRefPt.y);
                        }
                      }}
                      className="w-full px-2 py-1 bg-slate-950 border border-emerald-500/50 rounded text-emerald-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">
                      目標 Y 座標 (mm)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={Number(selectionRefPt.y.toFixed(2))}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          jumpSelectionToCoord(selectionRefPt.x, val);
                        }
                      }}
                      className="w-full px-2 py-1 bg-slate-950 border border-emerald-500/50 rounded text-emerald-200"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-[10px] text-slate-400">
                    輸入 X, Y 數值即可將所選物件直接跳轉至該座標
                  </span>
                  <button
                    type="button"
                    onClick={() => jumpSelectionToCoord(0, 0)}
                    className="px-2 py-0.5 text-[10px] font-mono bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-200 border border-emerald-500/40 rounded shrink-0"
                  >
                    跳至 (0,0)
                  </button>
                </div>
              </div>

              {/* Multi-selected Dimension Precision, Tolerance (+/-), ISO Diameter & Font Size Control */}
              {selectedDimensions.length >= 1 && (
                <div className="bg-slate-900/90 border border-amber-500/40 rounded-lg p-3 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-amber-300">
                      標註尺寸設定與正負公差
                    </span>
                    <span className="text-[10px] font-mono text-amber-200/80">
                      已選 {selectedDimensions.length} 組標註
                    </span>
                  </div>

                  {/* 1. Dimension Mode: Linear vs ISO Circle Diameter (Ø) vs Radius (R) */}
                  <div className="space-y-1">
                    <span className="block text-[11px] text-slate-300">
                      標註規範模式：
                    </span>
                    <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-950 rounded border border-slate-800">
                      <button
                        type="button"
                        onClick={() =>
                          updateSelectedDimensions({
                            dimMode: 'linear',
                            textOverride: undefined,
                          })
                        }
                        className={`py-1 px-1.5 rounded text-[10px] font-medium transition-colors ${
                          (selectedDimensions[0].dimMode || 'linear') ===
                          'linear'
                            ? 'bg-sky-600 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        線性尺寸
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateSelectedDimensions({
                            dimMode: 'diameter',
                            textOverride: undefined,
                          })
                        }
                        className={`py-1 px-1.5 rounded text-[10px] font-medium transition-colors ${
                          selectedDimensions[0].dimMode === 'diameter'
                            ? 'bg-amber-500 text-slate-950 font-semibold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        圓直徑 (Ø)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateSelectedDimensions({
                            dimMode: 'radius',
                            textOverride: undefined,
                          })
                        }
                        className={`py-1 px-1.5 rounded text-[10px] font-medium transition-colors ${
                          selectedDimensions[0].dimMode === 'radius'
                            ? 'bg-emerald-500 text-slate-950 font-semibold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        導圓角半徑 (R)
                      </button>
                    </div>
                  </div>

                  {/* 2. Decimal Precision: 0, 1, 2 decimal places */}
                  <div className="space-y-1">
                    <span className="block text-[11px] text-slate-300">
                      標註數值小數位數：
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { val: 0, label: '第0位 (0)' },
                          { val: 1, label: '後第1位 (0.0)' },
                          { val: 2, label: '後第2位 (0.00)' },
                        ] as const
                      ).map((opt) => {
                        const curPrec = selectedDimensions[0].precision ?? 1;
                        return (
                          <button
                            key={opt.val}
                            type="button"
                            onClick={() =>
                              updateSelectedDimensions({
                                precision: opt.val,
                                textOverride: undefined,
                              })
                            }
                            className={`py-1 px-1.5 rounded font-mono text-[10px] border transition-colors ${
                              curPrec === opt.val
                                ? 'bg-sky-600 text-white border-sky-400 font-bold'
                                : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. Plus / Minus Tolerance Configuration */}
                  <div className="space-y-2 pt-1 border-t border-slate-800">
                    <span className="block text-[11px] text-amber-300 font-medium">
                      正負公差標註設定 (可設為 0，或正值最小 0.01 / 負值最大 -0.01)：
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { mode: 'none', label: '無公差' },
                          { mode: 'symmetric', label: '對稱 ±' },
                          { mode: 'deviation', label: '正負 + / -' },
                        ] as const
                      ).map((item) => {
                        const curMode =
                          selectedDimensions[0].toleranceMode || 'none';
                        return (
                          <button
                            key={item.mode}
                            type="button"
                            onClick={() =>
                              updateSelectedDimensions({
                                toleranceMode: item.mode,
                                toleranceUpper:
                                  selectedDimensions[0].toleranceUpper !==
                                  undefined
                                    ? selectedDimensions[0].toleranceUpper
                                    : 0.05,
                                toleranceLower:
                                  selectedDimensions[0].toleranceLower !==
                                  undefined
                                    ? selectedDimensions[0].toleranceLower
                                    : -0.02,
                                textOverride: undefined,
                              })
                            }
                            className={`py-1 px-1.5 rounded text-[11px] font-medium border transition-colors ${
                              curMode === item.mode
                                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                                : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                            }`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>

                    {selectedDimensions[0].toleranceMode === 'symmetric' && (
                      <div className="space-y-1.5 pt-1 font-mono">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-300">
                            對稱公差 ± (可設 0 或最小 0.01):
                          </span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={
                              selectedDimensions[0].toleranceUpper !== undefined
                                ? selectedDimensions[0].toleranceUpper
                                : 0.05
                            }
                            onChange={(e) => {
                              const raw = parseFloat(e.target.value);
                              if (!isNaN(raw)) {
                                const absVal = Math.abs(raw);
                                const clamped =
                                  absVal === 0
                                    ? 0
                                    : Math.max(0.01, absVal);
                                updateSelectedDimensions({
                                  toleranceUpper: clamped,
                                  toleranceLower: -clamped,
                                  textOverride: undefined,
                                });
                              }
                            }}
                            className="w-20 px-2 py-1 text-right bg-slate-950 border border-amber-500/60 rounded text-amber-200"
                          />
                        </div>
                        <div className="grid grid-cols-5 gap-1">
                          {[0, 0.01, 0.02, 0.05, 0.1].map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() =>
                                updateSelectedDimensions({
                                  toleranceUpper: v,
                                  toleranceLower: -v,
                                  textOverride: undefined,
                                })
                              }
                              className="py-0.5 rounded bg-slate-950 hover:bg-slate-800 text-amber-300 border border-slate-800 text-[10px]"
                            >
                              ±{v === 0 ? '0' : v.toFixed(2)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedDimensions[0].toleranceMode === 'deviation' && (
                      <div className="space-y-2 pt-1 font-mono">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="flex items-center justify-between mb-0.5">
                              <label className="block text-[10px] text-emerald-300">
                                正公差 + (可為 0)
                              </label>
                              <button
                                type="button"
                                onClick={() =>
                                  updateSelectedDimensions({
                                    toleranceUpper: 0,
                                    textOverride: undefined,
                                  })
                                }
                                className="px-1.5 py-0 text-[9px] bg-emerald-950/80 hover:bg-emerald-800 text-emerald-200 border border-emerald-500/40 rounded"
                              >
                                設為 0
                              </button>
                            </div>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={
                                selectedDimensions[0].toleranceUpper !==
                                undefined
                                  ? selectedDimensions[0].toleranceUpper
                                  : 0.05
                              }
                              onChange={(e) => {
                                const raw = parseFloat(e.target.value);
                                if (!isNaN(raw)) {
                                  const nextUp =
                                    raw <= 0
                                      ? 0
                                      : raw < 0.01
                                        ? 0.01
                                        : raw;
                                  updateSelectedDimensions({
                                    toleranceUpper: nextUp,
                                    textOverride: undefined,
                                  });
                                }
                              }}
                              className="w-full px-2 py-1 bg-slate-950 border border-emerald-500/60 rounded text-emerald-200"
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-0.5">
                              <label className="block text-[10px] text-rose-300">
                                負公差 - (可為 0)
                              </label>
                              <button
                                type="button"
                                onClick={() =>
                                  updateSelectedDimensions({
                                    toleranceLower: 0,
                                    textOverride: undefined,
                                  })
                                }
                                className="px-1.5 py-0 text-[9px] bg-rose-950/80 hover:bg-rose-800 text-rose-200 border border-rose-500/40 rounded"
                              >
                                設為 0
                              </button>
                            </div>
                            <input
                              type="number"
                              max={0}
                              step="0.01"
                              value={
                                selectedDimensions[0].toleranceLower !==
                                undefined
                                  ? selectedDimensions[0].toleranceLower
                                  : -0.02
                              }
                              onChange={(e) => {
                                const raw = parseFloat(e.target.value);
                                if (!isNaN(raw)) {
                                  const nextLow =
                                    raw === 0
                                      ? 0
                                      : raw > 0
                                        ? -Math.max(0.01, raw)
                                        : raw > -0.01
                                          ? -0.01
                                          : raw;
                                  updateSelectedDimensions({
                                    toleranceLower: nextLow,
                                    textOverride: undefined,
                                  });
                                }
                              }}
                              className="w-full px-2 py-1 bg-slate-950 border border-rose-500/60 rounded text-rose-200"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          {[
                            { up: 0.05, low: 0 },
                            { up: 0, low: -0.05 },
                            { up: 0.02, low: 0 },
                            { up: 0, low: -0.02 },
                            { up: 0.01, low: -0.01 },
                            { up: 0.05, low: -0.02 },
                          ].map((p, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() =>
                                updateSelectedDimensions({
                                  toleranceUpper: p.up,
                                  toleranceLower: p.low,
                                  textOverride: undefined,
                                })
                              }
                              className="py-0.5 px-1 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[10px]"
                            >
                              {p.up === 0 ? '0' : `+${p.up.toFixed(2)}`} /{' '}
                              {p.low === 0 ? '0' : p.low.toFixed(2)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 4. Font Size */}
                  <div className="pt-1 border-t border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-300">
                        標註字體大小 (mm)
                      </span>
                      <input
                        type="number"
                        min={6}
                        max={72}
                        value={selectedDimensions[0].fontSize || 11}
                        onChange={(e) => {
                          const fSize = Math.max(
                            6,
                            Math.min(72, Number(e.target.value))
                          );
                          updateSelectedDimensions({ fontSize: fSize });
                        }}
                        className="w-16 px-2 py-1 text-right font-mono bg-slate-950 border border-amber-500/60 rounded text-amber-200"
                      />
                    </div>
                    <div className="grid grid-cols-6 gap-1">
                      {[8, 10, 12, 14, 18, 24].map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() =>
                            updateSelectedDimensions({ fontSize: sz })
                          }
                          className={`py-1 rounded font-mono text-[11px] border ${
                            (selectedDimensions[0].fontSize || 11) === sz
                              ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                              : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                          }`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Common CAD Properties (Layer, Color, Linetype, Lineweight) */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">所屬圖層</span>
                  <select
                    value={singleEntity ? singleEntity.layerId : ''}
                    onChange={(e) =>
                      updateSelectedCommon({ layerId: e.target.value })
                    }
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

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">顏色覆寫</span>
                    <button
                      type="button"
                      onClick={() => updateSelectedCommon({ color: undefined })}
                      className="text-[11px] text-sky-400 hover:underline"
                    >
                      依圖層 (ByLayer)
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 pt-0.5">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => updateSelectedCommon({ color: c })}
                        style={{ backgroundColor: c }}
                        className={`w-5 h-5 rounded-full border ${
                          singleEntity?.color === c
                            ? 'ring-2 ring-sky-400 border-white'
                            : 'border-slate-700'
                        }`}
                      />
                    ))}
                  </div>
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
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 font-mono"
                  >
                    <option value="">ByLayer (依圖層)</option>
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
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 font-mono"
                  >
                    <option value="">ByLayer (依圖層)</option>
                    <option value="0.13">0.13 mm (極細)</option>
                    <option value="0.25">0.25 mm (標準)</option>
                    <option value="0.35">0.35 mm (中粗)</option>
                    <option value="0.5">0.50 mm (粗實線)</option>
                    <option value="0.7">0.70 mm (剖面粗線)</option>
                  </select>
                </div>
              </div>

              {/* Single Entity Direct Dimension & Coordinate Editor (圖元尺寸直接修改) */}
              {singleEntity && (
                <div className="bg-slate-900/70 border border-sky-500/40 rounded-lg p-3 space-y-3 text-xs">
                  <h4 className="font-semibold text-sky-300">
                    修改圖元尺寸與幾何參數
                  </h4>

                  {singleEntity.type === 'line' && (
                    <div className="space-y-2.5 font-mono">
                      {/* Direct Length & Angle Editor */}
                      <div className="grid grid-cols-2 gap-2 p-2 bg-slate-950/90 border border-sky-500/30 rounded">
                        <div>
                          <label className="block text-[10px] text-sky-300 mb-0.5">
                            直線長度 L (mm)
                          </label>
                          <input
                            type="number"
                            min={0.01}
                            step="0.01"
                            value={Number(
                              dist(singleEntity.p1, singleEntity.p2).toFixed(2)
                            )}
                            onChange={(e) => {
                              const newLen = Math.max(
                                0.01,
                                Number(e.target.value)
                              );
                              const angRad =
                                angleDegrees(singleEntity.p1, singleEntity.p2) *
                                DEG_TO_RAD;
                              updateSingleEntity({
                                p2: {
                                  x:
                                    singleEntity.p1.x +
                                    newLen * Math.cos(angRad),
                                  y:
                                    singleEntity.p1.y +
                                    newLen * Math.sin(angRad),
                                },
                              });
                            }}
                            className="w-full px-2 py-1 bg-slate-900 border border-sky-500/50 rounded text-sky-100"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-sky-300 mb-0.5">
                            角度 ∠ (°)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={Number(
                              angleDegrees(
                                singleEntity.p1,
                                singleEntity.p2
                              ).toFixed(2)
                            )}
                            onChange={(e) => {
                              const newDeg = Number(e.target.value);
                              const curLen = dist(
                                singleEntity.p1,
                                singleEntity.p2
                              );
                              const rad = newDeg * DEG_TO_RAD;
                              updateSingleEntity({
                                p2: {
                                  x:
                                    singleEntity.p1.x + curLen * Math.cos(rad),
                                  y:
                                    singleEntity.p1.y + curLen * Math.sin(rad),
                                },
                              });
                            }}
                            className="w-full px-2 py-1 bg-slate-900 border border-sky-500/50 rounded text-sky-100"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-400">
                            起點 X1
                          </label>
                          <input
                            type="number"
                            step="0.01"
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
                            起點 Y1
                          </label>
                          <input
                            type="number"
                            step="0.01"
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
                            終點 X2
                          </label>
                          <input
                            type="number"
                            step="0.01"
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
                            終點 Y2
                          </label>
                          <input
                            type="number"
                            step="0.01"
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
                    </div>
                  )}

                  {singleEntity.type === 'circle' && (
                    <div className="grid grid-cols-2 gap-2 font-mono">
                      <div>
                        <label className="block text-[10px] text-sky-300">
                          半徑 R (mm)
                        </label>
                        <input
                          type="number"
                          min={0.01}
                          step="0.01"
                          value={Number(singleEntity.radius.toFixed(2))}
                          onChange={(e) =>
                            updateSingleEntity({
                              radius: Math.max(0.01, Number(e.target.value)),
                            })
                          }
                          className="w-full px-2 py-1 bg-slate-950 border border-sky-500/60 rounded text-sky-200"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-amber-300">
                          直徑 Ø (mm)
                        </label>
                        <input
                          type="number"
                          min={0.02}
                          step="0.01"
                          value={Number((singleEntity.radius * 2).toFixed(2))}
                          onChange={(e) =>
                            updateSingleEntity({
                              radius: Math.max(
                                0.01,
                                Number(e.target.value) / 2
                              ),
                            })
                          }
                          className="w-full px-2 py-1 bg-slate-950 border border-amber-500/60 rounded text-amber-200"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">
                          圓心 X
                        </label>
                        <input
                          type="number"
                          step="0.01"
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
                          圓心 Y
                        </label>
                        <input
                          type="number"
                          step="0.01"
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
                  )}

                  {singleEntity.type === 'arc' && (
                    <div className="space-y-2 font-mono">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] text-sky-300">
                            圓弧半徑 R
                          </label>
                          <input
                            type="number"
                            min={0.01}
                            step="0.01"
                            value={Number(singleEntity.radius.toFixed(2))}
                            onChange={(e) => {
                              const nextR = Math.max(
                                0.01,
                                Number(e.target.value)
                              );
                              const [p1, p2, p3] = getArcThreePoints({
                                ...singleEntity,
                                radius: nextR,
                              });
                              updateSingleEntity({
                                radius: nextR,
                                p1,
                                p2,
                                p3,
                              });
                            }}
                            className="w-full px-2 py-1 bg-slate-950 border border-sky-500/60 rounded text-sky-200"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400">
                            起始角 (°)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={Number(
                              (singleEntity.startAngle * RAD_TO_DEG).toFixed(1)
                            )}
                            onChange={(e) => {
                              const nextStart =
                                Number(e.target.value) * DEG_TO_RAD;
                              const [p1, p2, p3] = getArcThreePoints({
                                ...singleEntity,
                                startAngle: nextStart,
                              });
                              updateSingleEntity({
                                startAngle: nextStart,
                                p1,
                                p2,
                                p3,
                              });
                            }}
                            className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400">
                            終止角 (°)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={Number(
                              (singleEntity.endAngle * RAD_TO_DEG).toFixed(1)
                            )}
                            onChange={(e) => {
                              const nextEnd =
                                Number(e.target.value) * DEG_TO_RAD;
                              const [p1, p2, p3] = getArcThreePoints({
                                ...singleEntity,
                                endAngle: nextEnd,
                              });
                              updateSingleEntity({
                                endAngle: nextEnd,
                                p1,
                                p2,
                                p3,
                              });
                            }}
                            className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-slate-100"
                          />
                        </div>
                      </div>
                      {(() => {
                        const [p1, p2, p3] = getArcThreePoints(singleEntity);
                        return (
                          <div className="space-y-2">
                            <button
                              type="button"
                              onClick={() => {
                                const dimLayer =
                                  layers.find((l) => l.id === 'DIM')?.id ||
                                  activeLayerId ||
                                  '0';
                                const newDim = createRadiusDimensionForArc(
                                  singleEntity,
                                  dimLayer,
                                  11
                                );
                                onUpdateEntities([...entities, newDim]);
                              }}
                              className="w-full py-1.5 px-2 bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-200 border border-emerald-500/50 rounded text-[11px] font-sans font-semibold transition-colors"
                            >
                              + 標註導圓角/圓弧半徑 (R
                              {singleEntity.radius.toFixed(2)})
                            </button>
                            <div className="p-2 bg-slate-950/80 border border-slate-800 rounded text-[10px] space-y-1">
                              <div className="text-slate-400 font-sans">
                                三點圓弧 / 導圓角控制點座標（可拖曳畫布上 P1/P2/P3 調整）：
                              </div>
                              <div className="text-emerald-300">
                                P1 起點: ({p1.x.toFixed(2)}, {p1.y.toFixed(2)})
                              </div>
                              <div className="text-amber-300">
                                P2 第二點: ({p2.x.toFixed(2)}, {p2.y.toFixed(2)})
                              </div>
                              <div className="text-rose-300">
                                P3 終點: ({p3.x.toFixed(2)}, {p3.y.toFixed(2)})
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {singleEntity.type === 'rectangle' && (
                    <div className="space-y-2 font-mono">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-sky-300">
                            寬度 W (mm)
                          </label>
                          <input
                            type="number"
                            min={0.01}
                            step="0.01"
                            value={Number(
                              Math.abs(
                                singleEntity.p2.x - singleEntity.p1.x
                              ).toFixed(2)
                            )}
                            onChange={(e) => {
                              const w = Math.max(0.01, Number(e.target.value));
                              const c = midpoint(
                                singleEntity.p1,
                                singleEntity.p2
                              );
                              updateSingleEntity({
                                p1: { ...singleEntity.p1, x: c.x - w / 2 },
                                p2: { ...singleEntity.p2, x: c.x + w / 2 },
                              });
                            }}
                            className="w-full px-2 py-1 bg-slate-950 border border-sky-500/60 rounded text-sky-100"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-sky-300">
                            高度 H (mm)
                          </label>
                          <input
                            type="number"
                            min={0.01}
                            step="0.01"
                            value={Number(
                              Math.abs(
                                singleEntity.p2.y - singleEntity.p1.y
                              ).toFixed(2)
                            )}
                            onChange={(e) => {
                              const h = Math.max(0.01, Number(e.target.value));
                              const c = midpoint(
                                singleEntity.p1,
                                singleEntity.p2
                              );
                              updateSingleEntity({
                                p1: { ...singleEntity.p1, y: c.y - h / 2 },
                                p2: { ...singleEntity.p2, y: c.y + h / 2 },
                              });
                            }}
                            className="w-full px-2 py-1 bg-slate-950 border border-sky-500/60 rounded text-sky-100"
                          />
                        </div>
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
                        <label className="block text-[10px] text-sky-300">
                          外接半徑 R (mm)
                        </label>
                        <input
                          type="number"
                          min={0.01}
                          step="0.01"
                          value={Number(singleEntity.radius.toFixed(2))}
                          onChange={(e) =>
                            updateSingleEntity({
                              radius: Math.max(0.01, Number(e.target.value)),
                            })
                          }
                          className="w-full px-2 py-1 bg-slate-950 border border-sky-500/60 rounded text-sky-100"
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
                    <div className="space-y-2">
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
                    </div>
                  )}

                  {singleEntity.type === 'hatch' && (
                    <div className="space-y-2.5 font-mono">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-emerald-300 font-sans">
                          45° 斜線填充 PITCH 間距 (mm)
                        </span>
                        <input
                          type="number"
                          min={0.5}
                          max={200}
                          step="0.5"
                          value={singleEntity.pitch}
                          onChange={(e) =>
                            updateSingleEntity({
                              pitch: Math.max(0.5, Number(e.target.value)),
                            })
                          }
                          className="w-20 px-2 py-1 text-right bg-slate-950 border border-emerald-500/60 rounded text-emerald-200"
                        />
                      </div>
                      <div className="grid grid-cols-5 gap-1">
                        {[2, 5, 8, 10, 15].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => updateSingleEntity({ pitch: p })}
                            className={`py-1 rounded text-[10px] border transition-colors ${
                              singleEntity.pitch === p
                                ? 'bg-emerald-600 text-white border-emerald-400 font-bold'
                                : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-emerald-500/50'
                            }`}
                          >
                            {p}mm
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Computed Geometric Readouts */}
                  {singleMetrics && (
                    <div className="pt-2 border-t border-slate-800 space-y-1.5 font-mono">
                      {singleMetrics.width !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">總寬度 W</span>
                          <span className="text-slate-200 tabular-nums">
                            {singleMetrics.width.toFixed(2)} mm
                          </span>
                        </div>
                      )}
                      {singleMetrics.height !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">總高度 H</span>
                          <span className="text-slate-200 tabular-nums">
                            {singleMetrics.height.toFixed(2)} mm
                          </span>
                        </div>
                      )}
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
                            {singleMetrics.area.toFixed(1)} mm²
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

            {/* Toggle All Layers On/Off Control Bar */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-200">
                  所有圖層顯示控制
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  目前開啟：{layers.filter((l) => l.visible).length} / {layers.length} 層
                </span>
              </div>
              {(() => {
                const allVisible = layers.every((l) => l.visible);
                return (
                  <button
                    type="button"
                    onClick={() => onToggleAllLayers(!allVisible)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      allVisible
                        ? 'bg-amber-500/20 text-amber-200 border-amber-500/50 hover:bg-amber-500/30'
                        : 'bg-emerald-600 text-white border-emerald-400 hover:bg-emerald-500'
                    }`}
                    title={
                      allVisible
                        ? '點擊一鍵關閉所有圖層顯示'
                        : '點擊一鍵開啟所有圖層顯示'
                    }
                  >
                    {allVisible ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>關閉所有圖層</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span>開啟所有圖層</span>
                      </>
                    )}
                  </button>
                );
              })()}
            </div>

            <div className="space-y-1.5">
              {layers.map((layer) => {
                const isActive = layer.id === activeLayerId;
                const count = entities.filter(
                  (e) => e.layerId === layer.id
                ).length;

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
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <input
                          type="color"
                          value={layer.color}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            onUpdateLayer({ ...layer, color: e.target.value })
                          }
                          className="w-4 h-4 rounded border border-slate-600 bg-transparent cursor-pointer shrink-0"
                        />
                        <input
                          type="text"
                          value={layer.name}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            onUpdateLayer({
                              ...layer,
                              name: e.target.value,
                            })
                          }
                          title="點擊直接修改圖層名稱"
                          placeholder="圖層名稱"
                          className="w-full min-w-0 px-1.5 py-0.5 text-xs font-medium text-slate-100 bg-slate-950/70 hover:bg-slate-950 focus:bg-slate-950 border border-transparent hover:border-slate-700 focus:border-sky-500 rounded focus:outline-none transition-colors"
                        />
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
