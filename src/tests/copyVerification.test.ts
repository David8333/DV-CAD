import { CadEntity, GroupEntity, LineEntity, CircleEntity, Point } from '../types/cad';
import {
  translateEntity,
  cloneEntityWithDisplacement,
  reassignEntityUniqueIds,
  getSelectionReferencePoint,
  getEntityBounds,
} from '../utils/geometry';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${msg}`);
  }
}

function assertClose(a: number, b: number, eps = 1e-6, msg = '') {
  if (Math.abs(a - b) > eps) {
    throw new Error(`[ASSERTION FAILED]: expected ${b}, got ${a}. ${msg}`);
  }
}

console.log('=====================================================');
console.log('   DV-CAD Phase 1: CO Copy & Placement Verification  ');
console.log('=====================================================\n');

// -----------------------------------------------------------------
// Test 1: Single Line and Circle Copy
// -----------------------------------------------------------------
console.log('Test 1: Single Line and Circle Copy...');
{
  const line: LineEntity = {
    id: 'line_1',
    type: 'line',
    layerId: '0',
    p1: { x: 10, y: 20 },
    p2: { x: 50, y: 60 },
  };

  const circle: CircleEntity = {
    id: 'circle_1',
    type: 'circle',
    layerId: '0',
    center: { x: 100, y: 100 },
    radius: 25,
  };

  const base: Point = { x: 100, y: 100 };
  const target: Point = { x: 200, y: 150 };
  const dx = target.x - base.x; // 100
  const dy = target.y - base.y; // 50

  // 1. Preview calculation
  const previewLine = translateEntity(line, dx, dy) as LineEntity;
  const previewCircle = translateEntity(circle, dx, dy) as CircleEntity;

  // 2. Final write calculation
  const copiedLine = cloneEntityWithDisplacement(line, dx, dy, 0) as LineEntity;
  const copiedCircle = cloneEntityWithDisplacement(circle, dx, dy, 1) as CircleEntity;

  // Verify coordinates
  assertClose(copiedLine.p1.x, 110, 1e-6, 'Line p1.x');
  assertClose(copiedLine.p1.y, 70, 1e-6, 'Line p1.y');
  assertClose(copiedLine.p2.x, 150, 1e-6, 'Line p2.x');
  assertClose(copiedLine.p2.y, 110, 1e-6, 'Line p2.y');
  assertClose(copiedCircle.center.x, 200, 1e-6, 'Circle center.x');
  assertClose(copiedCircle.center.y, 150, 1e-6, 'Circle center.y');
  assertClose(copiedCircle.radius, 25, 1e-6, 'Circle radius');

  // Verify preview matches final coordinates exactly
  assertClose(previewLine.p1.x, copiedLine.p1.x, 1e-6, 'Preview line p1.x matches');
  assertClose(previewLine.p1.y, copiedLine.p1.y, 1e-6, 'Preview line p1.y matches');
  assertClose(previewCircle.center.x, copiedCircle.center.x, 1e-6, 'Preview circle center.x matches');
  assertClose(previewCircle.center.y, copiedCircle.center.y, 1e-6, 'Preview circle center.y matches');

  // Verify IDs are new and different from originals
  assert(copiedLine.id !== line.id, 'New line ID assigned');
  assert(copiedCircle.id !== circle.id, 'New circle ID assigned');

  // Verify original entities were not mutated
  assertClose(line.p1.x, 10, 1e-6, 'Original line immutable');
  assertClose(circle.center.x, 100, 1e-6, 'Original circle immutable');

  console.log('  -> PASS: Single entities translated by exactly (+100, +50), preview matches commit.');
}

// -----------------------------------------------------------------
// Test 2: Standard GroupEntity Copy (Verifying NO Double Translation)
// -----------------------------------------------------------------
console.log('\nTest 2: Standard GroupEntity Copy (Zero Double-Displacement)...');
{
  const childLine: LineEntity = {
    id: 'g_line_1',
    type: 'line',
    layerId: 'WALL',
    p1: { x: 90, y: 90 },
    p2: { x: 110, y: 110 },
  };
  const childCircle: CircleEntity = {
    id: 'g_circle_1',
    type: 'circle',
    layerId: 'WALL',
    center: { x: 100, y: 100 },
    radius: 10,
  };
  const group: GroupEntity = {
    id: 'group_root',
    type: 'group',
    layerId: 'WALL',
    children: [childLine, childCircle],
    name: '組件A',
  };

  const base: Point = { x: 100, y: 100 };
  const target: Point = { x: 200, y: 150 };
  const dx = target.x - base.x; // 100
  const dy = target.y - base.y; // 50

  // 1. Preview calculation (drawEntity uses translateEntity)
  const previewGroup = translateEntity(group, dx, dy) as GroupEntity;
  const prevLine = previewGroup.children[0] as LineEntity;
  const prevCircle = previewGroup.children[1] as CircleEntity;

  // 2. Commit calculation
  const copiedGroup = cloneEntityWithDisplacement(group, dx, dy, 0) as GroupEntity;
  const copiedLine = copiedGroup.children[0] as LineEntity;
  const copiedCircle = copiedGroup.children[1] as CircleEntity;

  // Crucial test: Child line must be (90+100, 90+50) = (190, 140)
  // If the old bug existed, it would have been (90+200, 90+100) = (290, 190)
  assertClose(copiedLine.p1.x, 190, 1e-6, 'Group child line p1.x');
  assertClose(copiedLine.p1.y, 140, 1e-6, 'Group child line p1.y');
  assertClose(copiedLine.p2.x, 210, 1e-6, 'Group child line p2.x');
  assertClose(copiedLine.p2.y, 160, 1e-6, 'Group child line p2.y');

  // Crucial test: Child circle must be (100+100, 100+50) = (200, 150)
  // If the old bug existed, it would have been (300, 200)
  assertClose(copiedCircle.center.x, 200, 1e-6, 'Group child circle center.x');
  assertClose(copiedCircle.center.y, 150, 1e-6, 'Group child circle center.y');

  // Verify preview and commit are 100% identical
  assertClose(prevLine.p1.x, copiedLine.p1.x, 1e-6, 'Preview matches commit p1.x');
  assertClose(prevLine.p1.y, copiedLine.p1.y, 1e-6, 'Preview matches commit p1.y');
  assertClose(prevCircle.center.x, copiedCircle.center.x, 1e-6, 'Preview matches commit circle.x');
  assertClose(prevCircle.center.y, copiedCircle.center.y, 1e-6, 'Preview matches commit circle.y');

  // Verify ID assignment
  assert(copiedGroup.id !== group.id, 'New group ID');
  assert(copiedLine.id !== childLine.id, 'New child line ID');
  assert(copiedCircle.id !== childCircle.id, 'New child circle ID');
  assert(copiedLine.id !== copiedCircle.id, 'Unique child IDs');

  console.log('  -> PASS: Group children shifted by (+100, +50) exactly once. No double-translation.');
}

// -----------------------------------------------------------------
// Test 3: Multi-level (3-level) Nested GroupEntity Copy
// -----------------------------------------------------------------
console.log('\nTest 3: 3-Level Deeply Nested GroupEntity Copy...');
{
  const leafLine: LineEntity = {
    id: 'leaf_line',
    type: 'line',
    layerId: '0',
    p1: { x: 0, y: 0 },
    p2: { x: 10, y: 10 },
  };
  const leafGroup: GroupEntity = {
    id: 'group_level_2',
    type: 'group',
    layerId: '0',
    children: [leafLine],
  };
  const midGroup: GroupEntity = {
    id: 'group_level_1',
    type: 'group',
    layerId: '0',
    children: [leafGroup],
  };
  const rootGroup: GroupEntity = {
    id: 'group_level_0',
    type: 'group',
    layerId: '0',
    children: [midGroup],
  };

  const dx = 100;
  const dy = 50;
  const copiedRoot = cloneEntityWithDisplacement(rootGroup, dx, dy, 0) as GroupEntity;
  const copiedMid = copiedRoot.children[0] as GroupEntity;
  const copiedLeafGroup = copiedMid.children[0] as GroupEntity;
  const copiedLeafLine = copiedLeafGroup.children[0] as LineEntity;

  // The leaf line must be shifted by (100, 50) ONLY ONCE, despite being nested 3 levels deep!
  assertClose(copiedLeafLine.p1.x, 100, 1e-6, 'Deep leaf line p1.x');
  assertClose(copiedLeafLine.p1.y, 50, 1e-6, 'Deep leaf line p1.y');
  assertClose(copiedLeafLine.p2.x, 110, 1e-6, 'Deep leaf line p2.x');
  assertClose(copiedLeafLine.p2.y, 60, 1e-6, 'Deep leaf line p2.y');

  // Verify all levels got unique IDs
  const idSet = new Set([
    copiedRoot.id,
    copiedMid.id,
    copiedLeafGroup.id,
    copiedLeafLine.id,
  ]);
  assert(idSet.size === 4, 'All 4 nested levels have unique IDs');

  console.log('  -> PASS: 3-level nested hierarchy shifted by (+100, +50) exactly once across all levels.');
}

// -----------------------------------------------------------------
// Test 4: Arbitrary (Non-Geometric Center) Base Point Specification
// -----------------------------------------------------------------
console.log('\nTest 4: Arbitrary Base Point Specification...');
{
  // A rectangle-like group from (100, 100) to (300, 300) -> geometric center is (200, 200)
  const lineBottom: LineEntity = {
    id: 'l_b',
    type: 'line',
    layerId: '0',
    p1: { x: 100, y: 100 },
    p2: { x: 300, y: 100 },
  };
  const lineTop: LineEntity = {
    id: 'l_t',
    type: 'line',
    layerId: '0',
    p1: { x: 100, y: 300 },
    p2: { x: 300, y: 300 },
  };
  const group: GroupEntity = {
    id: 'rect_group',
    type: 'group',
    layerId: '0',
    children: [lineBottom, lineTop],
  };

  // User explicitly selects the bottom-left corner (100, 100) as the base point
  const userBasePoint: Point = { x: 100, y: 100 };
  // User clicks target point at (500, 450)
  const targetPoint: Point = { x: 500, y: 450 };

  const dx = targetPoint.x - userBasePoint.x; // 400
  const dy = targetPoint.y - userBasePoint.y; // 350

  const copied = cloneEntityWithDisplacement(group, dx, dy, 0) as GroupEntity;
  const copiedBottom = copied.children[0] as LineEntity;

  // The bottom-left corner was at (100, 100), now should be at (100+400, 100+350) = (500, 450)
  assertClose(copiedBottom.p1.x, 500, 1e-6, 'Base point successfully moved to target point X');
  assertClose(copiedBottom.p1.y, 450, 1e-6, 'Base point successfully moved to target point Y');

  console.log('  -> PASS: Custom base point (100, 100) perfectly aligned with target (500, 450).');
}

// -----------------------------------------------------------------
// Test 5: Screen to World Coordinate Conversion with Zoom and Pan
// -----------------------------------------------------------------
console.log('\nTest 5: Screen/World Coordinate Inversion with Zoom and Pan...');
{
  const canvasSize = { width: 1440, height: 900 };
  const pan = { x: 120, y: -75 };
  const zoom = 3.5;

  const worldToScreen = (wx: number, wy: number): Point => ({
    x: canvasSize.width / 2 + pan.x + wx * zoom,
    y: canvasSize.height / 2 + pan.y - wy * zoom,
  });

  const screenToWorld = (sx: number, sy: number): Point => ({
    x: (sx - canvasSize.width / 2 - pan.x) / zoom,
    y: -(sy - canvasSize.height / 2 - pan.y) / zoom,
  });

  const testCoords: Point[] = [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
    { x: -245.5, y: 678.2 },
    { x: 1250, y: -940 },
  ];

  for (const w of testCoords) {
    const s = worldToScreen(w.x, w.y);
    const roundtrip = screenToWorld(s.x, s.y);
    assertClose(roundtrip.x, w.x, 1e-6, `Roundtrip X for (${w.x}, ${w.y})`);
    assertClose(roundtrip.y, w.y, 1e-6, `Roundtrip Y for (${w.x}, ${w.y})`);
  }

  // Verify that displacement in screen pixels scales linearly by zoom:
  // deltaWorld = deltaScreen / zoom
  const sBase = worldToScreen(100, 100);
  const sTarget = { x: sBase.x + 350, y: sBase.y - 175 }; // screen +350 px, -175 px (which is UP in world)
  const wTarget = screenToWorld(sTarget.x, sTarget.y);
  assertClose(wTarget.x - 100, 100, 1e-6, 'Delta World X = 350 / 3.5 = 100');
  assertClose(wTarget.y - 100, 50, 1e-6, 'Delta World Y = -(-175) / 3.5 = 50');

  console.log('  -> PASS: Screen/World bi-directional transformation is mathematically lossless.');
}

// -----------------------------------------------------------------
// Test 6: Cross-Tab & Continuous Copy Simulation
// -----------------------------------------------------------------
console.log('\nTest 6: Cross-Tab & Continuous Copy Simulation...');
{
  // Component in Tab 1
  const tab1Comp: GroupEntity = {
    id: 'tab1_comp',
    type: 'group',
    layerId: '0',
    children: [
      {
        id: 'tab1_line',
        type: 'line',
        layerId: '0',
        p1: { x: 500, y: 500 },
        p2: { x: 550, y: 550 },
      },
    ],
  };

  // Base point specified in Tab 1 (or reference point) = (500, 500)
  const basePoint: Point = { x: 500, y: 500 };

  // Switched to Tab 2. User places copy 1 at (100, 100)
  const target1: Point = { x: 100, y: 100 };
  const dx1 = target1.x - basePoint.x; // -400
  const dy1 = target1.y - basePoint.y; // -400

  const copy1 = cloneEntityWithDisplacement(tab1Comp, dx1, dy1, 0) as GroupEntity;
  const copy1Line = copy1.children[0] as LineEntity;
  assertClose(copy1Line.p1.x, 100, 1e-6, 'Copy 1 p1.x');
  assertClose(copy1Line.p1.y, 100, 1e-6, 'Copy 1 p1.y');

  // User continues in Tab 2, places copy 2 at (250, 300) without resetting basePoint
  const target2: Point = { x: 250, y: 300 };
  const dx2 = target2.x - basePoint.x; // -250
  const dy2 = target2.y - basePoint.y; // -200

  const copy2 = cloneEntityWithDisplacement(tab1Comp, dx2, dy2, 1) as GroupEntity;
  const copy2Line = copy2.children[0] as LineEntity;
  assertClose(copy2Line.p1.x, 250, 1e-6, 'Copy 2 p1.x');
  assertClose(copy2Line.p1.y, 300, 1e-6, 'Copy 2 p1.y');

  console.log('  -> PASS: Cross-tab & continuous copy instances placed with exact coordinates.');
}

// -----------------------------------------------------------------
// Test 7: Stress Testing ID Uniqueness Across 100 Iterations
// -----------------------------------------------------------------
console.log('\nTest 7: ID Uniqueness across 100 Copy Iterations...');
{
  const complexGroup: GroupEntity = {
    id: 'root',
    type: 'group',
    layerId: '0',
    children: [
      { id: 'c1', type: 'line', layerId: '0', p1: { x: 0, y: 0 }, p2: { x: 1, y: 1 } },
      {
        id: 'sub',
        type: 'group',
        layerId: '0',
        children: [
          { id: 'c2', type: 'circle', layerId: '0', center: { x: 0, y: 0 }, radius: 5 },
          { id: 'c3', type: 'arc', layerId: '0', center: { x: 0, y: 0 }, radius: 5, startAngle: 0, endAngle: 1 },
        ],
      },
    ],
  };

  const allGeneratedIds: string[] = [];

  function collectIds(ent: CadEntity) {
    allGeneratedIds.push(ent.id);
    if (ent.type === 'group') {
      for (const child of ent.children) {
        collectIds(child);
      }
    }
  }

  for (let i = 0; i < 100; i++) {
    const copy = cloneEntityWithDisplacement(complexGroup, i * 10, i * 10, i);
    collectIds(copy);
  }

  // 100 copies * 5 entities per copy (root, c1, sub, c2, c3) = 500 entities
  assert(allGeneratedIds.length === 500, 'Total entities generated: 500');
  const uniqueSet = new Set(allGeneratedIds);
  assert(uniqueSet.size === 500, `Unique IDs count: expected 500, got ${uniqueSet.size}`);

  console.log(`  -> PASS: Generated 500 entities across 100 iterations with 0 ID collisions.`);
}

console.log('\n=====================================================');
console.log('       ALL 7 CO COPY TESTS PASSED SUCCESSFULLY!       ');
console.log('=====================================================\n');
