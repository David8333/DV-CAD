import {
  getDimensionLinePoints,
  formatDimensionLabel,
  findBestSnapPoint,
  snapDimensionOffsetToExisting,
  flattenEntities,
  dist,
} from '../utils/geometry';
import type {
  CadEntity,
  DimensionEntity,
  DraftingSettings,
  GroupEntity,
  LineEntity,
  ArcEntity,
  CircleEntity,
} from '../types/cad';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`FAIL: ${msg}`);
  }
}

console.log('--- DV-CAD Phase 2 尺寸標註與幾何選取/OSNAP 驗證測試 ---');

const defaultDraftingSettings: DraftingSettings = {
  grid: true,
  snap: false,
  snapStep: 10,
  ortho: false,
  polar: false,
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
  showLineWeight: false,
  showShortcutMenu: true,
};

const defaultLayers = [
  {
    id: '0',
    name: '0',
    color: '#ffffff',
    lineType: 'continuous' as const,
    lineWeight: 0.25,
    visible: true,
    locked: false,
  },
];

// 測試 1: 對角斜線的水平尺寸標註 (|dx|)
{
  const p1 = { x: 10, y: 20 };
  const p2 = { x: 60, y: 80 };
  // 向上拉出偏移點 (midpoint 為 (35, 50)，y 偏移大於 x 偏移)
  const offsetPoint = { x: 35, y: 120 };

  const dimLinear = getDimensionLinePoints({
    p1,
    p2,
    offsetPoint,
    dimMode: 'linear',
  });

  assert(Math.abs(dimLinear.length - 50) < 1e-4, `水平尺寸量測長度應為 50，實際為 ${dimLinear.length}`);
  assert(Math.abs(dimLinear.dimP1.x - 10) < 1e-4, `dimP1.x 應對齊 p1.x (10)，實際為 ${dimLinear.dimP1.x}`);
  assert(Math.abs(dimLinear.dimP2.x - 60) < 1e-4, `dimP2.x 應對齊 p2.x (60)，實際為 ${dimLinear.dimP2.x}`);
  assert(Math.abs(dimLinear.dimP1.y - 120) < 1e-4, `尺寸線 Y 座標應位於 offsetPoint.y (120)，實際為 ${dimLinear.dimP1.y}`);
  assert(Math.abs(dimLinear.dimP2.y - 120) < 1e-4, `尺寸線 Y 座標應位於 offsetPoint.y (120)，實際為 ${dimLinear.dimP2.y}`);
  assert(Math.abs(dimLinear.angle) < 1e-4, `水平尺寸線角度應為 0°，實際為 ${dimLinear.angle}`);

  // 強制 horizontal 模式
  const dimForcedHoriz = getDimensionLinePoints({
    p1,
    p2,
    offsetPoint: { x: 90, y: 100 },
    dimMode: 'horizontal',
  });
  assert(Math.abs(dimForcedHoriz.length - 50) < 1e-4, `強制 horizontal 模式長度應為 50`);
  console.log('✓ 測試 1 通過: 對角斜線水平尺寸標註 (|dx|) 正確');
}

// 測試 2: 對角斜線的垂直尺寸標註 (|dy|)
{
  const p1 = { x: 10, y: 20 };
  const p2 = { x: 60, y: 80 };
  // 向右拉出偏移點 (midpoint 為 (35, 50)，x 偏移大於 y 偏移)
  const offsetPoint = { x: 110, y: 50 };

  const dimLinear = getDimensionLinePoints({
    p1,
    p2,
    offsetPoint,
    dimMode: 'linear',
  });

  assert(Math.abs(dimLinear.length - 60) < 1e-4, `垂直尺寸量測長度應為 60，實際為 ${dimLinear.length}`);
  assert(Math.abs(dimLinear.dimP1.y - 20) < 1e-4, `dimP1.y 應對齊 p1.y (20)，實際為 ${dimLinear.dimP1.y}`);
  assert(Math.abs(dimLinear.dimP2.y - 80) < 1e-4, `dimP2.y 應對齊 p2.y (80)，實際為 ${dimLinear.dimP2.y}`);
  assert(Math.abs(dimLinear.dimP1.x - 110) < 1e-4, `尺寸線 X 座標應位於 offsetPoint.x (110)，實際為 ${dimLinear.dimP1.x}`);
  assert(Math.abs(dimLinear.dimP2.x - 110) < 1e-4, `尺寸線 X 座標應位於 offsetPoint.x (110)，實際為 ${dimLinear.dimP2.x}`);
  assert(Math.abs(dimLinear.angle - Math.PI / 2) < 1e-4, `垂直尺寸線角度應為 90°`);

  // 強制 vertical 模式
  const dimForcedVert = getDimensionLinePoints({
    p1,
    p2,
    offsetPoint: { x: 40, y: 150 },
    dimMode: 'vertical',
  });
  assert(Math.abs(dimForcedVert.length - 60) < 1e-4, `強制 vertical 模式長度應為 60`);
  console.log('✓ 測試 2 通過: 對角斜線垂直尺寸標註 (|dy|) 正確');
}

// 測試 3: 對齊尺寸標註 (DIMALIGNED，實際斜線距離 sqrt(dx² + dy²))
{
  const p1 = { x: 10, y: 20 };
  const p2 = { x: 50, y: 50 }; // dx = 40, dy = 30, hypot = 50
  const offsetPoint = { x: 20, y: 60 };

  const dimAligned = getDimensionLinePoints({
    p1,
    p2,
    offsetPoint,
    dimMode: 'aligned',
  });

  assert(Math.abs(dimAligned.length - 50) < 1e-4, `對齊尺寸長度應為 50，實際為 ${dimAligned.length}`);
  const expectedAngle = Math.atan2(30, 40);
  assert(Math.abs(dimAligned.angle - expectedAngle) < 1e-4, `尺寸線應平行於兩點連線角度`);
  console.log('✓ 測試 3 通過: 對齊尺寸標註 (DIMALIGNED) 正確');
}

// 測試 4: 純水平與純垂直線標註
{
  // 純水平線
  const hDim = getDimensionLinePoints({
    p1: { x: 10, y: 50 },
    p2: { x: 90, y: 50 },
    offsetPoint: { x: 50, y: 75 },
    dimMode: 'linear',
  });
  assert(Math.abs(hDim.length - 80) < 1e-4, `純水平線長度應為 80`);
  assert(Math.abs(hDim.dimP1.y - 75) < 1e-4, `水平尺寸線高度應在 Y=75`);

  // 純垂直線
  const vDim = getDimensionLinePoints({
    p1: { x: 50, y: 10 },
    p2: { x: 50, y: 90 },
    offsetPoint: { x: 85, y: 50 },
    dimMode: 'linear',
  });
  assert(Math.abs(vDim.length - 80) < 1e-4, `純垂直線長度應為 80`);
  assert(Math.abs(vDim.dimP1.x - 85) < 1e-4, `垂直尺寸線位置應在 X=85`);
  console.log('✓ 測試 4 通過: 純水平與純垂直線段標註無誤');
}

// 測試 5: 半徑 (R) 與直徑 (Ø) 標註
{
  // 導圓角/圓弧半徑
  const rDim = getDimensionLinePoints({
    p1: { x: 100, y: 100 }, // center
    p2: { x: 125, y: 100 }, // point on arc (r = 25)
    offsetPoint: { x: 135, y: 110 },
    dimMode: 'radius',
  });
  assert(rDim.isRadius === true, `isRadius 應為 true`);
  assert(Math.abs(rDim.length - 25) < 1e-4, `半徑長度應為 25`);
  const rLabel = formatDimensionLabel({ p1: { x: 0, y: 0 }, p2: { x: 25, y: 0 }, dimMode: 'radius' }, rDim.length);
  assert(rLabel.mainText.startsWith('R25'), `半徑文字應以 R 開頭`);

  // 圓形直徑
  const dDim = getDimensionLinePoints({
    p1: { x: 50, y: 100 },
    p2: { x: 150, y: 100 }, // diameter = 100
    offsetPoint: { x: 120, y: 120 },
    dimMode: 'diameter',
  });
  assert(dDim.isDiameter === true, `isDiameter 應為 true`);
  assert(Math.abs(dDim.length - 100) < 1e-4, `直徑長度應為 100`);
  const dLabel = formatDimensionLabel({ p1: { x: 50, y: 100 }, p2: { x: 150, y: 100 }, dimMode: 'diameter' }, dDim.length);
  assert(dLabel.mainText.startsWith('Ø100'), `直徑文字應以 Ø 開頭`);
  console.log('✓ 測試 5 通過: 半徑 (R) 與直徑 (Ø) 標註計算與文字格式正確');
}

// 測試 6: GroupEntity 內部圖元 (組件/爆炸圖) 的 OSNAP 鎖點
{
  const childLine: LineEntity = {
    id: 'child_line_1',
    type: 'line',
    layerId: '0',
    p1: { x: 200, y: 300 },
    p2: { x: 280, y: 300 },
  };
  const childArc: ArcEntity = {
    id: 'child_arc_1',
    type: 'arc',
    layerId: '0',
    center: { x: 300, y: 300 },
    radius: 20,
    startAngle: 0,
    endAngle: Math.PI,
  };
  const assemblyGroup: GroupEntity = {
    id: 'assembly_group_1',
    type: 'group',
    layerId: '0',
    children: [childLine, childArc],
  };

  // 游標靠近組件內線段的端點 (200, 300)
  const snap1 = findBestSnapPoint(
    { x: 201, y: 300.5 },
    [assemblyGroup],
    defaultLayers,
    defaultDraftingSettings,
    1.0
  );
  assert(snap1 !== null, `應成功鎖定 Group 內線段端點`);
  assert(snap1?.type === 'endpoint', `鎖點類型應為 endpoint`);
  assert(Math.abs(snap1?.point.x! - 200) < 1e-3 && Math.abs(snap1?.point.y! - 300) < 1e-3, `端點座標應為 (200, 300)`);

  // 游標靠近組件內圓弧的圓心 (300, 300)
  const snapCenter = findBestSnapPoint(
    { x: 301, y: 301 },
    [assemblyGroup],
    defaultLayers,
    defaultDraftingSettings,
    1.0
  );
  assert(snapCenter !== null, `應成功鎖定 Group 內圓弧圓心`);
  assert(snapCenter?.type === 'center', `鎖點類型應為 center`);
  assert(Math.abs(snapCenter?.point.x! - 300) < 1e-3, `圓心 X 座標應為 300`);

  console.log('✓ 測試 6 通過: GroupEntity (組件/爆炸圖) 內部圖元 OSNAP 鎖點正常');
}

// 測試 7: 多層巢狀 GroupEntity 的 OSNAP 鎖點
{
  const deepLine: LineEntity = {
    id: 'deep_line_1',
    type: 'line',
    layerId: '0',
    p1: { x: 500, y: 500 },
    p2: { x: 550, y: 500 },
  };
  const nestedGroup1: GroupEntity = {
    id: 'nested_1',
    type: 'group',
    layerId: '0',
    children: [deepLine],
  };
  const nestedGroup2: GroupEntity = {
    id: 'nested_2',
    type: 'group',
    layerId: '0',
    children: [nestedGroup1],
  };

  const snapDeep = findBestSnapPoint(
    { x: 550.5, y: 500.5 },
    [nestedGroup2],
    defaultLayers,
    defaultDraftingSettings,
    1.0
  );
  assert(snapDeep !== null, `多層巢狀 Group 內線段應成功鎖點`);
  assert(snapDeep?.type === 'endpoint', `鎖點類型應為 endpoint`);
  assert(Math.abs(snapDeep?.point.x! - 550) < 1e-3, `端點 X 應為 550`);
  console.log('✓ 測試 7 通過: 多層巢狀 GroupEntity 鎖點遞迴解析成功');
}

// 測試 8: 超過 60 個圖元的高密度圖面 (驗證無 60-item 截斷 bug)
{
  const highEntityCount: CadEntity[] = [];
  for (let i = 0; i < 90; i++) {
    highEntityCount.push({
      id: `filler_line_${i}`,
      type: 'line',
      layerId: '0',
      p1: { x: 0, y: i * 5 },
      p2: { x: 10, y: i * 5 },
    });
  }
  // 第 91 個圖元 (位於 index 90)
  const targetEntity: LineEntity = {
    id: 'target_late_entity',
    type: 'line',
    layerId: '0',
    p1: { x: 1000, y: 1000 },
    p2: { x: 1050, y: 1000 },
  };
  highEntityCount.push(targetEntity);

  const snapLate = findBestSnapPoint(
    { x: 1000.5, y: 1000.5 },
    highEntityCount,
    defaultLayers,
    defaultDraftingSettings,
    1.0
  );
  assert(snapLate !== null, `超過 60 個圖元時，後方的圖元 (index 90) 仍應被正常鎖定`);
  assert(Math.abs(snapLate?.point.x! - 1000) < 1e-3, `鎖點 X 座標應精確為 1000`);
  console.log('✓ 測試 8 通過: 超過 60 個圖元的高密度圖面無截斷 bug');
}

// 測試 9: 既有標註線自動吸附對齊 (snapDimensionOffsetToExisting)
{
  const existingHorizDim: DimensionEntity = {
    id: 'exist_dim_1',
    type: 'dimension',
    layerId: 'DIM',
    p1: { x: 0, y: 0 },
    p2: { x: 50, y: 0 },
    offsetPoint: { x: 25, y: 80 }, // 水平尺寸線高度在 Y=80
    dimMode: 'horizontal',
  };

  // 新標註靠近 Y=80 (例如 Y=82)
  const snapResult = snapDimensionOffsetToExisting(
    { x: 100, y: 0 },
    { x: 150, y: 0 },
    { x: 125, y: 82 },
    [existingHorizDim],
    1.0,
    undefined,
    'horizontal'
  );

  assert(Math.abs(snapResult.offsetPoint.y - 80) < 1e-4, `水平尺寸應自動吸附至既有標註線的高度 Y=80`);
  assert(snapResult.alignGuide !== null, `應產生對齊輔助導引線`);
  console.log('✓ 測試 9 通過: 水平與垂直尺寸線自動相互吸附對齊正常');
}

// 測試 10: 尺寸標註文字格式化 (精度與公差)
{
  // 精度 2, 無公差
  const f1 = formatDimensionLabel({
    p1: { x: 0, y: 0 },
    p2: { x: 50.126, y: 0 },
    precision: 2,
    toleranceMode: 'none',
  });
  assert(f1.mainText === '50.13', `精度 2 應四捨五入為 50.13，實際為 ${f1.mainText}`);

  // 對稱公差 ±0.05
  const f2 = formatDimensionLabel({
    p1: { x: 0, y: 0 },
    p2: { x: 100, y: 0 },
    precision: 1,
    toleranceMode: 'symmetric',
    toleranceUpper: 0.05,
  });
  assert(f2.symmetricText === '±0.05', `對稱公差文字應為 ±0.05`);
  assert(f2.fullText === '100.0 ±0.05', `完整文字應為 100.0 ±0.05`);

  // 偏差公差 +0.02 / -0.01
  const f3 = formatDimensionLabel({
    p1: { x: 0, y: 0 },
    p2: { x: 45, y: 0 },
    precision: 0,
    toleranceMode: 'deviation',
    toleranceUpper: 0.02,
    toleranceLower: -0.01,
  });
  assert(f3.upperText === '+0.02' && f3.lowerText === '-0.01', `偏差公差上下限應格式化正確`);
  console.log('✓ 測試 10 通過: 尺寸標註數值精度與公差格式化正確');
}

console.log('=== 全部 10 項尺寸標註與 OSNAP 測試均成功通過！ ===');
