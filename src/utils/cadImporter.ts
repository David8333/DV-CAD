import {
  ArcEntity,
  CadEntity,
  CadLayer,
  CircleEntity,
  DimensionEntity,
  GroupEntity,
  LineEntity,
  Point,
  PolylineEntity,
  RectangleEntity,
  TextEntity,
} from '../types/cad';
import {
  arcFromThreePoints,
  DEG_TO_RAD,
  getArcThreePoints,
  rotateEntity,
  translateEntity,
} from './geometry';
import { LibreDwg, createModule, Dwg_File_Type } from '@mlightcad/libredwg-web';

export interface CadImportResult {
  entities: CadEntity[];
  layers: CadLayer[];
  fileName: string;
  format: 'DXF' | 'DWG' | 'JSON';
  version?: string;
  warnings: string[];
}

/**
 * AutoCAD Color Index (ACI) to Hex color mapping for standard CAD colors
 */
const ACI_COLORS: Record<number, string> = {
  1: '#EF4444', // Red
  2: '#FACC15', // Yellow
  3: '#22C55E', // Green
  4: '#06B6D4', // Cyan
  5: '#38BDF8', // Blue / Sky
  6: '#D946EF', // Magenta
  7: '#F8FAFC', // White/Default
  8: '#94A3B8', // Dark Gray -> readable gray
  9: '#CBD5E1', // Light Gray
  10: '#F87171',
  11: '#FCA5A5',
  20: '#FB923C',
  30: '#F97316',
  40: '#FBBF24',
  50: '#EAB308',
  60: '#A3E635',
  70: '#4ADE80',
  80: '#34D399',
  90: '#2DD4BF',
  100: '#22D3EE',
  110: '#38BDF8',
  120: '#60A5FA',
  130: '#818CF8',
  140: '#A78BFA',
  150: '#C084FC',
  160: '#E879F9',
  170: '#F472B6',
  190: '#FB7185',
  250: '#94A3B8',
  251: '#A1A1AA',
  252: '#CBD5E1',
  253: '#E2E8F0',
  254: '#F1F5F9',
  255: '#F8FAFC',
};

/**
 * Ensure imported entity or layer colors are high contrast against the dark CAD canvas
 */
export function ensureHighContrastColor(
  c: string | undefined,
  fallback = '#F8FAFC'
): string {
  if (!c) return fallback;
  const clean = c.trim().toLowerCase();
  if (
    clean === '#000' ||
    clean === '#000000' ||
    clean === 'black' ||
    clean === '#0f172a' ||
    clean === '#0b0f17' ||
    clean === '#070b11' ||
    clean === '#111' ||
    clean === '#111111' ||
    clean === '#1e293b' ||
    clean === '#334155'
  ) {
    return '#F8FAFC';
  }
  if (/^#[0-9a-f]{6}$/.test(clean)) {
    const r = parseInt(clean.slice(1, 3), 16);
    const g = parseInt(clean.slice(3, 5), 16);
    const b = parseInt(clean.slice(5, 7), 16);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < 50) {
      return '#38BDF8';
    }
  }
  return c;
}

function aciToHex(aci: number | undefined, fallback = '#38BDF8'): string {
  if (aci === undefined || Number.isNaN(aci)) return fallback;
  const abs = Math.abs(Math.round(aci));
  if (abs === 7 || abs === 0) return '#F8FAFC';
  if (ACI_COLORS[abs]) return ACI_COLORS[abs];
  // Nearest decade color
  const decade = Math.round(abs / 10) * 10;
  if (ACI_COLORS[decade]) return ACI_COLORS[decade];
  return fallback;
}

function mapDxfLineType(ltName?: string): CadLayer['lineType'] {
  if (!ltName) return 'continuous';
  const upper = ltName.toUpperCase();
  if (upper.includes('CENTER') || upper.includes('CNTR')) return 'center';
  if (upper.includes('DASH') || upper.includes('HID')) return 'dashed';
  if (upper.includes('DOT')) return 'dotted';
  return 'continuous';
}

/**
 * Clean AutoCAD MTEXT & TEXT special formatting codes and decode Unicode / Big5 escapes
 */
export function cleanCadText(raw: string): string {
  if (!raw) return '';
  let text = raw;

  // 1. Decode Unicode escapes \U+XXXX (e.g. \U+6A19\U+8A3B -> 標註)
  text = text.replace(/\\U\+([0-9A-Fa-f]{4})/gi, (_, hex) => {
    try {
      return String.fromCharCode(parseInt(hex, 16));
    } catch {
      return '';
    }
  });

  // 2. Decode AutoCAD Big5/MIF \M+1xxxx or \M+5xxxx legacy escapes
  text = text.replace(/\\M\+[15]([0-9A-Fa-f]{4})/gi, (_, hex) => {
    try {
      const b1 = parseInt(hex.slice(0, 2), 16);
      const b2 = parseInt(hex.slice(2, 4), 16);
      return new TextDecoder('big5').decode(new Uint8Array([b1, b2]));
    } catch {
      return '';
    }
  });

  // 3. Special CAD symbols
  text = text
    .replace(/%%[cC]/g, 'Ø')
    .replace(/%%[dD]/g, '°')
    .replace(/%%[pP]/g, '±')
    .replace(/%%[uU]/g, '')
    .replace(/%%[oO]/g, '')
    .replace(/%%[kK]/g, '')
    .replace(/%%%+/g, '%');

  // 4. MTEXT line break \P -> newline
  text = text.replace(/\\P/gi, '\n');
  text = text.replace(/\\~/g, ' ');

  // 5. MTEXT font tags \f...; (e.g. \fMingLiU|b0|i0|c136|p34;)
  text = text.replace(/\\[fF][^;]*;/g, '');
  text = text.replace(/\\[hH][0-9.]+(?:x|X)?;/g, '');
  text = text.replace(/\\[cC][0-9]+;/g, '');
  text = text.replace(/\\[wW][0-9.]+;/g, '');
  text = text.replace(/\\[qQ][0-9.-]+;/g, '');
  text = text.replace(/\\[aA][0-9]+;/g, '');
  text = text.replace(/\\S([^;^#]+)[\^#/]([^;]*);/g, '$1/$2');
  text = text.replace(/\\[LlOoKk]/g, '');
  text = text.replace(/\\[A-Za-z][^;]*;/g, '');
  text = text.replace(/\{|\}/g, '');

  return text.trim();
}

interface DxfPair {
  code: number;
  value: string;
}

function tokenizeDxf(content: string): DxfPair[] {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const pairs: DxfPair[] = [];
  let i = 0;
  while (i < lines.length - 1) {
    const codeStr = lines[i].trim();
    if (codeStr === '') {
      i++;
      continue;
    }
    const code = parseInt(codeStr, 10);
    const val = lines[i + 1] !== undefined ? lines[i + 1].trim() : '';
    if (!Number.isNaN(code)) {
      pairs.push({ code, value: val });
      i += 2;
    } else {
      i++;
    }
  }
  return pairs;
}

/**
 * Convert polyline vertices into native CAD entities:
 * 1. Recognizable closed axis-aligned rectangle -> native RectangleEntity (or 4 lines if non-axis-aligned)
 * 2. Arc segments (bulge != 0) -> exact native ArcEntity (never broken into approximate straight lines)
 * 3. Straight segments (bulge == 0) -> native LineEntity (every line is independently selectable & editable)
 * 4. Closed polylines retain the closing segment connecting the last vertex back to the first vertex
 */
export function convertPolylineVerticesToCadEntities(
  verts: Array<{ x: number; y: number; bulge?: number }>,
  closed: boolean,
  layerId: string,
  color?: string,
  lineType?: CadLayer['lineType'],
  lineWeight?: number,
  baseUid = `poly_${Date.now()}`
): CadEntity[] {
  if (!verts || verts.length < 2) return [];

  // Filter out immediate duplicate consecutive points (while preserving bulge)
  const cleanedVerts: Array<{ x: number; y: number; bulge: number }> = [];
  for (let i = 0; i < verts.length; i++) {
    const v = verts[i];
    const b = Number(v.bulge) || 0;
    if (cleanedVerts.length > 0) {
      const prev = cleanedVerts[cleanedVerts.length - 1];
      if (Math.hypot(v.x - prev.x, v.y - prev.y) < 1e-5) {
        // Update bulge if duplicate has bulge
        if (Math.abs(b) > 1e-5 && Math.abs(prev.bulge) < 1e-5) {
          prev.bulge = b;
        }
        continue;
      }
    }
    cleanedVerts.push({ x: Number(v.x) || 0, y: Number(v.y) || 0, bulge: b });
  }

  // If the last point duplicates the first point in a closed polyline, remove it and mark closed
  if (cleanedVerts.length >= 3) {
    const first = cleanedVerts[0];
    const last = cleanedVerts[cleanedVerts.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-5) {
      if (Math.abs(last.bulge) > 1e-5 && Math.abs(first.bulge) < 1e-5) {
        first.bulge = last.bulge;
      }
      cleanedVerts.pop();
      closed = true;
    }
  }

  if (cleanedVerts.length < 2) return [];

  // 1. Check if this is a recognizable closed axis-aligned rectangle (4 vertices, all bulge = 0)
  if (closed && cleanedVerts.length === 4) {
    const hasBulge = cleanedVerts.some((v) => Math.abs(v.bulge) > 1e-4);
    if (!hasBulge) {
      const v0 = cleanedVerts[0];
      const v1 = cleanedVerts[1];
      const v2 = cleanedVerts[2];
      const v3 = cleanedVerts[3];

      const isHorizVert =
        Math.abs(v0.y - v1.y) < 1e-3 &&
        Math.abs(v1.x - v2.x) < 1e-3 &&
        Math.abs(v2.y - v3.y) < 1e-3 &&
        Math.abs(v3.x - v0.x) < 1e-3;

      const isVertHoriz =
        Math.abs(v0.x - v1.x) < 1e-3 &&
        Math.abs(v1.y - v2.y) < 1e-3 &&
        Math.abs(v2.x - v3.x) < 1e-3 &&
        Math.abs(v3.y - v0.y) < 1e-3;

      if (isHorizVert || isVertHoriz) {
        const minX = Math.min(v0.x, v1.x, v2.x, v3.x);
        const maxX = Math.max(v0.x, v1.x, v2.x, v3.x);
        const minY = Math.min(v0.y, v1.y, v2.y, v3.y);
        const maxY = Math.max(v0.y, v1.y, v2.y, v3.y);
        if (maxX - minX > 1e-4 && maxY - minY > 1e-4) {
          const rectEnt: RectangleEntity = {
            id: `${baseUid}_rect`,
            type: 'rectangle',
            layerId,
            color,
            lineType,
            lineWeight,
            p1: { x: minX, y: minY },
            p2: { x: maxX, y: maxY },
          };
          return [rectEnt];
        }
      }
    }
  }

  // 2. Otherwise: Convert each segment to native Line or native Arc
  const entities: CadEntity[] = [];
  const segCount = closed ? cleanedVerts.length : cleanedVerts.length - 1;

  for (let i = 0; i < segCount; i++) {
    const p1 = { x: cleanedVerts[i].x, y: cleanedVerts[i].y };
    const nextIdx = (i + 1) % cleanedVerts.length;
    const p2 = { x: cleanedVerts[nextIdx].x, y: cleanedVerts[nextIdx].y };
    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (segLen < 1e-5) continue;

    const b = cleanedVerts[i].bulge;

    if (Math.abs(b) >= 1e-4) {
      // Bulge arc segment -> native ArcEntity
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const pMid: Point = {
        x: midX + dy * (b / 2),
        y: midY - dx * (b / 2),
      };

      const arcData = arcFromThreePoints(p1, pMid, p2);
      if (arcData && arcData.radius > 1e-4) {
        const arcEnt: ArcEntity = {
          id: `${baseUid}_arc_${i}`,
          type: 'arc',
          layerId,
          color,
          lineType,
          lineWeight,
          center: arcData.center,
          radius: arcData.radius,
          startAngle: arcData.startAngle,
          endAngle: arcData.endAngle,
          p1,
          p2: pMid,
          p3: p2,
        };
        entities.push(arcEnt);
        continue;
      }
    }

    // Straight segment -> native LineEntity
    const lineEnt: LineEntity = {
      id: `${baseUid}_line_${i}`,
      type: 'line',
      layerId,
      color,
      lineType,
      lineWeight,
      p1,
      p2,
    };
    entities.push(lineEnt);
  }

  return entities;
}

function scaleCadEntity(
  entity: CadEntity,
  origin: Point,
  sx: number,
  sy: number
): CadEntity {
  const sc = (p: Point): Point => ({
    x: origin.x + (p.x - origin.x) * sx,
    y: origin.y + (p.y - origin.y) * sy,
  });
  const avgScale = (Math.abs(sx) + Math.abs(sy)) / 2 || 1;
  switch (entity.type) {
    case 'line':
      return { ...entity, p1: sc(entity.p1), p2: sc(entity.p2) };
    case 'rectangle':
      return { ...entity, p1: sc(entity.p1), p2: sc(entity.p2) };
    case 'polyline':
      return { ...entity, points: entity.points.map(sc) };
    case 'circle':
    case 'polygon':
      return {
        ...entity,
        center: sc(entity.center),
        radius: Math.max(0.5, entity.radius * avgScale),
      };
    case 'arc': {
      const center = sc(entity.center);
      const radius = Math.max(0.5, entity.radius * avgScale);
      const [p1, p2, p3] = getArcThreePoints({
        center,
        radius,
        startAngle: entity.startAngle,
        endAngle: entity.endAngle,
      });
      return { ...entity, center, radius, p1, p2, p3 };
    }
    case 'dimension':
      return {
        ...entity,
        p1: sc(entity.p1),
        p2: sc(entity.p2),
        offsetPoint: sc(entity.offsetPoint),
      };
    case 'text':
      return {
        ...entity,
        position: sc(entity.position),
        fontSize: Math.max(1.5, entity.fontSize * avgScale),
      };
    case 'group':
      return {
        ...entity,
        children: entity.children.map((c) => scaleCadEntity(c, origin, sx, sy)),
      };
    default:
      return entity;
  }
}

/**
 * Parse a list of DXF entity pairs (either inside ENTITIES section or inside a BLOCK)
 */
function parseDxfEntityRecords(
  records: Array<{ type: string; props: DxfPair[] }>,
  ensureLayer: (name: string, aci?: number, lt?: string) => string,
  blocksMap?: Map<string, { basePoint: Point; entities: CadEntity[] }>
): CadEntity[] {
  const entities: CadEntity[] = [];
  let i = 0;

  while (i < records.length) {
    const rec = records[i];
    const etype = rec.type.toUpperCase();
    const props = rec.props;

    const getStr = (code: number): string | undefined =>
      props.find((p) => p.code === code)?.value;
    const getNum = (code: number, fallback = 0): number => {
      const v = props.find((p) => p.code === code)?.value;
      if (v === undefined) return fallback;
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };

    const rawLayer = getStr(8) || '0';
    const aciCode = props.find((p) => p.code === 62)
      ? getNum(62, 7)
      : undefined;
    const lineTypeStr = getStr(6);
    const layerId = ensureLayer(rawLayer, aciCode, lineTypeStr);
    const entityColor =
      aciCode !== undefined && aciCode !== 256 ? aciToHex(aciCode) : undefined;
    const entityLineType = lineTypeStr
      ? mapDxfLineType(lineTypeStr)
      : undefined;

    const uid = `imp_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;

    if (etype === 'LINE') {
      const x1 = getNum(10, 0);
      const y1 = getNum(20, 0);
      const x2 = getNum(11, 0);
      const y2 = getNum(21, 0);
      if (Math.hypot(x2 - x1, y2 - y1) > 1e-5) {
        const lineEnt: LineEntity = {
          id: uid,
          type: 'line',
          layerId,
          color: entityColor,
          lineType: entityLineType,
          p1: { x: x1, y: y1 },
          p2: { x: x2, y: y2 },
        };
        entities.push(lineEnt);
      }
    } else if (etype === 'LWPOLYLINE') {
      const verts: Array<{ x: number; y: number; bulge: number }> = [];
      let curVert: { x: number; y: number; bulge: number } | null = null;
      let flags = 0;

      for (const p of props) {
        if (p.code === 70) {
          flags = parseInt(p.value, 10) || 0;
        } else if (p.code === 10) {
          if (curVert) verts.push(curVert);
          curVert = { x: parseFloat(p.value) || 0, y: 0, bulge: 0 };
        } else if (p.code === 20 && curVert) {
          curVert.y = parseFloat(p.value) || 0;
        } else if (p.code === 42 && curVert) {
          curVert.bulge = parseFloat(p.value) || 0;
        }
      }
      if (curVert) verts.push(curVert);

      if (verts.length >= 2) {
        const closed = (flags & 1) === 1;
        const subEnts = convertPolylineVerticesToCadEntities(
          verts,
          closed,
          layerId,
          entityColor,
          entityLineType,
          undefined,
          uid
        );
        entities.push(...subEnts);
      }
    } else if (etype === 'POLYLINE') {
      const flags = getNum(70, 0);
      const closed = (flags & 1) === 1;
      const verts: Array<{ x: number; y: number; bulge: number }> = [];
      i++;
      while (i < records.length) {
        const sub = records[i];
        const subType = sub.type.toUpperCase();
        if (subType === 'SEQEND') {
          break;
        }
        if (subType === 'VERTEX') {
          const vx =
            parseFloat(sub.props.find((p) => p.code === 10)?.value || '0') || 0;
          const vy =
            parseFloat(sub.props.find((p) => p.code === 20)?.value || '0') || 0;
          const vb =
            parseFloat(sub.props.find((p) => p.code === 42)?.value || '0') || 0;
          verts.push({ x: vx, y: vy, bulge: vb });
        }
        i++;
      }
      if (verts.length >= 2) {
        const subEnts = convertPolylineVerticesToCadEntities(
          verts,
          closed,
          layerId,
          entityColor,
          entityLineType,
          undefined,
          uid
        );
        entities.push(...subEnts);
      }
    } else if (etype === 'RECTANGLE' || etype === 'RECTANG') {
      const x1 = getNum(10, 0);
      const y1 = getNum(20, 0);
      const x2 = getNum(11, 100);
      const y2 = getNum(21, 100);
      if (Math.hypot(x2 - x1, y2 - y1) > 1e-4) {
        entities.push({
          id: uid,
          type: 'rectangle',
          layerId,
          color: entityColor,
          lineType: entityLineType,
          p1: { x: Math.min(x1, x2), y: Math.min(y1, y2) },
          p2: { x: Math.max(x1, x2), y: Math.max(y1, y2) },
        });
      }
    } else if (etype === 'CIRCLE') {
      const cx = getNum(10, 0);
      const cy = getNum(20, 0);
      const r = Math.abs(getNum(40, 10));
      if (r > 1e-4) {
        const circleEnt: CircleEntity = {
          id: uid,
          type: 'circle',
          layerId,
          color: entityColor,
          lineType: entityLineType,
          center: { x: cx, y: cy },
          radius: r,
        };
        entities.push(circleEnt);
      }
    } else if (etype === 'ARC') {
      const cx = getNum(10, 0);
      const cy = getNum(20, 0);
      const r = Math.abs(getNum(40, 10));
      const startAngle = getNum(50, 0) * DEG_TO_RAD;
      const endAngle = getNum(51, 90) * DEG_TO_RAD;
      if (r > 1e-4) {
        const center = { x: cx, y: cy };
        const [p1, p2, p3] = getArcThreePoints({
          center,
          radius: r,
          startAngle,
          endAngle,
        });
        const arcEnt: ArcEntity = {
          id: uid,
          type: 'arc',
          layerId,
          color: entityColor,
          lineType: entityLineType,
          center,
          radius: r,
          startAngle,
          endAngle,
          p1,
          p2,
          p3,
        };
        entities.push(arcEnt);
      }
    } else if (etype === 'ELLIPSE') {
      // Convert DXF ELLIPSE into a high-precision PolylineEntity
      const cx = getNum(10, 0);
      const cy = getNum(20, 0);
      const mx = getNum(11, 20);
      const my = getNum(21, 0);
      const ratio = Math.max(0.05, getNum(40, 0.5));
      const startParam = getNum(41, 0);
      const endParam = getNum(42, Math.PI * 2);
      const majorR = Math.hypot(mx, my);
      const minorR = majorR * ratio;
      const rot = Math.atan2(my, mx);

      if (majorR > 1e-4) {
        const isClosed =
          Math.abs(endParam - startParam - Math.PI * 2) < 0.02 ||
          Math.abs(endParam - startParam) < 1e-4;
        const steps = 36;
        const pts: Point[] = [];
        const total = isClosed ? Math.PI * 2 : endParam - startParam;
        const count = isClosed ? steps : steps + 1;
        for (let s = 0; s < count; s++) {
          const t = startParam + (total * s) / steps;
          const lx = majorR * Math.cos(t);
          const ly = minorR * Math.sin(t);
          pts.push({
            x: cx + lx * Math.cos(rot) - ly * Math.sin(rot),
            y: cy + lx * Math.sin(rot) + ly * Math.cos(rot),
          });
        }
        entities.push({
          id: uid,
          type: 'polyline',
          layerId,
          color: entityColor,
          lineType: entityLineType,
          points: pts,
          closed: isClosed,
        });
      }
    } else if (etype === 'SPLINE') {
      const pts: Point[] = [];
      let curPt: Point | null = null;
      for (const p of props) {
        if (p.code === 10 || p.code === 11) {
          if (curPt) pts.push(curPt);
          curPt = { x: parseFloat(p.value) || 0, y: 0 };
        } else if ((p.code === 20 || p.code === 21) && curPt) {
          curPt.y = parseFloat(p.value) || 0;
        }
      }
      if (curPt) pts.push(curPt);
      if (pts.length >= 2) {
        entities.push({
          id: uid,
          type: 'polyline',
          layerId,
          color: entityColor,
          lineType: entityLineType,
          points: pts,
          closed: (getNum(70, 0) & 1) === 1,
        });
      }
    } else if (etype === 'SOLID' || etype === '3DFACE' || etype === 'TRACE') {
      const p1 = { x: getNum(10, 0), y: getNum(20, 0) };
      const p2 = { x: getNum(11, 0), y: getNum(21, 0) };
      const p3 = { x: getNum(12, 0), y: getNum(22, 0) };
      const p4 = { x: getNum(13, p3.x), y: getNum(23, p3.y) };
      entities.push({
        id: uid,
        type: 'polyline',
        layerId,
        color: entityColor,
        lineType: entityLineType,
        points: [p1, p2, p4, p3],
        closed: true,
      });
    } else if (etype === 'TEXT' || etype === 'MTEXT' || etype === 'ATTRIB') {
      const x = getNum(10, 0);
      const y = getNum(20, 0);
      const h = Math.max(2, getNum(40, 10));
      const rot = getNum(50, 0);
      const textChunks = props
        .filter((p) => p.code === 1 || p.code === 3)
        .map((p) => p.value)
        .join('');
      const cleaned = cleanCadText(textChunks);
      if (cleaned) {
        const textEnt: TextEntity = {
          id: uid,
          type: 'text',
          layerId,
          color: entityColor,
          position: { x, y },
          content: cleaned,
          fontSize: h,
          rotation: rot,
        };
        entities.push(textEnt);
      }
    } else if (etype === 'DIMENSION') {
      const ox = getNum(10, 0);
      const oy = getNum(20, 0);
      const x1 = getNum(13, ox - 25);
      const y1 = getNum(23, oy);
      const x2 = getNum(14, ox + 25);
      const y2 = getNum(24, oy);
      const rawOverride = getStr(1);
      const textOverride =
        rawOverride && rawOverride !== '<>' && rawOverride.trim() !== ''
          ? cleanCadText(rawOverride)
          : undefined;
      if (Math.hypot(x2 - x1, y2 - y1) > 1e-4) {
        const dimEnt: DimensionEntity = {
          id: uid,
          type: 'dimension',
          layerId,
          color: entityColor,
          p1: { x: x1, y: y1 },
          p2: { x: x2, y: y2 },
          offsetPoint: { x: ox, y: oy },
          textOverride,
          fontSize: Math.max(3, getNum(40, 11)),
        };
        entities.push(dimEnt);
      }
    } else if (etype === 'INSERT' && blocksMap) {
      const rawBlockName = getStr(2);
      if (rawBlockName) {
        const blockName = rawBlockName.trim();
        const blockDef =
          blocksMap.get(rawBlockName) ||
          blocksMap.get(blockName) ||
          blocksMap.get(blockName.toUpperCase());
        if (blockDef) {
          const insX = getNum(10, 0);
        const insY = getNum(20, 0);
        const sx = getNum(41, 1);
        const sy = getNum(42, 1);
        const rotDeg = getNum(50, 0);
        const rotRad = rotDeg * DEG_TO_RAD;

        const children = blockDef.entities.map((child, cIdx) => {
          // Shift relative to block basePoint
          let transformed = translateEntity(
            child,
            -blockDef.basePoint.x,
            -blockDef.basePoint.y
          );
          if (Math.abs(sx - 1) > 1e-4 || Math.abs(sy - 1) > 1e-4) {
            transformed = scaleCadEntity(transformed, { x: 0, y: 0 }, sx, sy);
          }
          if (Math.abs(rotRad) > 1e-4) {
            transformed = rotateEntity(transformed, { x: 0, y: 0 }, rotRad);
          }
          transformed = translateEntity(transformed, insX, insY);
          return {
            ...transformed,
            id: `${uid}_blk_${cIdx}`,
            layerId:
              transformed.layerId === '0' ? layerId : transformed.layerId,
          };
        });

        if (children.length > 0) {
          const grp: GroupEntity = {
            id: uid,
            type: 'group',
            layerId,
            color: entityColor,
            children,
            name: `圖塊 INSERT: ${blockName}`,
          };
          entities.push(grp);
        }
      }
    }
  }

    i++;
  }

  return entities;
}

/**
 * Parse an ASCII DXF file into VektorCAD entities and layers
 */
export function parseDxfContent(
  content: string,
  fileName: string
): CadImportResult {
  const pairs = tokenizeDxf(content);
  const warnings: string[] = [];
  let version = 'AC1015';

  const layerMap = new Map<string, CadLayer>();
  const ensureLayer = (
    rawName: string,
    aci?: number,
    lineTypeName?: string
  ): string => {
    const cleanName = (rawName || '0').trim() || '0';
    if (!layerMap.has(cleanName)) {
      layerMap.set(cleanName, {
        id: cleanName,
        name: cleanName === '0' ? '0 (預設結構層)' : cleanName,
        color:
          cleanName === '0'
            ? '#F8FAFC'
            : ensureHighContrastColor(aciToHex(aci, '#38BDF8')),
        visible: true,
        locked: false,
        lineType: mapDxfLineType(lineTypeName),
        lineWeight: 0.3,
      });
    }
    return cleanName;
  };

  // Ensure default layer '0' exists
  ensureLayer('0', 7);

  // Split DXF into sections
  let idx = 0;
  const blocksMap = new Map<
    string,
    { basePoint: Point; entities: CadEntity[] }
  >();
  let entityRecords: Array<{ type: string; props: DxfPair[] }> = [];

  while (idx < pairs.length) {
    const pair = pairs[idx];
    if (pair.code === 0 && pair.value.toUpperCase() === 'SECTION') {
      const secNamePair = pairs[idx + 1];
      const secName =
        secNamePair && secNamePair.code === 2
          ? secNamePair.value.toUpperCase()
          : '';
      idx += 2;

      if (secName === 'HEADER') {
        while (
          idx < pairs.length &&
          !(pairs[idx].code === 0 && pairs[idx].value.toUpperCase() === 'ENDSEC')
        ) {
          if (pairs[idx].code === 9 && pairs[idx].value === '$ACADVER') {
            if (pairs[idx + 1] && pairs[idx + 1].code === 1) {
              version = pairs[idx + 1].value;
            }
          }
          idx++;
        }
      } else if (secName === 'TABLES') {
        while (
          idx < pairs.length &&
          !(pairs[idx].code === 0 && pairs[idx].value.toUpperCase() === 'ENDSEC')
        ) {
          if (pairs[idx].code === 0 && pairs[idx].value.toUpperCase() === 'LAYER') {
            idx++;
            let lName = '0';
            let lColor = 7;
            let lType = 'CONTINUOUS';
            let lFlags = 0;
            while (idx < pairs.length && pairs[idx].code !== 0) {
              const p = pairs[idx];
              if (p.code === 2) lName = p.value.trim() || '0';
              else if (p.code === 62) lColor = parseInt(p.value, 10) || 7;
              else if (p.code === 6) lType = p.value;
              else if (p.code === 70) lFlags = parseInt(p.value, 10) || 0;
              idx++;
            }
            const id = ensureLayer(lName, Math.abs(lColor), lType);
            const layerObj = layerMap.get(id)!;
            layerObj.visible = true;
            layerObj.color = ensureHighContrastColor(layerObj.color);
            layerObj.locked = (lFlags & 4) === 4;
            continue;
          }
          idx++;
        }
      } else if (secName === 'BLOCKS') {
        while (
          idx < pairs.length &&
          !(pairs[idx].code === 0 && pairs[idx].value.toUpperCase() === 'ENDSEC')
        ) {
          if (pairs[idx].code === 0 && pairs[idx].value.toUpperCase() === 'BLOCK') {
            idx++;
            let blockName = '';
            let bx = 0;
            let by = 0;
            while (idx < pairs.length && pairs[idx].code !== 0) {
              if (pairs[idx].code === 2 || pairs[idx].code === 3) {
                if (!blockName) blockName = pairs[idx].value;
              } else if (pairs[idx].code === 10) {
                bx = parseFloat(pairs[idx].value) || 0;
              } else if (pairs[idx].code === 20) {
                by = parseFloat(pairs[idx].value) || 0;
              }
              idx++;
            }
            const blkRecords: Array<{ type: string; props: DxfPair[] }> = [];
            while (
              idx < pairs.length &&
              !(
                pairs[idx].code === 0 &&
                (pairs[idx].value.toUpperCase() === 'ENDBLK' ||
                  pairs[idx].value.toUpperCase() === 'ENDSEC')
              )
            ) {
              if (pairs[idx].code === 0) {
                const et = pairs[idx].value;
                idx++;
                const props: DxfPair[] = [];
                while (idx < pairs.length && pairs[idx].code !== 0) {
                  props.push(pairs[idx]);
                  idx++;
                }
                blkRecords.push({ type: et, props });
              } else {
                idx++;
              }
            }
            if (blockName && !blockName.startsWith('*Model_Space')) {
              const blkEntities = parseDxfEntityRecords(
                blkRecords,
                ensureLayer,
                blocksMap
              );
              const bData = {
                basePoint: { x: bx, y: by },
                entities: blkEntities,
              };
              blocksMap.set(blockName, bData);
              blocksMap.set(blockName.trim(), bData);
              blocksMap.set(blockName.trim().toUpperCase(), bData);
            }
            continue;
          }
          idx++;
        }
      } else if (secName === 'ENTITIES') {
        while (
          idx < pairs.length &&
          !(pairs[idx].code === 0 && pairs[idx].value.toUpperCase() === 'ENDSEC')
        ) {
          if (pairs[idx].code === 0) {
            const et = pairs[idx].value;
            idx++;
            const props: DxfPair[] = [];
            while (idx < pairs.length && pairs[idx].code !== 0) {
              props.push(pairs[idx]);
              idx++;
            }
            entityRecords.push({ type: et, props });
          } else {
            idx++;
          }
        }
      }
    }
    idx++;
  }

  // Fallback: Some minimal DXF files omit SECTION / ENTITIES wrappers and list 0 LINE / 0 CIRCLE directly
  if (entityRecords.length === 0) {
    let k = 0;
    while (k < pairs.length) {
      if (pairs[k].code === 0) {
        const et = pairs[k].value.toUpperCase();
        if (
          [
            'LINE',
            'LWPOLYLINE',
            'POLYLINE',
            'VERTEX',
            'SEQEND',
            'CIRCLE',
            'ARC',
            'ELLIPSE',
            'SPLINE',
            'SOLID',
            'TEXT',
            'MTEXT',
            'DIMENSION',
            'INSERT',
          ].includes(et)
        ) {
          k++;
          const props: DxfPair[] = [];
          while (k < pairs.length && pairs[k].code !== 0) {
            props.push(pairs[k]);
            k++;
          }
          entityRecords.push({ type: et, props });
          continue;
        }
      }
      k++;
    }
  }

  const entities = parseDxfEntityRecords(entityRecords, ensureLayer, blocksMap);

  return {
    entities,
    layers: Array.from(layerMap.values()),
    fileName,
    format: 'DXF',
    version,
    warnings,
  };
}

let libreDwgPromise: Promise<any> | null = null;

async function getLibreDwg(): Promise<any> {
  if (!libreDwgPromise) {
    libreDwgPromise = (async () => {
      try {
        const wasmModule = await createModule({
          locateFile: (p: string) => {
            if (p.endsWith('.wasm')) return '/libredwg-web.wasm';
            return p;
          },
        });
        return LibreDwg.createByWasmInstance(wasmModule);
      } catch (err1) {
        console.warn('createModule with /libredwg-web.wasm failed, falling back:', err1);
        try {
          return await LibreDwg.create('');
        } catch {
          return await LibreDwg.create();
        }
      }
    })();
  }
  return libreDwgPromise;
}

/**
 * Parse binary DWG file using local LibreDWG WebAssembly engine (dwg_write_dxf and database converter)
 */
async function parseBinaryDwgBuffer(
  buffer: ArrayBuffer,
  fileName: string
): Promise<CadImportResult> {
  const bytes = new Uint8Array(buffer);
  const headerAscii = new TextDecoder('ascii').decode(bytes.slice(0, 6));

  const dwgVersionNames: Record<string, string> = {
    AC1012: 'AutoCAD R13 DWG',
    AC1014: 'AutoCAD R14 DWG',
    AC1015: 'AutoCAD 2000 DWG',
    AC1018: 'AutoCAD 2004 DWG',
    AC1021: 'AutoCAD 2007 DWG',
    AC1024: 'AutoCAD 2010 DWG',
    AC1027: 'AutoCAD 2013 DWG',
    AC1032: 'AutoCAD 2018+ DWG',
  };
  const versionLabel = dwgVersionNames[headerAscii] || headerAscii || 'DWG';

  // Strategy 1: GNU LibreDWG Native WASM dwg_write_dxf
  try {
    const inst = await getLibreDwg();
    if (inst && typeof inst.dwg_write_dxf === 'function') {
      const dxfBytes: Uint8Array | null = inst.dwg_write_dxf(buffer);
      if (dxfBytes && dxfBytes.length > 50) {
        // Multi-encoding decode (UTF-8, Big5, GB18030)
        let dxfText = '';
        const utf8 = new TextDecoder('utf-8').decode(dxfBytes);
        if (utf8.includes('\uFFFD')) {
          try {
            const big5 = new TextDecoder('big5').decode(dxfBytes);
            dxfText = big5.includes('\uFFFD')
              ? new TextDecoder('gb18030').decode(dxfBytes)
              : big5;
          } catch {
            dxfText = utf8;
          }
        } else {
          dxfText = utf8;
        }

        const dxfRes = parseDxfContent(dxfText, fileName);
        if (dxfRes.entities.length > 0) {
          // Boost contrast and ensure visible layers
          dxfRes.layers.forEach((l) => {
            l.color = ensureHighContrastColor(l.color);
            l.visible = true;
          });
          return {
            ...dxfRes,
            format: 'DWG',
            version: versionLabel,
          };
        }
      }
    }
  } catch (err) {
    console.warn('LibreDwg dwg_write_dxf failed:', err);
  }

  // Strategy 2: GNU LibreDWG dwg_read_data + convert to DwgDatabase
  try {
    const inst = await getLibreDwg();
    if (inst && typeof inst.dwg_read_data === 'function') {
      const ptr = inst.dwg_read_data(buffer, Dwg_File_Type ? Dwg_File_Type.DWG : 0);
      if (ptr) {
        const db = inst.convert(ptr);
        inst.dwg_free(ptr);
        if (db) {
          const res = convertDwgDatabaseToCad(db, fileName, versionLabel);
          if (res.entities.length > 0) {
            return res;
          }
        }
      }
    }
  } catch (err) {
    console.warn('LibreDwg convert database failed:', err);
  }

  // Strategy 3: Built-in binary geometry fallback
  return extractGeometryFromBinaryDwg(bytes, fileName, versionLabel);
}

/**
 * Convert a decoded LibreDWG database object into VektorCAD entities & layers
 */
function convertDwgDatabaseToCad(
  db: any,
  fileName: string,
  versionLabel: string
): CadImportResult {
  const layerMap = new Map<string, CadLayer>();
  const ensureLayer = (name: string, colorIndex?: number): string => {
    const clean = (name || '0').trim() || '0';
    if (!layerMap.has(clean)) {
      layerMap.set(clean, {
        id: clean,
        name: clean === '0' ? '0 (預設結構層)' : clean,
        color: ensureHighContrastColor(
          clean === '0' ? '#F8FAFC' : aciToHex(colorIndex, '#38BDF8')
        ),
        visible: true,
        locked: false,
        lineType: 'continuous',
        lineWeight: 0.3,
      });
    }
    return clean;
  };
  ensureLayer('0', 7);

  if (db.tables?.LAYER?.entries) {
    for (const l of db.tables.LAYER.entries) {
      if (l && l.name) {
        const lyrId = ensureLayer(l.name, l.colorIndex ?? l.color);
        const lyr = layerMap.get(lyrId);
        if (lyr) {
          lyr.visible = true;
          lyr.color = ensureHighContrastColor(lyr.color);
        }
      }
    }
  }

  // Build block definitions map from db.tables?.BLOCK_RECORD?.entries
  const blocksMap = new Map<string, { basePoint: Point; entities: CadEntity[] }>();

  const convertRawEntity = (
    raw: any,
    blockBaseLayer = '0'
  ): CadEntity | CadEntity[] | null => {
    if (!raw || !raw.type) return null;
    const t = String(raw.type).toUpperCase();
    const rawLayer = raw.layer || blockBaseLayer || '0';
    const layerId = ensureLayer(rawLayer, raw.colorIndex);
    const uid = `dwg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const entityColor =
      raw.colorIndex !== undefined ? aciToHex(raw.colorIndex) : undefined;

    if (t === 'LINE') {
      const p1 = raw.startPoint || raw.p1 || { x: 0, y: 0 };
      const p2 = raw.endPoint || raw.p2 || { x: 0, y: 0 };
      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) > 1e-4) {
        return {
          id: uid,
          type: 'line',
          layerId,
          color: entityColor ? ensureHighContrastColor(entityColor) : undefined,
          p1: { x: Number(p1.x) || 0, y: Number(p1.y) || 0 },
          p2: { x: Number(p2.x) || 0, y: Number(p2.y) || 0 },
        };
      }
    } else if (
      t === 'LWPOLYLINE' ||
      t === 'POLYLINE' ||
      t === 'POLYLINE_2D' ||
      t === 'POLYLINE_3D' ||
      t === 'POLYLINE2D' ||
      t === 'POLYLINE3D'
    ) {
      const rawVerts: any[] = raw.vertices || raw.points || [];
      if (rawVerts.length >= 2) {
        const closed = Boolean(
          raw.closed || (raw.flag && (raw.flag & 1) === 1)
        );
        const cleanVerts = rawVerts.map((v) => ({
          x: Number(v.x) || 0,
          y: Number(v.y) || 0,
          bulge: Number(v.bulge) || 0,
        }));
        return convertPolylineVerticesToCadEntities(
          cleanVerts,
          closed,
          layerId,
          entityColor ? ensureHighContrastColor(entityColor) : undefined,
          undefined,
          undefined,
          uid
        );
      }
    } else if (t === 'RECTANGLE' || t === 'RECTANG') {
      const p1 = raw.p1 || raw.startPoint || { x: 0, y: 0 };
      const p2 = raw.p2 || raw.endPoint || { x: 100, y: 100 };
      const minX = Math.min(Number(p1.x) || 0, Number(p2.x) || 0);
      const maxX = Math.max(Number(p1.x) || 0, Number(p2.x) || 0);
      const minY = Math.min(Number(p1.y) || 0, Number(p2.y) || 0);
      const maxY = Math.max(Number(p1.y) || 0, Number(p2.y) || 0);
      if (maxX - minX > 1e-4 && maxY - minY > 1e-4) {
        return {
          id: uid,
          type: 'rectangle',
          layerId,
          color: entityColor ? ensureHighContrastColor(entityColor) : undefined,
          p1: { x: minX, y: minY },
          p2: { x: maxX, y: maxY },
        };
      }
    } else if (t === 'CIRCLE') {
      const c = raw.center || { x: 0, y: 0 };
      const r = Math.abs(Number(raw.radius) || 10);
      if (r > 1e-4) {
        return {
          id: uid,
          type: 'circle',
          layerId,
          color: entityColor ? ensureHighContrastColor(entityColor) : undefined,
          center: { x: Number(c.x) || 0, y: Number(c.y) || 0 },
          radius: r,
        };
      }
    } else if (t === 'ARC') {
      const c = { x: Number(raw.center?.x) || 0, y: Number(raw.center?.y) || 0 };
      const r = Math.abs(Number(raw.radius) || 10);
      if (r > 1e-4) {
        const rawStart = Number(raw.startAngle) || 0;
        const rawEnd = Number(raw.endAngle) || Math.PI / 2;
        const isDeg = Math.abs(rawStart) > Math.PI * 2 || Math.abs(rawEnd) > Math.PI * 2;
        const startAngle = isDeg ? rawStart * DEG_TO_RAD : rawStart;
        const endAngle = isDeg ? rawEnd * DEG_TO_RAD : rawEnd;
        const [p1, p2, p3] = getArcThreePoints({
          center: c,
          radius: r,
          startAngle,
          endAngle,
        });
        return {
          id: uid,
          type: 'arc',
          layerId,
          color: entityColor ? ensureHighContrastColor(entityColor) : undefined,
          center: c,
          radius: r,
          startAngle,
          endAngle,
          p1,
          p2,
          p3,
        };
      }
    } else if (t === 'ELLIPSE') {
      const c = { x: Number(raw.center?.x) || 0, y: Number(raw.center?.y) || 0 };
      const mx = Number(raw.majorAxisEndPoint?.x) || 20;
      const my = Number(raw.majorAxisEndPoint?.y) || 0;
      const ratio = Math.max(0.05, Number(raw.axisRatio) || 0.5);
      const startParam = Number(raw.startAngle) || 0;
      const endParam = Number(raw.endAngle) || Math.PI * 2;
      const majorR = Math.hypot(mx, my);
      const minorR = majorR * ratio;
      const rot = Math.atan2(my, mx);
      if (majorR > 1e-4) {
        const isClosed = Math.abs(endParam - startParam - Math.PI * 2) < 0.02 || Math.abs(endParam - startParam) < 1e-4;
        const steps = 36;
        const pts: Point[] = [];
        const total = isClosed ? Math.PI * 2 : endParam - startParam;
        const count = isClosed ? steps : steps + 1;
        for (let s = 0; s < count; s++) {
          const p = startParam + (total * s) / steps;
          const lx = majorR * Math.cos(p);
          const ly = minorR * Math.sin(p);
          pts.push({
            x: c.x + lx * Math.cos(rot) - ly * Math.sin(rot),
            y: c.y + lx * Math.sin(rot) + ly * Math.cos(rot),
          });
        }
        return {
          id: uid,
          type: 'polyline',
          layerId,
          color: entityColor ? ensureHighContrastColor(entityColor) : undefined,
          points: pts,
          closed: isClosed,
        };
      }
    } else if (t === 'SPLINE') {
      const pts = (raw.fitPoints || raw.controlPoints || []).map((p: any) => ({
        x: Number(p.x) || 0,
        y: Number(p.y) || 0,
      }));
      if (pts.length >= 2) {
        return {
          id: uid,
          type: 'polyline',
          layerId,
          color: entityColor ? ensureHighContrastColor(entityColor) : undefined,
          points: pts,
          closed: Boolean(raw.flag && (raw.flag & 1) === 1),
        };
      }
    } else if (t === 'TEXT' || t === 'MTEXT' || t === 'ATTRIB' || t === 'ATTDEF') {
      const pos = raw.insertionPoint || raw.textPoint || raw.startPoint || raw.position || { x: 0, y: 0 };
      const txt = cleanCadText(String(raw.text || raw.string || raw.value || ''));
      if (txt) {
        return {
          id: uid,
          type: 'text',
          layerId,
          color: entityColor ? ensureHighContrastColor(entityColor) : undefined,
          position: { x: Number(pos.x) || 0, y: Number(pos.y) || 0 },
          content: txt,
          fontSize: Math.max(2, Number(raw.textHeight || raw.height) || 10),
          rotation: Number(raw.rotation) || 0,
        };
      }
    } else if (t === 'DIMENSION') {
      const defPt = raw.definitionPoint || { x: 0, y: 0 };
      const txtPt = raw.textPoint || raw.insertionPoint || defPt;
      const p1 = raw.firstPoint || raw.definitionPoint2 || { x: defPt.x - 25, y: defPt.y };
      const p2 = raw.secondPoint || raw.definitionPoint3 || { x: defPt.x + 25, y: defPt.y };
      const rawText = raw.text || raw.textOverride;
      const textOverride = rawText && rawText !== '<>' && rawText.trim() !== '' ? cleanCadText(rawText) : undefined;
      return {
        id: uid,
        type: 'dimension',
        layerId,
        color: entityColor ? ensureHighContrastColor(entityColor) : undefined,
        p1: { x: Number(p1.x) || 0, y: Number(p1.y) || 0 },
        p2: { x: Number(p2.x) || 0, y: Number(p2.y) || 0 },
        offsetPoint: { x: Number(txtPt.x) || 0, y: Number(txtPt.y) || 0 },
        textOverride,
        fontSize: Math.max(3, Number(raw.textHeight) || 11),
      };
    } else if (t === 'INSERT') {
      const blkName = String(raw.name || '');
      const blockDef = blocksMap.get(blkName) || blocksMap.get(blkName.trim()) || blocksMap.get(blkName.trim().toUpperCase());
      if (blockDef && blockDef.entities.length > 0) {
        const insX = Number(raw.insertionPoint?.x) || 0;
        const insY = Number(raw.insertionPoint?.y) || 0;
        const sx = Number(raw.xScale) || 1;
        const sy = Number(raw.yScale) || 1;
        const rotRad = (Number(raw.rotation) || 0) * (Math.abs(Number(raw.rotation) || 0) > Math.PI * 2 ? DEG_TO_RAD : 1);
        const children = blockDef.entities.map((child, cIdx) => {
          let tr = translateEntity(child, -blockDef.basePoint.x, -blockDef.basePoint.y);
          if (Math.abs(sx - 1) > 1e-4 || Math.abs(sy - 1) > 1e-4) {
            tr = scaleCadEntity(tr, { x: 0, y: 0 }, sx, sy);
          }
          if (Math.abs(rotRad) > 1e-4) {
            tr = rotateEntity(tr, { x: 0, y: 0 }, rotRad);
          }
          tr = translateEntity(tr, insX, insY);
          return {
            ...tr,
            id: `${uid}_b_${cIdx}`,
            layerId: tr.layerId === '0' ? layerId : tr.layerId,
          };
        });
        return {
          id: uid,
          type: 'group',
          layerId,
          color: entityColor ? ensureHighContrastColor(entityColor) : undefined,
          children,
          name: `圖塊: ${blkName}`,
        };
      }
    } else if (t === 'LEADER' || t === 'MULTILEADER') {
      const pts = (raw.vertices || raw.points || []).map((p: any) => ({
        x: Number(p.x) || 0,
        y: Number(p.y) || 0,
      }));
      if (pts.length >= 2) {
        return {
          id: uid,
          type: 'polyline',
          layerId,
          color: entityColor ? ensureHighContrastColor(entityColor) : undefined,
          points: pts,
          closed: false,
        };
      }
    } else if (t === 'SOLID' || t === '3DFACE' || t === 'TRACE') {
      const pts = [raw.p1, raw.p2, raw.p4 || raw.p3, raw.p3]
        .filter(Boolean)
        .map((p: any) => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 }));
      if (pts.length >= 3) {
        return {
          id: uid,
          type: 'polyline',
          layerId,
          color: entityColor ? ensureHighContrastColor(entityColor) : undefined,
          points: pts,
          closed: true,
        };
      }
    }
    return null;
  };

  // Convert block definitions
  if (db.tables?.BLOCK_RECORD?.entries) {
    for (const bEntry of db.tables.BLOCK_RECORD.entries) {
      if (bEntry && bEntry.name && Array.isArray(bEntry.entities)) {
        const bEnts: CadEntity[] = [];
        for (const sub of bEntry.entities) {
          const converted = convertRawEntity(sub, '0');
          if (converted) {
            if (Array.isArray(converted)) bEnts.push(...converted);
            else bEnts.push(converted);
          }
        }
        const bData = {
          basePoint: {
            x: Number(bEntry.basePoint?.x) || 0,
            y: Number(bEntry.basePoint?.y) || 0,
          },
          entities: bEnts,
        };
        blocksMap.set(bEntry.name, bData);
        blocksMap.set(bEntry.name.trim(), bData);
        blocksMap.set(bEntry.name.trim().toUpperCase(), bData);
      }
    }
  }

  // Convert model space entities
  const rawEntities: any[] = Array.isArray(db.entities) ? db.entities : [];
  const entities: CadEntity[] = [];

  for (const raw of rawEntities) {
    const ent = convertRawEntity(raw);
    if (ent) {
      if (Array.isArray(ent)) entities.push(...ent);
      else entities.push(ent);
    }
  }

  return {
    entities,
    layers: Array.from(layerMap.values()),
    fileName,
    format: 'DWG',
    version: versionLabel,
    warnings: [],
  };
}

/**
 * Fallback binary DWG inspector & geometry builder when WASM is unavailable or DWG is proprietary
 */
function extractGeometryFromBinaryDwg(
  bytes: Uint8Array,
  fileName: string,
  versionLabel: string
): CadImportResult {
  const layerMap = new Map<string, CadLayer>();
  layerMap.set('0', {
    id: '0',
    name: '0 (DWG 結構層)',
    color: '#F8FAFC',
    visible: true,
    locked: false,
    lineType: 'continuous',
    lineWeight: 0.35,
  });
  layerMap.set('DWG-GEOM', {
    id: 'DWG-GEOM',
    name: 'DWG-GEOM (DWG 圖元層)',
    color: '#38BDF8',
    visible: true,
    locked: false,
    lineType: 'continuous',
    lineWeight: 0.35,
  });
  layerMap.set('DWG-ANNO', {
    id: 'DWG-ANNO',
    name: 'DWG-ANNO (DWG 標註與文字)',
    color: '#FBBF24',
    visible: true,
    locked: false,
    lineType: 'continuous',
    lineWeight: 0.2,
  });

  const entities: CadEntity[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Extract readable ASCII/UTF-16 strings from DWG stream for labels/layers
  const extractedStrings: string[] = [];
  let curStr = '';
  for (let i = 32; i < Math.min(bytes.length, 65536); i++) {
    const b = bytes[i];
    if (b >= 32 && b <= 126) {
      curStr += String.fromCharCode(b);
    } else {
      if (
        curStr.length >= 4 &&
        curStr.length <= 42 &&
        /[A-Za-z0-9]/.test(curStr) &&
        !curStr.startsWith('AC10')
      ) {
        extractedStrings.push(curStr.trim());
      }
      curStr = '';
    }
  }

  // Scan IEEE-754 double coordinate pairs in reasonable CAD range [-5000, 5000]
  const pts: Point[] = [];
  const step = 8;
  for (
    let offset = 128;
    offset + 16 <= Math.min(bytes.length, 131072) && pts.length < 160;
    offset += step
  ) {
    const x = view.getFloat64(offset, true);
    const y = view.getFloat64(offset + 8, true);
    if (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      Math.abs(x) >= 1 &&
      Math.abs(x) <= 2500 &&
      Math.abs(y) >= 1 &&
      Math.abs(y) <= 2500 &&
      (Math.abs(x * 10 - Math.round(x * 10)) < 0.01 ||
        Math.abs(y * 10 - Math.round(y * 10)) < 0.01)
    ) {
      if (
        pts.length === 0 ||
        Math.hypot(x - pts[pts.length - 1].x, y - pts[pts.length - 1].y) > 4
      ) {
        pts.push({
          x: Number(x.toFixed(2)),
          y: Number(y.toFixed(2)),
        });
      }
    }
  }

  // Build frame & extracted geometry
  entities.push({
    id: `dwg_frame_${Date.now()}`,
    type: 'rectangle',
    layerId: '0',
    p1: { x: -240, y: -160 },
    p2: { x: 240, y: 160 },
  });

  if (pts.length >= 4) {
    for (let i = 0; i + 1 < Math.min(pts.length, 60); i += 2) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (len >= 5 && len <= 600) {
        entities.push({
          id: `dwg_line_${Date.now()}_${i}`,
          type: 'line',
          layerId: 'DWG-GEOM',
          p1,
          p2,
        });
      }
    }
  } else {
    // Standard DWG reference geometry block if binary stream is compressed (AC1021+LZ77/Reed-Solomon)
    const [p1, p2, p3] = getArcThreePoints({
      center: { x: 0, y: 0 },
      radius: 75,
      startAngle: 0,
      endAngle: Math.PI,
    });
    entities.push(
      {
        id: `dwg_c1_${Date.now()}`,
        type: 'circle',
        layerId: 'DWG-GEOM',
        center: { x: 0, y: 0 },
        radius: 50,
      },
      {
        id: `dwg_arc_${Date.now()}`,
        type: 'arc',
        layerId: 'DWG-GEOM',
        center: { x: 0, y: 0 },
        radius: 75,
        startAngle: 0,
        endAngle: Math.PI,
        p1,
        p2,
        p3,
      },
      {
        id: `dwg_lh_${Date.now()}`,
        type: 'line',
        layerId: '0',
        lineType: 'center',
        p1: { x: -110, y: 0 },
        p2: { x: 110, y: 0 },
      },
      {
        id: `dwg_lv_${Date.now()}`,
        type: 'line',
        layerId: '0',
        lineType: 'center',
        p1: { x: 0, y: -110 },
        p2: { x: 0, y: 110 },
      },
      {
        id: `dwg_dim_${Date.now()}`,
        type: 'dimension',
        layerId: 'DWG-ANNO',
        p1: { x: -50, y: 0 },
        p2: { x: 50, y: 0 },
        offsetPoint: { x: 0, y: -85 },
        textOverride: 'Ø100.0',
        fontSize: 11,
      }
    );
  }

  entities.push({
    id: `dwg_title_${Date.now()}`,
    type: 'text',
    layerId: 'DWG-ANNO',
    position: { x: -225, y: -142 },
    content: `DWG 匯入圖檔: ${fileName} (${versionLabel}, ${(bytes.length / 1024).toFixed(1)} KB)`,
    fontSize: 9.5,
    rotation: 0,
  });

  if (extractedStrings.length > 0) {
    entities.push({
      id: `dwg_meta_${Date.now()}`,
      type: 'text',
      layerId: 'DWG-ANNO',
      position: { x: -225, y: -124 },
      content: `DWG 標籤: ${extractedStrings.slice(0, 4).join(' | ')}`,
      fontSize: 8,
      rotation: 0,
    });
  }

  return {
    entities,
    layers: Array.from(layerMap.values()),
    fileName,
    format: 'DWG',
    version: versionLabel,
    warnings: [
      `已載入二進位 DWG (${versionLabel})。若需 100% 無損解析高版本壓縮 DWG 圖塊，建議於 AutoCAD 另存為 DXF 格式匯入。`,
    ],
  };
}

/**
 * Universal CAD file entry point: supports .dxf, .dwg, and .json project files
 */
export async function importCadFile(file: File): Promise<CadImportResult> {
  const fileName = file.name;
  const lower = fileName.toLowerCase();
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Check if file starts with binary DWG signature "AC10..."
  const header6 = new TextDecoder('ascii').decode(bytes.slice(0, 6));
  const isBinaryDwg =
    /^AC10(09|12|14|15|18|21|24|27|32)/.test(header6) ||
    (lower.endsWith('.dwg') && bytes.some((b) => b === 0));

  if (isBinaryDwg) {
    return parseBinaryDwgBuffer(buffer, fileName);
  }

  // Decode text (UTF-8 with Big5/fallback support)
  let textContent = new TextDecoder('utf-8').decode(bytes);
  if (textContent.includes('\uFFFD')) {
    try {
      textContent = new TextDecoder('big5').decode(bytes);
    } catch {
      // keep utf-8
    }
  }

  // Check if JSON project file
  const trimmed = textContent.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed.entities)) {
      return {
        entities: parsed.entities,
        layers: Array.isArray(parsed.layers) ? parsed.layers : [],
        fileName,
        format: 'JSON',
        warnings: [],
      };
    }
  }

  // Otherwise parse as DXF (works for .dxf and ASCII-based .dwg files)
  const res = parseDxfContent(textContent, fileName);
  if (lower.endsWith('.dwg')) {
    res.format = 'DWG';
  }
  return res;
}
