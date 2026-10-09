import { BlueprintTemplate, CadEntity, CadLayer } from '../types/cad';

export const DEFAULT_LAYERS: CadLayer[] = [
  {
    id: '0',
    name: '0 (預設結構層)',
    color: '#F8FAFC',
    visible: true,
    locked: false,
    lineType: 'continuous',
    lineWeight: 0.35,
  },
  {
    id: 'WALL',
    name: 'A-WALL (建築主牆/輪廓)',
    color: '#38BDF8',
    visible: true,
    locked: false,
    lineType: 'continuous',
    lineWeight: 0.5,
  },
  {
    id: 'CENTER',
    name: 'M-CNTR (機械中心基準線)',
    color: '#F43F5E',
    visible: true,
    locked: false,
    lineType: 'center',
    lineWeight: 0.18,
  },
  {
    id: 'HIDDEN',
    name: 'M-HIDD (隱藏剖面虛線)',
    color: '#A855F7',
    visible: true,
    locked: false,
    lineType: 'dashed',
    lineWeight: 0.2,
  },
  {
    id: 'FURN',
    name: 'A-FURN (內裝設備與細部)',
    color: '#34D399',
    visible: true,
    locked: false,
    lineType: 'continuous',
    lineWeight: 0.25,
  },
  {
    id: 'DIM',
    name: 'G-ANNO-DIMS (尺寸標註)',
    color: '#FBBF24',
    visible: true,
    locked: false,
    lineType: 'continuous',
    lineWeight: 0.18,
  },
  {
    id: 'TEXT',
    name: 'G-ANNO-TEXT (工程文字與圖框)',
    color: '#94A3B8',
    visible: true,
    locked: false,
    lineType: 'continuous',
    lineWeight: 0.25,
  },
];

function createMechanicalFlangeEntities(): CadEntity[] {
  const entities: CadEntity[] = [];

  // Drawing Title Block Frame
  entities.push(
    {
      id: 'frame-outer',
      type: 'rectangle',
      layerId: 'TEXT',
      p1: { x: -320, y: -220 },
      p2: { x: 460, y: 240 },
    },
    {
      id: 'frame-inner',
      type: 'rectangle',
      layerId: 'TEXT',
      p1: { x: -310, y: -210 },
      p2: { x: 450, y: 230 },
    },
    // Title block lower right
    {
      id: 'tb-box',
      type: 'rectangle',
      layerId: 'TEXT',
      p1: { x: 170, y: -210 },
      p2: { x: 450, y: -145 },
    },
    {
      id: 'tb-div1',
      type: 'line',
      layerId: 'TEXT',
      p1: { x: 170, y: -178 },
      p2: { x: 450, y: -178 },
    },
    {
      id: 'tb-title',
      type: 'text',
      layerId: '0',
      position: { x: 182, y: -162 },
      content: 'DWG: CNC-FLG-240 高精度法蘭軸承座',
      fontSize: 10,
      rotation: 0,
    },
    {
      id: 'tb-sub',
      type: 'text',
      layerId: 'TEXT',
      position: { x: 182, y: -194 },
      content: 'SCALE: 1:1   UNIT: mm   MAT: SUS316L',
      fontSize: 8.5,
      rotation: 0,
    }
  );

  // LEFT VIEW: Front Elevation of Flange (Center at -110, 20)
  const cx = -110;
  const cy = 20;

  // Outer flange circle R=120 (Ø240)
  entities.push(
    {
      id: 'flg-outer',
      type: 'circle',
      layerId: '0',
      center: { x: cx, y: cy },
      radius: 120,
    },
    // Pitch circle R=90 (Ø180) on CENTER layer
    {
      id: 'flg-pitch',
      type: 'circle',
      layerId: 'CENTER',
      center: { x: cx, y: cy },
      radius: 90,
    },
    // Hub boss circle R=62 (Ø124)
    {
      id: 'flg-hub',
      type: 'circle',
      layerId: 'WALL',
      center: { x: cx, y: cy },
      radius: 62,
    },
    // Inner shaft bore R=35 (Ø70)
    {
      id: 'flg-bore',
      type: 'circle',
      layerId: '0',
      center: { x: cx, y: cy },
      radius: 35,
    },
    // Hexagonal recess polygon
    {
      id: 'flg-poly',
      type: 'polygon',
      layerId: 'FURN',
      center: { x: cx, y: cy },
      radius: 50,
      sides: 6,
      rotation: 0,
    },
    // Center crosshairs
    {
      id: 'flg-cx-h',
      type: 'line',
      layerId: 'CENTER',
      p1: { x: cx - 140, y: cy },
      p2: { x: cx + 140, y: cy },
    },
    {
      id: 'flg-cx-v',
      type: 'line',
      layerId: 'CENTER',
      p1: { x: cx, y: cy - 140 },
      p2: { x: cx, y: cy + 140 },
    }
  );

  // 6 Bolt Holes around Pitch Circle (R=90, hole R=10 -> Ø20)
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const bx = cx + 90 * Math.cos(angle);
    const by = cy + 90 * Math.sin(angle);
    entities.push({
      id: `bolt-hole-${i}`,
      type: 'circle',
      layerId: 'FURN',
      center: { x: Number(bx.toFixed(2)), y: Number(by.toFixed(2)) },
      radius: 11,
    });
  }

  // RIGHT VIEW: Side Cross-Section View (x from 140 to 250)
  const sx = 140;
  entities.push(
    // Flange main plate (width 30, height 240 -> y from cy-120 to cy+120)
    {
      id: 'sec-plate',
      type: 'rectangle',
      layerId: '0',
      p1: { x: sx, y: cy - 120 },
      p2: { x: sx + 32, y: cy + 120 },
    },
    // Hub extension (width 48, height 124 -> y from cy-62 to cy+62)
    {
      id: 'sec-hub',
      type: 'rectangle',
      layerId: 'WALL',
      p1: { x: sx + 32, y: cy - 62 },
      p2: { x: sx + 80, y: cy + 62 },
    },
    // Centerline through section
    {
      id: 'sec-center',
      type: 'line',
      layerId: 'CENTER',
      p1: { x: sx - 20, y: cy },
      p2: { x: sx + 100, y: cy },
    },
    // Hidden lines for inner bore Ø70 (y = cy ± 35)
    {
      id: 'sec-bore-top',
      type: 'line',
      layerId: 'HIDDEN',
      p1: { x: sx, y: cy + 35 },
      p2: { x: sx + 80, y: cy + 35 },
    },
    {
      id: 'sec-bore-bot',
      type: 'line',
      layerId: 'HIDDEN',
      p1: { x: sx, y: cy - 35 },
      p2: { x: sx + 80, y: cy - 35 },
    },
    // Hidden lines for top & bottom bolt holes (y = cy + 90 ± 11)
    {
      id: 'sec-bolt-t1',
      type: 'line',
      layerId: 'HIDDEN',
      p1: { x: sx, y: cy + 101 },
      p2: { x: sx + 32, y: cy + 101 },
    },
    {
      id: 'sec-bolt-t2',
      type: 'line',
      layerId: 'HIDDEN',
      p1: { x: sx, y: cy + 79 },
      p2: { x: sx + 32, y: cy + 79 },
    },
    {
      id: 'sec-bolt-b1',
      type: 'line',
      layerId: 'HIDDEN',
      p1: { x: sx, y: cy - 79 },
      p2: { x: sx + 32, y: cy - 79 },
    },
    {
      id: 'sec-bolt-b2',
      type: 'line',
      layerId: 'HIDDEN',
      p1: { x: sx, y: cy - 101 },
      p2: { x: sx + 32, y: cy - 101 },
    },
    // Dimensions
    {
      id: 'dim-outer-dia',
      type: 'dimension',
      layerId: 'DIM',
      p1: { x: cx - 120, y: cy + 120 },
      p2: { x: cx + 120, y: cy + 120 },
      offsetPoint: { x: cx, y: cy + 158 },
      textOverride: 'Ø240.0 ±0.05',
    },
    {
      id: 'dim-pitch-dia',
      type: 'dimension',
      layerId: 'DIM',
      p1: { x: cx - 90, y: cy - 120 },
      p2: { x: cx + 90, y: cy - 120 },
      offsetPoint: { x: cx, y: cy - 155 },
      textOverride: 'PCD Ø180.0 (6×Ø22)',
    },
    {
      id: 'dim-sec-width',
      type: 'dimension',
      layerId: 'DIM',
      p1: { x: sx, y: cy + 120 },
      p2: { x: sx + 80, y: cy + 120 },
      offsetPoint: { x: sx + 40, y: cy + 158 },
      textOverride: '80.0 mm',
    },
    {
      id: 'dim-sec-height',
      type: 'dimension',
      layerId: 'DIM',
      p1: { x: sx + 80, y: cy - 120 },
      p2: { x: sx + 80, y: cy + 120 },
      offsetPoint: { x: sx + 128, y: cy },
      textOverride: '240.0 mm',
    },
    // Labels
    {
      id: 'lbl-front',
      type: 'text',
      layerId: 'TEXT',
      position: { x: cx - 55, y: cy - 185 },
      content: '正視圖 FRONT ELEVATION',
      fontSize: 10,
      rotation: 0,
    },
    {
      id: 'lbl-side',
      type: 'text',
      layerId: 'TEXT',
      position: { x: sx - 10, y: cy - 185 },
      content: 'A-A 剖面視圖 SECTION',
      fontSize: 10,
      rotation: 0,
    }
  );

  return entities;
}

function createArchitecturalFloorPlanEntities(): CadEntity[] {
  return [
    // Exterior Perimeter Walls (400 x 260)
    {
      id: 'arch-ext-outer',
      type: 'rectangle',
      layerId: 'WALL',
      p1: { x: -200, y: -130 },
      p2: { x: 200, y: 130 },
    },
    {
      id: 'arch-ext-inner',
      type: 'rectangle',
      layerId: 'WALL',
      p1: { x: -190, y: -120 },
      p2: { x: 190, y: 120 },
    },
    // Interior Partition Wall (Vertical at x = 20)
    {
      id: 'arch-part-v1',
      type: 'line',
      layerId: 'WALL',
      p1: { x: 20, y: -120 },
      p2: { x: 20, y: -20 },
    },
    {
      id: 'arch-part-v2',
      type: 'line',
      layerId: 'WALL',
      p1: { x: 20, y: 30 },
      p2: { x: 20, y: 120 },
    },
    // Door Swing Arc at Partition Opening (x=20, y=-20 to 30, radius=50)
    {
      id: 'arch-door-leaf',
      type: 'line',
      layerId: 'FURN',
      p1: { x: 20, y: -20 },
      p2: { x: 70, y: -20 },
    },
    {
      id: 'arch-door-arc',
      type: 'arc',
      layerId: 'FURN',
      center: { x: 20, y: -20 },
      radius: 50,
      startAngle: 0,
      endAngle: Math.PI / 2,
    },
    // Conference / Living Table & Chairs (Left Room)
    {
      id: 'arch-table',
      type: 'rectangle',
      layerId: 'FURN',
      p1: { x: -135, y: -45 },
      p2: { x: -45, y: 45 },
    },
    {
      id: 'arch-table-center',
      type: 'circle',
      layerId: 'FURN',
      center: { x: -90, y: 0 },
      radius: 16,
    },
    // Workstation Desk in Right Room
    {
      id: 'arch-desk',
      type: 'rectangle',
      layerId: 'FURN',
      p1: { x: 110, y: 35 },
      p2: { x: 180, y: 110 },
    },
    // Grid Axis Lines
    {
      id: 'arch-grid-h',
      type: 'line',
      layerId: 'CENTER',
      p1: { x: -230, y: 0 },
      p2: { x: 230, y: 0 },
    },
    {
      id: 'arch-grid-v',
      type: 'line',
      layerId: 'CENTER',
      p1: { x: 20, y: -160 },
      p2: { x: 20, y: 160 },
    },
    // Dimensions
    {
      id: 'arch-dim-top',
      type: 'dimension',
      layerId: 'DIM',
      p1: { x: -200, y: 130 },
      p2: { x: 200, y: 130 },
      offsetPoint: { x: 0, y: 165 },
      textOverride: '4000 mm (總面寬)',
    },
    {
      id: 'arch-dim-left',
      type: 'dimension',
      layerId: 'DIM',
      p1: { x: -200, y: -130 },
      p2: { x: -200, y: 130 },
      offsetPoint: { x: -235, y: 0 },
      textOverride: '2600 mm',
    },
    {
      id: 'arch-dim-room1',
      type: 'dimension',
      layerId: 'DIM',
      p1: { x: -190, y: -130 },
      p2: { x: 20, y: -130 },
      offsetPoint: { x: -85, y: -165 },
      textOverride: '2100 mm',
    },
    {
      id: 'arch-dim-room2',
      type: 'dimension',
      layerId: 'DIM',
      p1: { x: 20, y: -130 },
      p2: { x: 190, y: -130 },
      offsetPoint: { x: 105, y: -165 },
      textOverride: '1700 mm',
    },
    // Room Text Annotations
    {
      id: 'arch-txt-1',
      type: 'text',
      layerId: 'TEXT',
      position: { x: -135, y: 85 },
      content: 'A-101 主會議與展示區 (21.4 m²)',
      fontSize: 10,
      rotation: 0,
    },
    {
      id: 'arch-txt-2',
      type: 'text',
      layerId: 'TEXT',
      position: { x: 45, y: -75 },
      content: 'A-102 工程研發室 (15.8 m²)',
      fontSize: 10,
      rotation: 0,
    },
  ];
}

function createBlankTitleBlockEntities(): CadEntity[] {
  return [
    {
      id: 'iso-outer',
      type: 'rectangle',
      layerId: 'TEXT',
      p1: { x: -210, y: -148.5 },
      p2: { x: 210, y: 148.5 },
    },
    {
      id: 'iso-inner',
      type: 'rectangle',
      layerId: '0',
      p1: { x: -200, y: -138.5 },
      p2: { x: 200, y: 138.5 },
    },
    {
      id: 'iso-tb',
      type: 'rectangle',
      layerId: 'TEXT',
      p1: { x: 60, y: -138.5 },
      p2: { x: 200, y: -95 },
    },
    {
      id: 'iso-txt',
      type: 'text',
      layerId: 'TEXT',
      position: { x: 70, y: -115 },
      content: 'ISO A3 標準工程圖框 (420×297mm)',
      fontSize: 8.5,
      rotation: 0,
    },
  ];
}

export const BLUEPRINT_TEMPLATES: BlueprintTemplate[] = [
  {
    id: 'mech-flange',
    name: 'CNC-FLG-240 精密法蘭軸承座',
    category: '機械製造工程圖',
    description: '含正視圖、A-A 剖面視圖、6 孔環形陣列、中心線與公差尺寸標註',
    entities: createMechanicalFlangeEntities(),
  },
  {
    id: 'arch-floorplan',
    name: 'A-101 研發中心建築平面配置圖',
    category: '建築與室內設計',
    description: '含雙層結構牆、門扇開啟弧線、家具配置、軸線與建築尺寸標註',
    entities: createArchitecturalFloorPlanEntities(),
  },
  {
    id: 'iso-blank',
    name: 'ISO A3 標準空白圖框 (420×297)',
    category: '標準空白圖紙',
    description: '具備標準外框與右下標題欄之乾淨畫布，適合從零開始繪製',
    entities: createBlankTitleBlockEntities(),
  },
];
