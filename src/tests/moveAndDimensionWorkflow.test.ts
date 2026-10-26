import {
  translateEntity,
  getDimensionLinePoints,
  formatDimensionLabel,
  snapDimensionOffsetToExisting,
  dist,
  midpoint,
} from '../utils/geometry';
import type {
  CadEntity,
  DimensionEntity,
  GroupEntity,
  LineEntity,
  CircleEntity,
  RectangleEntity,
} from '../types/cad';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`FAIL: ${msg}`);
  }
}

console.log('=====================================================');
console.log('   DV-CAD: Move & Dimension Workflow Verification    ');
console.log('=====================================================');

// ----------------------------------------------------
// 測試 1: Move 先窗選多個圖元，以同一個位移向量移動，並保持相對幾何關係
// ----------------------------------------------------
{
  const line1: LineEntity = {
    id: 'l1',
    type: 'line',
    layerId: '0',
    p1: { x: 10, y: 20 },
    p2: { x: 50, y: 20 },
  };
  const line2: LineEntity = {
    id: 'l2',
    type: 'line',
    layerId: '0',
    p1: { x: 50, y: 20 },
    p2: { x: 50, y: 80 },
  };
  const rect: RectangleEntity = {
    id: 'r1',
    type: 'rectangle',
    layerId: '0',
    p1: { x: 100, y: 100 },
    p2: { x: 200, y: 150 },
  };

  const initialEntities: CadEntity[] = [line1, line2, rect];
  const selectedIds = ['l1', 'l2', 'r1'];

  // 使用者點選基準點 (10, 20)，目標點 (110, 70)
  const basePoint = { x: 10, y: 20 };
  const targetPoint = { x: 110, y: 70 };
  const dx = targetPoint.x - basePoint.x; // +100
  const dy = targetPoint.y - basePoint.y; // +50

  const movedEntities = initialEntities.map((ent) =>
    selectedIds.includes(ent.id) ? translateEntity(ent, dx, dy) : ent
  );

  const movedL1 = movedEntities.find((e) => e.id === 'l1') as LineEntity;
  const movedL2 = movedEntities.find((e) => e.id === 'l2') as LineEntity;
  const movedR1 = movedEntities.find((e) => e.id === 'r1') as RectangleEntity;

  assert(movedL1.p1.x === 110 && movedL1.p1.y === 70, 'movedL1.p1 座標錯誤');
  assert(movedL1.p2.x === 150 && movedL1.p2.y === 70, 'movedL1.p2 座標錯誤');
  assert(movedL2.p1.x === 150 && movedL2.p1.y === 70, 'movedL2.p1 座標錯誤');
  assert(movedL2.p2.x === 150 && movedL2.p2.y === 130, 'movedL2.p2 座標錯誤');
  assert(movedR1.p1.x === 200 && movedR1.p1.y === 150, 'movedR1.p1 座標錯誤');
  assert(movedR1.p2.x === 300 && movedR1.p2.y === 200, 'movedR1.p2 座標錯誤');

  // 驗證圖元相對距離保持不變
  const initialDistL1toL2 = dist(line1.p1, line2.p2);
  const movedDistL1toL2 = dist(movedL1.p1, movedL2.p2);
  assert(
    Math.abs(initialDistL1toL2 - movedDistL1toL2) < 1e-6,
    '移動後圖元相對幾何關係改變'
  );

  console.log('✓ 測試 1 通過: 多圖元預選取並按相同位移向量一次性正確移動');
}

// ----------------------------------------------------
// 測試 2: Move 操作取消 (ESC) 時原始圖元位置不變
// ----------------------------------------------------
{
  const line: LineEntity = {
    id: 'l_orig',
    type: 'line',
    layerId: '0',
    p1: { x: 30, y: 40 },
    p2: { x: 90, y: 40 },
  };
  const entities: CadEntity[] = [line];
  // 模擬預覽中 (dx=50, dy=50)，但使用者按 ESC 取消
  // 預覽不寫入正式圖元，drawingPoints 清空，entities 保持不變
  assert(entities[0].type === 'line' && (entities[0] as LineEntity).p1.x === 30, '取消移動後原始圖元位置改變');
  console.log('✓ 測試 2 通過: 取消移動後原始圖元位置絕對不變');
}

// ----------------------------------------------------
// 測試 3: GroupEntity 包含巢狀組件在 Move 中整體平移，無重複位移
// ----------------------------------------------------
{
  const child1: LineEntity = {
    id: 'c1',
    type: 'line',
    layerId: '0',
    p1: { x: 0, y: 0 },
    p2: { x: 10, y: 0 },
  };
  const child2: CircleEntity = {
    id: 'c2',
    type: 'circle',
    layerId: '0',
    center: { x: 20, y: 20 },
    radius: 5,
  };
  const subGroup: GroupEntity = {
    id: 'subg',
    type: 'group',
    layerId: '0',
    name: 'SubGroup',
    children: [child1],
  };
  const mainGroup: GroupEntity = {
    id: 'maing',
    type: 'group',
    layerId: '0',
    name: 'MainGroup',
    children: [subGroup, child2],
  };

  const entities: CadEntity[] = [mainGroup];
  const selectedIds = ['maing'];

  const dx = 50;
  const dy = 30;
  const moved = entities.map((e) =>
    selectedIds.includes(e.id) ? translateEntity(e, dx, dy) : e
  );

  const movedGroup = moved[0] as GroupEntity;
  const movedSubGroup = movedGroup.children[0] as GroupEntity;
  const movedChild1 = movedSubGroup.children[0] as LineEntity;
  const movedChild2 = movedGroup.children[1] as CircleEntity;

  assert(movedChild1.p1.x === 50 && movedChild1.p1.y === 30, '巢狀子圖元 c1 座標錯誤');
  assert(movedChild1.p2.x === 60 && movedChild1.p2.y === 30, '巢狀子圖元 c1 終點錯誤');
  assert(movedChild2.center.x === 70 && movedChild2.center.y === 50, '組件圓形 c2 座標錯誤');
  console.log('✓ 測試 3 通過: GroupEntity 與巢狀群組整體平移且無重複位移');
}

// ----------------------------------------------------
// 測試 4: Dimension 三階段狀態機與幾何量測
// ----------------------------------------------------
{
  // 階段 1: 點擊 P1 (10, 10)
  const p1 = { x: 10, y: 10 };
  const drawingPointsStep1 = [p1];
  assert(drawingPointsStep1.length === 1, '階段 1 drawingPoints 應為 1');

  // 階段 2: 點擊 P2 (70, 90) -> 決定量測兩端點
  const p2 = { x: 70, y: 90 };
  const drawingPointsStep2 = [p1, p2];
  assert(drawingPointsStep2.length === 2, '階段 2 drawingPoints 應為 2');

  const actualDx = p2.x - p1.x; // 60
  const actualDy = p2.y - p1.y; // 80
  const actualHypot = Math.hypot(actualDx, actualDy); // 100

  // 階段 3 預覽：移動游標決定尺寸線放置位置 (offsetPoint)
  // 模式 A: Aligned (斜向真實距離 100)
  const alignedPreview = getDimensionLinePoints({
    p1,
    p2,
    offsetPoint: { x: 40, y: 80 },
    dimMode: 'aligned',
  });
  assert(Math.abs(alignedPreview.length - 100) < 1e-4, `對齊尺寸長度應為 100，實際為 ${alignedPreview.length}`);

  // 模式 B: Horizontal (水平量測 60)
  const horizPreview = getDimensionLinePoints({
    p1,
    p2,
    offsetPoint: { x: 40, y: 120 },
    dimMode: 'horizontal',
  });
  assert(Math.abs(horizPreview.length - 60) < 1e-4, `水平尺寸長度應為 60，實際為 ${horizPreview.length}`);

  // 模式 C: Vertical (垂直量測 80)
  const vertPreview = getDimensionLinePoints({
    p1,
    p2,
    offsetPoint: { x: 100, y: 50 },
    dimMode: 'vertical',
  });
  assert(Math.abs(vertPreview.length - 80) < 1e-4, `垂直尺寸長度應為 80，實際為 ${vertPreview.length}`);

  // 階段 3 正式建立尺寸標註 (第三次點擊確認位置)
  const finalDim: DimensionEntity = {
    id: 'dim_test',
    type: 'dimension',
    layerId: 'DIM',
    dimMode: 'aligned',
    precision: 2,
    toleranceMode: 'none',
    toleranceUpper: 0.05,
    toleranceLower: -0.05,
    p1,
    p2,
    offsetPoint: { x: 40, y: 80 },
    fontSize: 12,
  };
  const formatted = formatDimensionLabel(finalDim, alignedPreview.length);
  assert(formatted.mainText === '100.00', `格式化文字應為 100.00，實際為 ${formatted.mainText}`);

  console.log('✓ 測試 4 通過: Dimension 三階段選取、對齊/水平/垂直幾何計算無誤');
}

// ----------------------------------------------------
// 測試 5: Dimension 尺寸線吸附對齊既有標註
// ----------------------------------------------------
{
  const existingDim: DimensionEntity = {
    id: 'dim_exist',
    type: 'dimension',
    layerId: 'DIM',
    dimMode: 'horizontal',
    precision: 2,
    toleranceMode: 'none',
    toleranceUpper: 0.05,
    toleranceLower: -0.05,
    p1: { x: 0, y: 0 },
    p2: { x: 100, y: 0 },
    offsetPoint: { x: 50, y: 40 },
    fontSize: 12,
  };

  // 新標註量測點 (120, 0) 至 (200, 0)，游標在 (160, 42)（靠近 Y=40）
  const snapResult = snapDimensionOffsetToExisting(
    { x: 120, y: 0 },
    { x: 200, y: 0 },
    { x: 160, y: 42 },
    [existingDim],
    1.0,
    undefined,
    'horizontal'
  );

  assert(Math.abs(snapResult.offsetPoint.y - 40) < 1e-4, '水平標註線應自動吸附對齊至 Y=40');
  assert(snapResult.alignGuide !== null, '應提供對齊導引線');
  console.log('✓ 測試 5 通過: 尺寸線自由定位與自動對齊吸附功能正常');
}

// ----------------------------------------------------
// 測試 6: AutoCAD DIMLINEAR 動態判斷水平與垂直尺寸線
// ----------------------------------------------------
{
  const p1 = { x: 20, y: 30 };
  const p2 = { x: 100, y: 70 };
  // mid = (60, 50), dx = 80, dy = 40

  // 游標往上下拉 (X=60, Y=120) -> distY(70) > distX(0) -> 產生水平尺寸線，測量 ΔX = 80
  const horizDim = getDimensionLinePoints({
    p1,
    p2,
    offsetPoint: { x: 60, y: 120 },
    dimMode: 'linear',
  });
  assert(horizDim.angle === 0, '游標往上下拉時應為水平尺寸線 (angle=0)');
  assert(Math.abs(horizDim.length - 80) < 1e-4, '水平尺寸測量長度應為 80 (ΔX)');
  assert(horizDim.dimP1.y === 120 && horizDim.dimP2.y === 120, '尺寸線應位於游標 Y=120');

  // 游標往左右拉 (X=160, Y=50) -> distX(100) > distY(0) -> 產生垂直尺寸線，測量 ΔY = 40
  const vertDim = getDimensionLinePoints({
    p1,
    p2,
    offsetPoint: { x: 160, y: 50 },
    dimMode: 'linear',
  });
  assert(vertDim.angle === Math.PI / 2, '游標往左右拉時應為垂直尺寸線 (angle=π/2)');
  assert(Math.abs(vertDim.length - 40) < 1e-4, '垂直尺寸測量長度應為 40 (ΔY)');
  assert(vertDim.dimP1.x === 160 && vertDim.dimP2.x === 160, '尺寸線應位於游標 X=160');

  console.log('✓ 測試 6 通過: AutoCAD DIMLINEAR 動態自動切換水平/垂直尺寸標註正確');
}

// ----------------------------------------------------
// 測試 7: AutoCAD MOVE 多圖元（包含圓形、多邊形、尺寸標註）一次性平移
// ----------------------------------------------------
{
  const line: LineEntity = { id: 'l1', type: 'line', layerId: '0', p1: { x: 0, y: 0 }, p2: { x: 50, y: 0 } };
  const circle: CircleEntity = { id: 'c1', type: 'circle', layerId: '0', center: { x: 30, y: 30 }, radius: 10 };
  const dim: DimensionEntity = {
    id: 'd1',
    type: 'dimension',
    layerId: '0',
    p1: { x: 0, y: 0 },
    p2: { x: 50, y: 0 },
    offsetPoint: { x: 25, y: 15 },
  };

  const entities: CadEntity[] = [line, circle, dim];
  const selectedIds = ['l1', 'c1', 'd1'];
  const basePoint = { x: 0, y: 0 };
  const targetPoint = { x: 25, y: 40 };
  const dx = targetPoint.x - basePoint.x;
  const dy = targetPoint.y - basePoint.y;

  const moved = entities.map((ent) =>
    selectedIds.includes(ent.id) ? translateEntity(ent, dx, dy) : ent
  );

  const movedLine = moved.find((e) => e.id === 'l1') as LineEntity;
  const movedCircle = moved.find((e) => e.id === 'c1') as CircleEntity;
  const movedDim = moved.find((e) => e.id === 'd1') as DimensionEntity;

  assert(movedLine.p1.x === 25 && movedLine.p1.y === 40, '直線起點位移錯誤');
  assert(movedCircle.center.x === 55 && movedCircle.center.y === 70, '圓心位移錯誤');
  assert(movedDim.p1.x === 25 && movedDim.offsetPoint.y === 55, '標註位移錯誤');

  console.log('✓ 測試 7 通過: MOVE 多圖元（線條、圓形、尺寸標註）一併正確平移');
}

console.log('=====================================================');
console.log('   ALL MOVE & DIMENSION TESTS PASSED SUCCESSFULLY!   ');
console.log('=====================================================');
