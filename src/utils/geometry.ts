import {
  ArcEntity,
  CadEntity,
  CadLayer,
  DimensionEntity,
  DraftingSettings,
  GripHandle,
  GroupEntity,
  HatchEntity,
  LineEntity,
  Point,
  PolylineEntity,
  SnapPoint,
} from '../types/cad';

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

export function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function angleBetween(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function angleDegrees(a: Point, b: Point): number {
  let deg = Math.atan2(b.y - a.y, b.x - a.x) * RAD_TO_DEG;
  if (deg < 0) deg += 360;
  return deg;
}

export function normalizeAngle(rad: number): number {
  let a = rad % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a;
}

/**
 * Compute the 3 points [p1 (start), p2 (mid-arc), p3 (end)] on an ArcEntity.
 */
export function getArcThreePoints(arc: {
  center: Point;
  radius: number;
  startAngle: number;
  endAngle: number;
}): [Point, Point, Point] {
  const s = normalizeAngle(arc.startAngle);
  const e = normalizeAngle(arc.endAngle);
  let sweep = normalizeAngle(e - s);
  if (sweep < 1e-5) sweep = Math.PI;
  const midAng = s + sweep / 2;

  const p1: Point = {
    x: arc.center.x + arc.radius * Math.cos(s),
    y: arc.center.y + arc.radius * Math.sin(s),
  };
  const p2: Point = {
    x: arc.center.x + arc.radius * Math.cos(midAng),
    y: arc.center.y + arc.radius * Math.sin(midAng),
  };
  const p3: Point = {
    x: arc.center.x + arc.radius * Math.cos(e),
    y: arc.center.y + arc.radius * Math.sin(e),
  };
  return [p1, p2, p3];
}

/**
 * Compute a circular arc passing through 3 distinct points: p1 (start) -> p2 (mid on arc) -> p3 (end).
 * Returns startAngle and endAngle such that moving CCW from startAngle to endAngle traces the arc.
 */
export function arcFromThreePoints(
  p1: Point,
  p2: Point,
  p3: Point
): {
  center: Point;
  radius: number;
  startAngle: number;
  endAngle: number;
} | null {
  const ax = p1.x,
    ay = p1.y;
  const bx = p2.x,
    by = p2.y;
  const cx = p3.x,
    cy = p3.y;

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-5) {
    return null; // Collinear points
  }

  const aSq = ax * ax + ay * ay;
  const bSq = bx * bx + by * by;
  const cSq = cx * cx + cy * cy;

  const ux = (aSq * (by - cy) + bSq * (cy - ay) + cSq * (ay - by)) / d;
  const uy = (aSq * (cx - bx) + bSq * (ax - cx) + cSq * (bx - ax)) / d;

  const center = { x: ux, y: uy };
  const radius = dist(center, p1);
  if (radius < 0.1 || radius > 50000) return null;

  const a1 = normalizeAngle(Math.atan2(p1.y - uy, p1.x - ux));
  const a2 = normalizeAngle(Math.atan2(p2.y - uy, p2.x - ux));
  const a3 = normalizeAngle(Math.atan2(p3.y - uy, p3.x - ux));

  const ccwSweep12 = normalizeAngle(a2 - a1);
  const ccwSweep13 = normalizeAngle(a3 - a1);

  if (ccwSweep12 <= ccwSweep13) {
    return { center, radius, startAngle: a1, endAngle: a3 };
  } else {
    return { center, radius, startAngle: a3, endAngle: a1 };
  }
}

export function rotatePoint(p: Point, center: Point, angleRad: number): Point {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

export function mirrorPoint(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return { ...p };
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return {
    x: 2 * projX - p.x,
    y: 2 * projY - p.y,
  };
}

export function distToSegment(p: Point, v: Point, w: Point): number {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) return dist(p, v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, {
    x: v.x + t * (w.x - v.x),
    y: v.y + t * (w.y - v.y),
  });
}

export function segmentIntersection(
  p1: Point,
  p2: Point,
  p3: Point,
  p4: Point
): Point | null {
  const d =
    (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-8) return null;
  const t =
    ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u =
    ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  if (t >= -1e-6 && t <= 1 + 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) {
    return {
      x: p1.x + t * (p2.x - p1.x),
      y: p1.y + t * (p2.y - p1.y),
    };
  }
  return null;
}

export function raySegmentIntersection(
  rayOrigin: Point,
  rayDir: Point,
  s1: Point,
  s2: Point
): Point | null {
  const rdx = rayDir.x;
  const rdy = rayDir.y;
  const sdx = s2.x - s1.x;
  const sdy = s2.y - s1.y;

  const d = rdx * sdy - rdy * sdx;
  if (Math.abs(d) < 1e-8) return null;

  const t = ((s1.x - rayOrigin.x) * sdy - (s1.y - rayOrigin.y) * sdx) / d;
  const u = ((s1.x - rayOrigin.x) * rdy - (s1.y - rayOrigin.y) * rdx) / d;

  if (t > 0.05 && u >= -1e-5 && u <= 1 + 1e-5) {
    return {
      x: rayOrigin.x + t * rdx,
      y: rayOrigin.y + t * rdy,
    };
  }
  return null;
}

export function lineCircleIntersections(
  p1: Point,
  p2: Point,
  center: Point,
  radius: number,
  asRay = false
): Point[] {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const fx = p1.x - center.x;
  const fy = p1.y - center.y;

  const a = dx * dx + dy * dy;
  if (a < 1e-9) return [];
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];

  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-b - sqrtDisc) / (2 * a);
  const t2 = (-b + sqrtDisc) / (2 * a);
  const res: Point[] = [];

  for (const t of [t1, t2]) {
    if (asRay ? t > 0.05 : t >= -1e-5 && t <= 1 + 1e-5) {
      res.push({ x: p1.x + t * dx, y: p1.y + t * dy });
    }
  }
  return res;
}

/**
 * Intersections between two circles (c1, r1) and (c2, r2).
 */
export function circleCircleIntersections(
  c1: Point,
  r1: number,
  c2: Point,
  r2: number
): Point[] {
  const d = dist(c1, c2);
  if (d < 1e-6 || d > r1 + r2 + 1e-5 || d < Math.abs(r1 - r2) - 1e-5) {
    return [];
  }
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const hSq = Math.max(0, r1 * r1 - a * a);
  const h = Math.sqrt(hSq);
  const x2 = c1.x + (a * (c2.x - c1.x)) / d;
  const y2 = c1.y + (a * (c2.y - c1.y)) / d;

  if (h < 1e-5) {
    return [{ x: x2, y: y2 }];
  }

  const rx = -(c2.y - c1.y) * (h / d);
  const ry = (c2.x - c1.x) * (h / d);
  return [
    { x: x2 + rx, y: y2 + ry },
    { x: x2 - rx, y: y2 - ry },
  ];
}

export function isAngleOnArc(
  angle: number,
  startAngle: number,
  endAngle: number,
  tol = 0.015
): boolean {
  const ang = normalizeAngle(angle);
  const s = normalizeAngle(startAngle);
  const e = normalizeAngle(endAngle);
  const sweep = normalizeAngle(e - s);
  const rel = normalizeAngle(ang - s);
  return rel <= sweep + tol || Math.PI * 2 - rel <= tol;
}

export function getPolygonVertices(
  center: Point,
  radius: number,
  sides: number,
  rotation: number
): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (i * 2 * Math.PI) / sides;
    pts.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    });
  }
  return pts;
}

/**
 * Flatten any GroupEntity into its leaf entities for intersection / snapping calculations.
 */
export function flattenEntities(entities: CadEntity[]): CadEntity[] {
  const out: CadEntity[] = [];
  for (const ent of entities) {
    if (ent.type === 'group') {
      out.push(...flattenEntities(ent.children));
    } else {
      out.push(ent);
    }
  }
  return out;
}

export function getEntitySegments(entity: CadEntity): Array<[Point, Point]> {
  switch (entity.type) {
    case 'line':
      return [[entity.p1, entity.p2]];
    case 'rectangle': {
      const a = { x: entity.p1.x, y: entity.p1.y };
      const b = { x: entity.p2.x, y: entity.p1.y };
      const c = { x: entity.p2.x, y: entity.p2.y };
      const d = { x: entity.p1.x, y: entity.p2.y };
      return [
        [a, b],
        [b, c],
        [c, d],
        [d, a],
      ];
    }
    case 'polyline': {
      const segs: Array<[Point, Point]> = [];
      for (let i = 0; i < entity.points.length - 1; i++) {
        segs.push([entity.points[i], entity.points[i + 1]]);
      }
      if (entity.closed && entity.points.length > 2) {
        segs.push([entity.points[entity.points.length - 1], entity.points[0]]);
      }
      return segs;
    }
    case 'polygon': {
      const pts = getPolygonVertices(
        entity.center,
        entity.radius,
        entity.sides,
        entity.rotation
      );
      const segs: Array<[Point, Point]> = [];
      for (let i = 0; i < pts.length; i++) {
        segs.push([pts[i], pts[(i + 1) % pts.length]]);
      }
      return segs;
    }
    case 'hatch': {
      if (entity.boundaryType === 'polygon' && entity.points && entity.points.length >= 2) {
        const segs: Array<[Point, Point]> = [];
        for (let i = 0; i < entity.points.length; i++) {
          segs.push([entity.points[i], entity.points[(i + 1) % entity.points.length]]);
        }
        return segs;
      }
      return [];
    }
    case 'group': {
      const segs: Array<[Point, Point]> = [];
      for (const child of entity.children) {
        segs.push(...getEntitySegments(child));
      }
      return segs;
    }
    default:
      return [];
  }
}

/**
 * Compute 45° (or custom angle) parallel hatch segments clipped to a HatchEntity boundary.
 */
export function getHatchSegments(entity: HatchEntity): Array<[Point, Point]> {
  const pitch = Math.max(0.2, entity.pitch || 5);
  const angleRad = ((entity.angle ?? 45) * Math.PI) / 180;
  const dirX = Math.cos(angleRad);
  const dirY = Math.sin(angleRad);
  const normX = -dirY;
  const normY = dirX;

  if (
    entity.boundaryType === 'circle' &&
    entity.center &&
    entity.radius &&
    entity.radius > 0
  ) {
    const cx = entity.center.x;
    const cy = entity.center.y;
    const r = entity.radius;
    const segs: Array<[Point, Point]> = [];
    const maxLines = 600;
    const effectivePitch = Math.max(pitch, (2 * r) / maxLines);

    const kStart = Math.ceil(-r / effectivePitch);
    const kEnd = Math.floor(r / effectivePitch);

    for (let k = kStart; k <= kEnd; k++) {
      const d = k * effectivePitch;
      if (Math.abs(d) >= r - 1e-4) continue;
      const halfChord = Math.sqrt(Math.max(0, r * r - d * d));
      const basePtX = cx + d * normX;
      const basePtY = cy + d * normY;
      segs.push([
        { x: basePtX - halfChord * dirX, y: basePtY - halfChord * dirY },
        { x: basePtX + halfChord * dirX, y: basePtY + halfChord * dirY },
      ]);
    }
    return segs;
  }

  if (
    entity.boundaryType === 'polygon' &&
    entity.points &&
    entity.points.length >= 3
  ) {
    const pts = entity.points;
    let minProj = Infinity;
    let maxProj = -Infinity;
    for (const p of pts) {
      const proj = p.x * normX + p.y * normY;
      if (proj < minProj) minProj = proj;
      if (proj > maxProj) maxProj = proj;
    }
    const span = maxProj - minProj;
    if (span <= 1e-4) return [];

    const maxLines = 600;
    const effectivePitch = Math.max(pitch, span / maxLines);
    const kStart = Math.ceil(minProj / effectivePitch);
    const kEnd = Math.floor(maxProj / effectivePitch);

    const edges: Array<[Point, Point]> = [];
    for (let i = 0; i < pts.length; i++) {
      edges.push([pts[i], pts[(i + 1) % pts.length]]);
    }

    const segs: Array<[Point, Point]> = [];
    for (let k = kStart; k <= kEnd; k++) {
      const cVal = k * effectivePitch;
      const tHits: number[] = [];

      for (const [a, b] of edges) {
        const na = a.x * normX + a.y * normY;
        const nb = b.x * normX + b.y * normY;
        if ((na <= cVal && nb > cVal) || (nb <= cVal && na > cVal)) {
          const frac = (cVal - na) / (nb - na);
          const ix = a.x + frac * (b.x - a.x);
          const iy = a.y + frac * (b.y - a.y);
          const t = ix * dirX + iy * dirY;
          tHits.push(t);
        }
      }

      tHits.sort((a, b) => a - b);
      for (let i = 0; i + 1 < tHits.length; i += 2) {
        const t1 = tHits[i];
        const t2 = tHits[i + 1];
        if (Math.abs(t2 - t1) > 1e-3) {
          segs.push([
            { x: cVal * normX + t1 * dirX, y: cVal * normY + t1 * dirY },
            { x: cVal * normX + t2 * dirX, y: cVal * normY + t2 * dirY },
          ]);
        }
      }
    }
    return segs;
  }

  return [];
}

/**
 * Create a HatchEntity from a target closed entity or a connected loop of lines/polylines.
 */
export function createHatchFromEntities(
  targetEntities: CadEntity[],
  pitch: number,
  layerId = 'WALL'
): HatchEntity[] {
  const validPitch = Math.max(0.2, pitch || 5);
  const hatches: HatchEntity[] = [];
  const linePool: Array<[Point, Point]> = [];

  for (const ent of targetEntities) {
    if (ent.type === 'circle') {
      hatches.push({
        id: `hatch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'hatch',
        layerId,
        pitch: validPitch,
        angle: 45,
        boundaryType: 'circle',
        center: { ...ent.center },
        radius: ent.radius,
      });
    } else if (ent.type === 'rectangle') {
      const minX = Math.min(ent.p1.x, ent.p2.x);
      const maxX = Math.max(ent.p1.x, ent.p2.x);
      const minY = Math.min(ent.p1.y, ent.p2.y);
      const maxY = Math.max(ent.p1.y, ent.p2.y);
      hatches.push({
        id: `hatch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'hatch',
        layerId,
        pitch: validPitch,
        angle: 45,
        boundaryType: 'polygon',
        points: [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ],
      });
    } else if (ent.type === 'polygon') {
      const pts = getPolygonVertices(
        ent.center,
        ent.radius,
        ent.sides,
        ent.rotation
      );
      hatches.push({
        id: `hatch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'hatch',
        layerId,
        pitch: validPitch,
        angle: 45,
        boundaryType: 'polygon',
        points: pts,
      });
    } else if (ent.type === 'polyline') {
      if (ent.points.length >= 3) {
        hatches.push({
          id: `hatch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'hatch',
          layerId,
          pitch: validPitch,
          angle: 45,
          boundaryType: 'polygon',
          points: ent.points.map((p) => ({ ...p })),
        });
      } else {
        linePool.push(...getEntitySegments(ent));
      }
    } else if (ent.type === 'line') {
      linePool.push([ent.p1, ent.p2]);
    } else if (ent.type === 'group') {
      const childHatches = createHatchFromEntities(
        ent.children,
        validPitch,
        layerId
      );
      hatches.push(...childHatches);
    }
  }

  // Try to chain any loose Line segments into a closed polygon loop
  if (linePool.length >= 3) {
    const used = new Array(linePool.length).fill(false);
    const chain: Point[] = [{ ...linePool[0][0] }, { ...linePool[0][1] }];
    used[0] = true;
    const tol = 2.5;

    let progress = true;
    while (progress) {
      progress = false;
      const tail = chain[chain.length - 1];
      for (let i = 0; i < linePool.length; i++) {
        if (used[i]) continue;
        const [a, b] = linePool[i];
        if (dist(tail, a) <= tol) {
          chain.push({ ...b });
          used[i] = true;
          progress = true;
          break;
        } else if (dist(tail, b) <= tol) {
          chain.push({ ...a });
          used[i] = true;
          progress = true;
          break;
        }
      }
    }

    if (chain.length >= 3) {
      if (dist(chain[0], chain[chain.length - 1]) <= tol) {
        chain.pop();
      }
      if (chain.length >= 3) {
        hatches.push({
          id: `hatch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'hatch',
          layerId,
          pitch: validPitch,
          angle: 45,
          boundaryType: 'polygon',
          points: chain,
        });
      }
    }
  }

  return hatches;
}

function findSegmentIntersectionsT(
  segA: Point,
  segB: Point,
  ignoreEntityId: string,
  allEntities: CadEntity[]
): number[] {
  const segLen = dist(segA, segB);
  if (segLen < 1e-4) return [];

  const ts: number[] = [];

  const addPoint = (pt: Point) => {
    const t = dist(segA, pt) / segLen;
    if (t > 0.005 && t < 0.995) {
      if (!ts.some((existing) => Math.abs(existing - t) < 0.005)) {
        ts.push(t);
      }
    }
  };

  const leaves = flattenEntities(
    allEntities.filter((e) => e.id !== ignoreEntityId)
  );

  for (const other of leaves) {
    if (other.id === ignoreEntityId) continue;

    const otherSegs = getEntitySegments(other);
    for (const [o1, o2] of otherSegs) {
      const pt = segmentIntersection(segA, segB, o1, o2);
      if (pt) addPoint(pt);
    }

    if (other.type === 'circle') {
      const pts = lineCircleIntersections(
        segA,
        segB,
        other.center,
        other.radius,
        false
      );
      pts.forEach(addPoint);
    } else if (other.type === 'arc') {
      const pts = lineCircleIntersections(
        segA,
        segB,
        other.center,
        other.radius,
        false
      );
      for (const pt of pts) {
        const ang = Math.atan2(pt.y - other.center.y, pt.x - other.center.x);
        if (isAngleOnArc(ang, other.startAngle, other.endAngle)) {
          addPoint(pt);
        }
      }
    }
  }

  return ts.sort((a, b) => a - b);
}

/**
 * Find all intersection points on a circle (center, radius) with all other entities.
 */
function findCircleIntersectionPoints(
  center: Point,
  radius: number,
  ignoreEntityId: string,
  allEntities: CadEntity[]
): Point[] {
  const pts: Point[] = [];
  const leaves = flattenEntities(
    allEntities.filter((e) => e.id !== ignoreEntityId)
  );

  for (const other of leaves) {
    if (other.id === ignoreEntityId) continue;

    const otherSegs = getEntitySegments(other);
    for (const [o1, o2] of otherSegs) {
      const hits = lineCircleIntersections(o1, o2, center, radius, false);
      pts.push(...hits);
    }

    if (other.type === 'circle') {
      const hits = circleCircleIntersections(
        center,
        radius,
        other.center,
        other.radius
      );
      pts.push(...hits);
    } else if (other.type === 'arc') {
      const hits = circleCircleIntersections(
        center,
        radius,
        other.center,
        other.radius
      );
      for (const h of hits) {
        const ang = Math.atan2(h.y - other.center.y, h.x - other.center.x);
        if (isAngleOnArc(ang, other.startAngle, other.endAngle)) {
          pts.push(h);
        }
      }
    }
  }

  return pts;
}

export interface TrimResult {
  cutSegment?: [Point, Point];
  cutArc?: {
    center: Point;
    radius: number;
    startAngle: number;
    endAngle: number;
  };
  replacementEntities: CadEntity[];
}

/**
 * Compute Trim (剪切) operation on a target entity (Line, Polyline, Rectangle, Polygon, Circle, or 3-Point Arc) at clickPt.
 */
export function computeTrimResult(
  clickPt: Point,
  target: CadEntity,
  allEntities: CadEntity[]
): TrimResult | null {
  // 1. Circle Trimming -> converts trimmed circle into an ArcEntity!
  if (target.type === 'circle') {
    const rawPts = findCircleIntersectionPoints(
      target.center,
      target.radius,
      target.id,
      allEntities
    );
    const angles: number[] = [];
    for (const pt of rawPts) {
      const ang = normalizeAngle(
        Math.atan2(pt.y - target.center.y, pt.x - target.center.x)
      );
      if (
        !angles.some(
          (a) =>
            Math.abs(a - ang) < 0.015 ||
            Math.abs(Math.abs(a - ang) - Math.PI * 2) < 0.015
        )
      ) {
        angles.push(ang);
      }
    }
    angles.sort((a, b) => a - b);

    // If circle has fewer than 2 intersections, cannot split into arc
    if (angles.length < 2) {
      return null;
    }

    const clickAng = normalizeAngle(
      Math.atan2(clickPt.y - target.center.y, clickPt.x - target.center.x)
    );

    // Find which CCW sector [angles[i], angles[(i+1)%n]] contains clickAng
    let sectorIdx = angles.length - 1;
    for (let i = 0; i < angles.length - 1; i++) {
      if (clickAng >= angles[i] && clickAng <= angles[i + 1]) {
        sectorIdx = i;
        break;
      }
    }

    const cutStart = angles[sectorIdx];
    const cutEnd = angles[(sectorIdx + 1) % angles.length];

    // Remaining arc goes CCW from cutEnd to cutStart
    const remArcBase = {
      center: target.center,
      radius: target.radius,
      startAngle: cutEnd,
      endAngle: cutStart,
    };
    const [p1, p2, p3] = getArcThreePoints(remArcBase);

    const replacementArc: ArcEntity = {
      id: `${target.id}_trim_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      type: 'arc',
      layerId: target.layerId,
      color: target.color,
      lineType: target.lineType,
      lineWeight: target.lineWeight,
      center: target.center,
      radius: target.radius,
      startAngle: cutEnd,
      endAngle: cutStart,
      p1,
      p2,
      p3,
    };

    return {
      cutArc: {
        center: target.center,
        radius: target.radius,
        startAngle: cutStart,
        endAngle: cutEnd,
      },
      replacementEntities: [replacementArc],
    };
  }

  // 2. 3-Point Arc Trimming -> trims the sub-arc between intersections!
  if (target.type === 'arc') {
    const s = normalizeAngle(target.startAngle);
    const e = normalizeAngle(target.endAngle);
    const totalSweep = normalizeAngle(e - s);
    if (totalSweep < 0.02) return null;

    const rawPts = findCircleIntersectionPoints(
      target.center,
      target.radius,
      target.id,
      allEntities
    );

    const offsets: number[] = [];
    for (const pt of rawPts) {
      const ang = normalizeAngle(
        Math.atan2(pt.y - target.center.y, pt.x - target.center.x)
      );
      const rel = normalizeAngle(ang - s);
      if (rel > 0.015 && rel < totalSweep - 0.015) {
        if (!offsets.some((o) => Math.abs(o - rel) < 0.015)) {
          offsets.push(rel);
        }
      }
    }
    offsets.sort((a, b) => a - b);

    const clickAng = normalizeAngle(
      Math.atan2(clickPt.y - target.center.y, clickPt.x - target.center.x)
    );
    const clickRel = Math.max(
      0,
      Math.min(totalSweep, normalizeAngle(clickAng - s))
    );

    const boundaries = [0, ...offsets, totalSweep];
    let intervalIdx = 0;
    for (let i = 0; i < boundaries.length - 1; i++) {
      if (clickRel >= boundaries[i] && clickRel <= boundaries[i + 1]) {
        intervalIdx = i;
        break;
      }
    }

    const dStart = boundaries[intervalIdx];
    const dEnd = boundaries[intervalIdx + 1];
    const cutStart = normalizeAngle(s + dStart);
    const cutEnd = normalizeAngle(s + dEnd);

    const replacementEntities: CadEntity[] = [];

    const makeSubArc = (subStart: number, subEnd: number, idx: number): ArcEntity => {
      const [p1, p2, p3] = getArcThreePoints({
        center: target.center,
        radius: target.radius,
        startAngle: subStart,
        endAngle: subEnd,
      });
      return {
        id: `${target.id}_trim_${idx}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        type: 'arc',
        layerId: target.layerId,
        color: target.color,
        lineType: target.lineType,
        lineWeight: target.lineWeight,
        center: target.center,
        radius: target.radius,
        startAngle: subStart,
        endAngle: subEnd,
        p1,
        p2,
        p3,
      };
    };

    if (dStart > 0.015) {
      replacementEntities.push(makeSubArc(s, cutStart, 0));
    }
    if (dEnd < totalSweep - 0.015) {
      replacementEntities.push(makeSubArc(cutEnd, e, 1));
    }

    return {
      cutArc: {
        center: target.center,
        radius: target.radius,
        startAngle: cutStart,
        endAngle: cutEnd,
      },
      replacementEntities,
    };
  }

  // 3. Segment-based entities (Line, Rectangle, Polyline, Polygon)
  const segs = getEntitySegments(target);
  if (segs.length === 0) return null;

  let bestSegIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < segs.length; i++) {
    const d = distToSegment(clickPt, segs[i][0], segs[i][1]);
    if (d < bestDist) {
      bestDist = d;
      bestSegIdx = i;
    }
  }

  const [segA, segB] = segs[bestSegIdx];
  const segLen = dist(segA, segB);
  if (segLen < 1e-3) return null;

  const ts = findSegmentIntersectionsT(segA, segB, target.id, allEntities);

  const dx = segB.x - segA.x;
  const dy = segB.y - segA.y;
  const clickT = Math.max(
    0,
    Math.min(
      1,
      ((clickPt.x - segA.x) * dx + (clickPt.y - segA.y) * dy) /
        (segLen * segLen)
    )
  );

  const lerpPt = (t: number): Point => ({
    x: segA.x + t * dx,
    y: segA.y + t * dy,
  });

  const boundaries = [0, ...ts, 1];
  let intervalIdx = 0;
  for (let i = 0; i < boundaries.length - 1; i++) {
    if (clickT >= boundaries[i] && clickT <= boundaries[i + 1]) {
      intervalIdx = i;
      break;
    }
  }

  const tStart = boundaries[intervalIdx];
  const tEnd = boundaries[intervalIdx + 1];
  const cutSegment: [Point, Point] = [lerpPt(tStart), lerpPt(tEnd)];

  const remainingSegments: Array<[Point, Point]> = [];
  for (let i = 0; i < segs.length; i++) {
    if (i !== bestSegIdx) {
      remainingSegments.push(segs[i]);
    } else {
      if (tStart > 0.005) {
        remainingSegments.push([segA, lerpPt(tStart)]);
      }
      if (tEnd < 0.995) {
        remainingSegments.push([lerpPt(tEnd), segB]);
      }
    }
  }

  const replacementEntities: CadEntity[] = remainingSegments.map(
    ([p1, p2], idx) => ({
      id: `${target.id}_trim_${idx}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      type: 'line',
      layerId: target.layerId,
      color: target.color,
      lineType: target.lineType,
      lineWeight: target.lineWeight,
      p1,
      p2,
    })
  );

  return { cutSegment, replacementEntities };
}

/**
 * Compute Extend (延伸) operation on a line, open polyline, or 3-point arc near clickPt.
 */
export function computeExtendResult(
  clickPt: Point,
  target: CadEntity,
  allEntities: CadEntity[]
): {
  extensionSegment: [Point, Point];
  updatedEntity: CadEntity;
} | null {
  if (target.type !== 'line' && (target.type !== 'polyline' || target.closed)) {
    return null;
  }

  let rayOrigin: Point;
  let rayDir: Point;
  let extendStart = false;

  if (target.type === 'line') {
    const d1 = dist(clickPt, target.p1);
    const d2 = dist(clickPt, target.p2);
    const len = dist(target.p1, target.p2);
    if (len < 1e-4) return null;
    if (d1 < d2) {
      extendStart = true;
      rayOrigin = target.p1;
      rayDir = {
        x: (target.p1.x - target.p2.x) / len,
        y: (target.p1.y - target.p2.y) / len,
      };
    } else {
      extendStart = false;
      rayOrigin = target.p2;
      rayDir = {
        x: (target.p2.x - target.p1.x) / len,
        y: (target.p2.y - target.p1.y) / len,
      };
    }
  } else {
    const pts = target.points;
    if (pts.length < 2) return null;
    const dStart = dist(clickPt, pts[0]);
    const dEnd = dist(clickPt, pts[pts.length - 1]);
    if (dStart < dEnd) {
      extendStart = true;
      rayOrigin = pts[0];
      const len = dist(pts[0], pts[1]);
      if (len < 1e-4) return null;
      rayDir = {
        x: (pts[0].x - pts[1].x) / len,
        y: (pts[0].y - pts[1].y) / len,
      };
    } else {
      extendStart = false;
      const last = pts[pts.length - 1];
      const prev = pts[pts.length - 2];
      rayOrigin = last;
      const len = dist(last, prev);
      if (len < 1e-4) return null;
      rayDir = {
        x: (last.x - prev.x) / len,
        y: (last.y - prev.y) / len,
      };
    }
  }

  let bestHit: Point | null = null;
  let bestHitDist = Infinity;

  const considerHit = (pt: Point) => {
    const d = dist(rayOrigin, pt);
    if (d > 0.05 && d < bestHitDist) {
      bestHitDist = d;
      bestHit = pt;
    }
  };

  const farRayPt = {
    x: rayOrigin.x + rayDir.x * 10000,
    y: rayOrigin.y + rayDir.y * 10000,
  };

  const leaves = flattenEntities(
    allEntities.filter((e) => e.id !== target.id)
  );

  for (const other of leaves) {
    if (other.id === target.id) continue;

    const otherSegs = getEntitySegments(other);
    for (const [s1, s2] of otherSegs) {
      const hit = raySegmentIntersection(rayOrigin, rayDir, s1, s2);
      if (hit) considerHit(hit);
    }

    if (other.type === 'circle') {
      const hits = lineCircleIntersections(
        rayOrigin,
        farRayPt,
        other.center,
        other.radius,
        false
      );
      hits.forEach(considerHit);
    } else if (other.type === 'arc') {
      const hits = lineCircleIntersections(
        rayOrigin,
        farRayPt,
        other.center,
        other.radius,
        false
      );
      for (const h of hits) {
        const ang = Math.atan2(h.y - other.center.y, h.x - other.center.x);
        if (isAngleOnArc(ang, other.startAngle, other.endAngle)) {
          considerHit(h);
        }
      }
    }
  }

  if (!bestHit) return null;

  if (target.type === 'line') {
    const updatedEntity: LineEntity = extendStart
      ? { ...target, p1: bestHit }
      : { ...target, p2: bestHit };
    return {
      extensionSegment: [rayOrigin, bestHit],
      updatedEntity,
    };
  } else {
    const nextPts = [...target.points];
    if (extendStart) nextPts[0] = bestHit;
    else nextPts[nextPts.length - 1] = bestHit;
    const updatedEntity: PolylineEntity = { ...target, points: nextPts };
    return {
      extensionSegment: [rayOrigin, bestHit],
      updatedEntity,
    };
  }
}

/**
 * Compute intersection of two infinite lines (a1-a2) and (b1-b2)
 */
export function infiniteLineIntersection(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point
): Point | null {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-7) return null;
  const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denom;
  return {
    x: a1.x + t * dax,
    y: a1.y + t * day,
  };
}

/**
 * Helper to extract an extendable end-segment from a LineEntity or open PolylineEntity near clickPt
 */
function getExtendableEndSegment(
  ent: CadEntity,
  clickPt: Point
): {
  fixedPt: Point;
  movingPt: Point;
  applyPoint: (newPt: Point) => CadEntity;
} | null {
  if (ent.type === 'line') {
    return {
      fixedPt: ent.p1,
      movingPt: ent.p2,
      applyPoint: (newPt: Point) => {
        // Move whichever endpoint is closer to newPt (so line lengthens toward intersection)
        const d1 = dist(ent.p1, newPt);
        const d2 = dist(ent.p2, newPt);
        return d1 < d2 ? { ...ent, p1: newPt } : { ...ent, p2: newPt };
      },
    };
  }
  if (ent.type === 'polyline' && !ent.closed && ent.points.length >= 2) {
    const pts = ent.points;
    const dStart = dist(clickPt, pts[0]);
    const dEnd = dist(clickPt, pts[pts.length - 1]);
    if (dStart < dEnd) {
      return {
        fixedPt: pts[1],
        movingPt: pts[0],
        applyPoint: (newPt: Point) => {
          const nextPts = [...pts];
          nextPts[0] = newPt;
          return { ...ent, points: nextPts };
        },
      };
    } else {
      return {
        fixedPt: pts[pts.length - 2],
        movingPt: pts[pts.length - 1],
        applyPoint: (newPt: Point) => {
          const nextPts = [...pts];
          nextPts[nextPts.length - 1] = newPt;
          return { ...ent, points: nextPts };
        },
      };
    }
  }
  return null;
}

/**
 * Compute Mutual Extend (點選兩個線段互相延伸) between two entities (firstEnt and secondEnt).
 * Both line segments extend to meet at their virtual intersection point!
 */
export function computeMutualExtendResult(
  firstEnt: CadEntity,
  firstClickPt: Point,
  secondEnt: CadEntity,
  secondClickPt: Point
): {
  intersectionPoint: Point;
  extensionSegments: Array<[Point, Point]>;
  updatedEntities: CadEntity[];
} | null {
  if (firstEnt.id === secondEnt.id) return null;

  const seg1 = getExtendableEndSegment(firstEnt, firstClickPt);
  const seg2 = getExtendableEndSegment(secondEnt, secondClickPt);

  if (seg1 && seg2) {
    const pInt = infiniteLineIntersection(
      seg1.fixedPt,
      seg1.movingPt,
      seg2.fixedPt,
      seg2.movingPt
    );
    if (!pInt) return null;
    if (
      dist(seg1.movingPt, pInt) > 25000 ||
      dist(seg2.movingPt, pInt) > 25000
    ) {
      return null;
    }

    const extensionSegments: Array<[Point, Point]> = [];
    const updatedEntities: CadEntity[] = [];

    // Check if firstEnt needs to extend to pInt
    const onFirst =
      distToSegment(pInt, seg1.fixedPt, seg1.movingPt) <= 0.05;
    if (!onFirst) {
      const startPt1 =
        firstEnt.type === 'line'
          ? dist(firstEnt.p1, pInt) < dist(firstEnt.p2, pInt)
            ? firstEnt.p1
            : firstEnt.p2
          : seg1.movingPt;
      extensionSegments.push([startPt1, pInt]);
      updatedEntities.push(seg1.applyPoint(pInt));
    }

    // Check if secondEnt needs to extend to pInt
    const onSecond =
      distToSegment(pInt, seg2.fixedPt, seg2.movingPt) <= 0.05;
    if (!onSecond) {
      const startPt2 =
        secondEnt.type === 'line'
          ? dist(secondEnt.p1, pInt) < dist(secondEnt.p2, pInt)
            ? secondEnt.p1
            : secondEnt.p2
          : seg2.movingPt;
      extensionSegments.push([startPt2, pInt]);
      updatedEntities.push(seg2.applyPoint(pInt));
    }

    if (extensionSegments.length === 0) return null;

    return {
      intersectionPoint: pInt,
      extensionSegments,
      updatedEntities,
    };
  }

  // Fallback: if firstEnt is extendable and secondEnt is a boundary (e.g. circle, arc, rectangle)
  const singleRes = computeExtendResult(firstClickPt, firstEnt, [secondEnt]);
  if (singleRes) {
    return {
      intersectionPoint: singleRes.extensionSegment[1],
      extensionSegments: [singleRes.extensionSegment],
      updatedEntities: [singleRes.updatedEntity],
    };
  }

  return null;
}

export interface CornerOperationResult {
  intersectionPoint: Point;
  t1: Point;
  t2: Point;
  trimmedSegments: Array<[Point, Point]>;
  cornerEntity: CadEntity | null;
  removedEntityIds: string[];
  replacementEntities: CadEntity[];
}

function findClosestSegmentIndex(
  segs: Array<[Point, Point]>,
  pt: Point
): number {
  let bestIdx = 0;
  let bestD = Infinity;
  for (let i = 0; i < segs.length; i++) {
    const d = distToSegment(pt, segs[i][0], segs[i][1]);
    if (d < bestD) {
      bestD = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function selectKeepAndTrimEndpoints(
  a1: Point,
  a2: Point,
  pInt: Point,
  clickPt: Point
): { keepPt: Point; trimPt: Point; moveFirstEndpoint: boolean } {
  const dotEnds =
    (a1.x - pInt.x) * (a2.x - pInt.x) + (a1.y - pInt.y) * (a2.y - pInt.y);
  if (dotEnds < -1e-4) {
    const proj = projectPointOnSegment(clickPt, a1, a2);
    const dotClickA1 =
      (proj.x - pInt.x) * (a1.x - pInt.x) +
      (proj.y - pInt.y) * (a1.y - pInt.y);
    if (dotClickA1 >= 0) {
      return { keepPt: a1, trimPt: a2, moveFirstEndpoint: false };
    } else {
      return { keepPt: a2, trimPt: a1, moveFirstEndpoint: true };
    }
  }
  const d1 = dist(a1, pInt);
  const d2 = dist(a2, pInt);
  if (d1 >= d2) {
    return { keepPt: a1, trimPt: a2, moveFirstEndpoint: false };
  } else {
    return { keepPt: a2, trimPt: a1, moveFirstEndpoint: true };
  }
}

function computeCornerOperation(
  mode: 'chamfer' | 'fillet',
  param: number,
  firstEnt: CadEntity,
  firstClickPt: Point,
  secondEnt: CadEntity,
  secondClickPt: Point
): CornerOperationResult | null {
  const segs1 = getEntitySegments(firstEnt);
  const segs2 = getEntitySegments(secondEnt);
  if (segs1.length === 0 || segs2.length === 0) return null;

  const idx1 = findClosestSegmentIndex(segs1, firstClickPt);
  let idx2 = findClosestSegmentIndex(segs2, secondClickPt);

  // If clicking/hovering on the same multi-segment entity (e.g. rectangle/polygon/polyline) and same segment,
  // pick the adjacent segment sharing the corner closest to secondClickPt
  if (firstEnt.id === secondEnt.id && idx1 === idx2) {
    if (segs1.length < 2) return null;
    const [sA, sB] = segs1[idx1];
    const targetCorner =
      dist(secondClickPt, sA) < dist(secondClickPt, sB) ? sA : sB;
    let adjIdx = -1;
    let adjDist = Infinity;
    for (let i = 0; i < segs1.length; i++) {
      if (i === idx1) continue;
      const d = Math.min(
        dist(segs1[i][0], targetCorner),
        dist(segs1[i][1], targetCorner)
      );
      if (d < adjDist) {
        adjDist = d;
        adjIdx = i;
      }
    }
    if (adjIdx === -1) return null;
    idx2 = adjIdx;
  }

  const [a1, a2] = segs1[idx1];
  const [b1, b2] = segs2[idx2];

  const pInt = infiniteLineIntersection(a1, a2, b1, b2);
  if (!pInt) return null;
  if (dist(a1, pInt) > 50000 || dist(b1, pInt) > 50000) return null;

  const end1 = selectKeepAndTrimEndpoints(a1, a2, pInt, firstClickPt);
  const end2 = selectKeepAndTrimEndpoints(b1, b2, pInt, secondClickPt);

  const len1 = dist(pInt, end1.keepPt);
  const len2 = dist(pInt, end2.keepPt);
  if (len1 < 1e-3 || len2 < 1e-3) return null;

  const u1: Point = {
    x: (end1.keepPt.x - pInt.x) / len1,
    y: (end1.keepPt.y - pInt.y) / len1,
  };
  const u2: Point = {
    x: (end2.keepPt.x - pInt.x) / len2,
    y: (end2.keepPt.y - pInt.y) / len2,
  };

  const cosTheta = Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y));
  const theta = Math.acos(cosTheta);
  if (theta < 1e-3 || Math.abs(Math.PI - theta) < 1e-3) return null;

  let t1: Point;
  let t2: Point;
  let cornerEntity: CadEntity | null = null;
  const nowId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  if (mode === 'chamfer') {
    const d = Math.max(0, param);
    if (d >= len1 - 1e-3 || d >= len2 - 1e-3) return null;
    t1 = { x: pInt.x + u1.x * d, y: pInt.y + u1.y * d };
    t2 = { x: pInt.x + u2.x * d, y: pInt.y + u2.y * d };
    if (d > 1e-4 && dist(t1, t2) > 1e-4) {
      cornerEntity = {
        id: `chamfer_${nowId}`,
        type: 'line',
        layerId: firstEnt.layerId,
        color: firstEnt.color,
        lineType: firstEnt.lineType,
        lineWeight: firstEnt.lineWeight,
        p1: t1,
        p2: t2,
      };
    }
  } else {
    const r = Math.max(0, param);
    if (r <= 1e-4) {
      t1 = pInt;
      t2 = pInt;
    } else {
      const tanHalf = Math.tan(theta / 2);
      const sinHalf = Math.sin(theta / 2);
      if (tanHalf < 1e-5 || sinHalf < 1e-5) return null;
      const tangentDist = r / tanHalf;
      if (tangentDist >= len1 - 1e-3 || tangentDist >= len2 - 1e-3) {
        return null;
      }
      t1 = {
        x: pInt.x + u1.x * tangentDist,
        y: pInt.y + u1.y * tangentDist,
      };
      t2 = {
        x: pInt.x + u2.x * tangentDist,
        y: pInt.y + u2.y * tangentDist,
      };
      const bx = u1.x + u2.x;
      const by = u1.y + u2.y;
      const bLen = Math.hypot(bx, by);
      if (bLen < 1e-5) return null;
      const bisector = { x: bx / bLen, y: by / bLen };
      const centerDist = r / sinHalf;
      const center: Point = {
        x: pInt.x + bisector.x * centerDist,
        y: pInt.y + bisector.y * centerDist,
      };
      const arcMid: Point = {
        x: center.x - bisector.x * r,
        y: center.y - bisector.y * r,
      };
      const arcData = arcFromThreePoints(t1, arcMid, t2);
      if (!arcData) return null;
      cornerEntity = {
        id: `fillet_${nowId}`,
        type: 'arc',
        layerId: firstEnt.layerId,
        color: firstEnt.color,
        lineType: firstEnt.lineType,
        lineWeight: firstEnt.lineWeight,
        center: arcData.center,
        radius: arcData.radius,
        startAngle: arcData.startAngle,
        endAngle: arcData.endAngle,
        p1: t1,
        p2: arcMid,
        p3: t2,
      };
    }
  }

  const trimmedSegments: Array<[Point, Point]> = [
    [t1, pInt],
    [t2, pInt],
  ];

  const buildUpdatedLinesForEntity = (
    ent: CadEntity,
    segs: Array<[Point, Point]>,
    modMap: Map<number, { moveFirst: boolean; newPt: Point }>
  ): CadEntity[] => {
    if (ent.type === 'line' && segs.length === 1 && modMap.has(0)) {
      const mod = modMap.get(0)!;
      return [
        mod.moveFirst
          ? { ...ent, p1: mod.newPt }
          : { ...ent, p2: mod.newPt },
      ];
    }
    return segs.map(([s1, s2], i) => {
      const mod = modMap.get(i);
      const p1 = mod ? (mod.moveFirst ? mod.newPt : s1) : s1;
      const p2 = mod ? (mod.moveFirst ? s2 : mod.newPt) : s2;
      return {
        id: `${ent.id}_seg_${i}_${nowId}`,
        type: 'line',
        layerId: ent.layerId,
        color: ent.color,
        lineType: ent.lineType,
        lineWeight: ent.lineWeight,
        p1,
        p2,
      };
    });
  };

  if (firstEnt.id === secondEnt.id) {
    const modMap = new Map<number, { moveFirst: boolean; newPt: Point }>();
    modMap.set(idx1, { moveFirst: end1.moveFirstEndpoint, newPt: t1 });
    modMap.set(idx2, { moveFirst: end2.moveFirstEndpoint, newPt: t2 });
    const updatedLines = buildUpdatedLinesForEntity(firstEnt, segs1, modMap);
    return {
      intersectionPoint: pInt,
      t1,
      t2,
      trimmedSegments,
      cornerEntity,
      removedEntityIds: [firstEnt.id],
      replacementEntities: cornerEntity
        ? [...updatedLines, cornerEntity]
        : updatedLines,
    };
  } else {
    const modMap1 = new Map<number, { moveFirst: boolean; newPt: Point }>();
    modMap1.set(idx1, { moveFirst: end1.moveFirstEndpoint, newPt: t1 });
    const modMap2 = new Map<number, { moveFirst: boolean; newPt: Point }>();
    modMap2.set(idx2, { moveFirst: end2.moveFirstEndpoint, newPt: t2 });

    const lines1 = buildUpdatedLinesForEntity(firstEnt, segs1, modMap1);
    const lines2 = buildUpdatedLinesForEntity(secondEnt, segs2, modMap2);

    return {
      intersectionPoint: pInt,
      t1,
      t2,
      trimmedSegments,
      cornerEntity,
      removedEntityIds: [firstEnt.id, secondEnt.id],
      replacementEntities: cornerEntity
        ? [...lines1, ...lines2, cornerEntity]
        : [...lines1, ...lines2],
    };
  }
}

/**
 * Compute Chamfer (倒角) between two lines or polyline/rectangle edges.
 */
export function computeChamferResult(
  firstEnt: CadEntity,
  firstClickPt: Point,
  secondEnt: CadEntity,
  secondClickPt: Point,
  chamferDistance: number
): CornerOperationResult | null {
  return computeCornerOperation(
    'chamfer',
    chamferDistance,
    firstEnt,
    firstClickPt,
    secondEnt,
    secondClickPt
  );
}

/**
 * Compute Fillet (導圓角) between two lines or polyline/rectangle edges.
 */
export function computeFilletResult(
  firstEnt: CadEntity,
  firstClickPt: Point,
  secondEnt: CadEntity,
  secondClickPt: Point,
  filletRadius: number
): CornerOperationResult | null {
  return computeCornerOperation(
    'fillet',
    filletRadius,
    firstEnt,
    firstClickPt,
    secondEnt,
    secondClickPt
  );
}

/**
 * Assemble / Join (組裝圖元) multiple selected entities into a single composite GroupEntity.
 * Preserves the exact position, geometry, curves, and style of all selected entities!
 */
export function joinSelectedEntities(
  selectedEntities: CadEntity[],
  layerId: string
): GroupEntity | null {
  if (selectedEntities.length < 2) return null;

  const children: CadEntity[] = [];
  for (const ent of selectedEntities) {
    if (ent.type === 'group') {
      children.push(
        ...ent.children.map((c, idx) => ({
          ...c,
          id: `${c.id}_sub_${idx}_${Date.now()}`,
        }))
      );
    } else {
      children.push({
        ...ent,
        id: `${ent.id}_sub_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      });
    }
  }

  const first = selectedEntities[0];
  return {
    id: `group_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'group',
    layerId: first.layerId || layerId,
    color: first.color,
    lineType: first.lineType,
    lineWeight: first.lineWeight,
    children,
    name: `組裝圖元 (${children.length} 個子圖元)`,
  };
}

/**
 * Explode (炸開圖元):
 * - If entity is a GroupEntity (組裝好的圖元), restores its constituent children at their exact positions!
 * - If entity is a RectangleEntity (轉角或中心矩形), PolylineEntity, or PolygonEntity, explodes into independent LineEntities!
 */
export function explodeEntity(entity: CadEntity): CadEntity[] | null {
  if (entity.type === 'group') {
    return entity.children.map((child, idx) => ({
      ...child,
      id: `${child.id}_exp_${idx}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      layerId: child.layerId || entity.layerId,
      color: child.color ?? entity.color,
      lineType: child.lineType ?? entity.lineType,
      lineWeight: child.lineWeight ?? entity.lineWeight,
    }));
  }

  const segs = getEntitySegments(entity);
  if (segs.length === 0 || entity.type === 'line') return null;
  return segs.map(([p1, p2], idx) => ({
    id: `${entity.id}_exp_${idx}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    type: 'line',
    layerId: entity.layerId,
    color: entity.color,
    lineType: entity.lineType,
    lineWeight: entity.lineWeight,
    p1: { ...p1 },
    p2: { ...p2 },
  }));
}

export function findBestSnapPoint(
  cursorWorld: Point,
  entities: CadEntity[],
  layers: CadLayer[],
  settings: DraftingSettings,
  zoom: number
): SnapPoint | null {
  const visibleLayerIds = new Set(
    layers.filter((l) => l.visible).map((l) => l.id)
  );
  const topVisible = entities.filter((e) => visibleLayerIds.has(e.layerId));
  const visibleEntities = flattenEntities(topVisible);

  const maxSnapDist = 14 / zoom;
  let bestSnap: SnapPoint | null = null;
  let bestDist = maxSnapDist;

  const consider = (
    pt: Point,
    type: SnapPoint['type'],
    label: string,
    entityId?: string,
    alignGuideLine?: [Point, Point]
  ) => {
    const d = dist(cursorWorld, pt);
    if (d < bestDist) {
      bestDist = d;
      bestSnap = { point: pt, type, label, entityId, alignGuideLine };
    }
  };

  if (settings.osnap) {
    const allSegments: Array<[Point, Point]> = [];

    for (const ent of visibleEntities) {
      const segs = getEntitySegments(ent);
      allSegments.push(...segs);

      if (settings.osnapModes.endpoint) {
        for (const [s, e] of segs) {
          consider(s, 'endpoint', '端點 (Endpoint)', ent.id);
          consider(e, 'endpoint', '端點 (Endpoint)', ent.id);
        }
        if (ent.type === 'arc') {
          const [p1, p2, p3] = getArcThreePoints(ent);
          consider(p1, 'endpoint', '圓弧起點 (P1)', ent.id);
          consider(p2, 'midpoint', '圓弧中點 (P2)', ent.id);
          consider(p3, 'endpoint', '圓弧終點 (P3)', ent.id);
        }
        if (ent.type === 'dimension') {
          consider(ent.p1, 'endpoint', '標註原點 (Endpoint)', ent.id);
          consider(ent.p2, 'endpoint', '標註原點 (Endpoint)', ent.id);
          const { dimP1, dimP2, mid } = getDimensionLinePoints(ent);
          consider(
            dimP1,
            'dimAlign',
            '標註線對齊點 (Dim Align)',
            ent.id,
            [dimP1, dimP2]
          );
          consider(
            dimP2,
            'dimAlign',
            '標註線對齊點 (Dim Align)',
            ent.id,
            [dimP1, dimP2]
          );
          consider(
            mid,
            'dimAlign',
            '標註線對齊中點 (Dim Align)',
            ent.id,
            [dimP1, dimP2]
          );
        }
      }

      if (settings.osnapModes.midpoint) {
        for (const [s, e] of segs) {
          consider(midpoint(s, e), 'midpoint', '中點 (Midpoint)', ent.id);
        }
      }

      if (settings.osnapModes.center) {
        if (
          ent.type === 'circle' ||
          ent.type === 'arc' ||
          ent.type === 'polygon'
        ) {
          consider(ent.center, 'center', '圓心 (Center)', ent.id);
        } else if (ent.type === 'rectangle') {
          consider(
            midpoint(ent.p1, ent.p2),
            'center',
            '幾何中心 (Center)',
            ent.id
          );
        }
      }

      if (settings.osnapModes.quadrant) {
        if (ent.type === 'circle') {
          const { center, radius } = ent;
          consider(
            { x: center.x + radius, y: center.y },
            'quadrant',
            '四分點 (Quadrant)',
            ent.id
          );
          consider(
            { x: center.x - radius, y: center.y },
            'quadrant',
            '四分點 (Quadrant)',
            ent.id
          );
          consider(
            { x: center.x, y: center.y + radius },
            'quadrant',
            '四分點 (Quadrant)',
            ent.id
          );
          consider(
            { x: center.x, y: center.y - radius },
            'quadrant',
            '四分點 (Quadrant)',
            ent.id
          );
        }
      }
    }

    if (settings.osnapModes.intersection && allSegments.length <= 180) {
      for (let i = 0; i < allSegments.length; i++) {
        for (let j = i + 1; j < allSegments.length; j++) {
          const pt = segmentIntersection(
            allSegments[i][0],
            allSegments[i][1],
            allSegments[j][0],
            allSegments[j][1]
          );
          if (pt) {
            consider(pt, 'intersection', '交點 (Intersection)');
          }
        }
      }
    }
  }

  if (bestSnap) return bestSnap;

  if (settings.snap && settings.snapStep > 0) {
    const step = settings.snapStep;
    const gx = Math.round(cursorWorld.x / step) * step;
    const gy = Math.round(cursorWorld.y / step) * step;
    return {
      point: { x: gx, y: gy },
      type: 'grid',
      label: `網格鎖點 (${step}mm)`,
    };
  }

  return null;
}

/**
 * When placing or dragging a DimensionEntity's offsetPoint, check if it is close to aligning with any existing DimensionEntity's line.
 * Returns a snapped offsetPoint and an alignment guide line so multiple dimensions align cleanly.
 */
export function snapDimensionOffsetToExisting(
  p1: Point,
  p2: Point,
  rawOffsetPt: Point,
  entities: CadEntity[],
  zoom: number,
  ignoreId?: string
): {
  offsetPoint: Point;
  alignGuide: [Point, Point] | null;
} {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return { offsetPoint: rawOffsetPt, alignGuide: null };

  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const curOffsetDist =
    (rawOffsetPt.x - p1.x) * nx + (rawOffsetPt.y - p1.y) * ny;
  const curMid = midpoint(
    { x: p1.x + nx * curOffsetDist, y: p1.y + ny * curOffsetDist },
    { x: p2.x + nx * curOffsetDist, y: p2.y + ny * curOffsetDist }
  );

  const tol = 12 / zoom;
  let bestDiff = tol;
  let bestOffsetPt = rawOffsetPt;
  let bestGuide: [Point, Point] | null = null;

  const leaves = flattenEntities(entities);
  for (const ent of leaves) {
    if (ent.type !== 'dimension' || ent.id === ignoreId) continue;
    const otherDim = getDimensionLinePoints(ent);

    // Project existing dimension's dimP1 onto this dimension's normal vector (nx, ny)
    const targetOffsetDist =
      (otherDim.dimP1.x - p1.x) * nx + (otherDim.dimP1.y - p1.y) * ny;
    const diff = Math.abs(curOffsetDist - targetOffsetDist);
    if (diff < bestDiff) {
      bestDiff = diff;
      const snappedMid = {
        x: (p1.x + p2.x) / 2 + nx * targetOffsetDist,
        y: (p1.y + p2.y) / 2 + ny * targetOffsetDist,
      };
      bestOffsetPt = snappedMid;
      bestGuide = [otherDim.mid, snappedMid];
    }
  }

  return { offsetPoint: bestOffsetPt, alignGuide: bestGuide };
}

/**
 * Align multiple selected DimensionEntities so they all share the first selected dimension's offset line.
 */
export function alignSelectedDimensions(
  entities: CadEntity[],
  selectedIds: string[]
): { updated: CadEntity[]; alignedCount: number } {
  const selectedDims = entities.filter(
    (e): e is DimensionEntity =>
      selectedIds.includes(e.id) && e.type === 'dimension'
  );
  if (selectedDims.length < 2) {
    return { updated: entities, alignedCount: 0 };
  }

  const refDim = selectedDims[0];
  const refLine = getDimensionLinePoints(refDim);

  const updated = entities.map((ent) => {
    if (
      !selectedIds.includes(ent.id) ||
      ent.type !== 'dimension' ||
      ent.id === refDim.id
    ) {
      return ent;
    }
    return {
      ...ent,
      offsetPoint: { ...refLine.mid },
    };
  });

  return { updated, alignedCount: selectedDims.length };
}

export function applyOrthoAndPolar(
  anchor: Point | null,
  target: Point,
  settings: DraftingSettings
): { point: Point; guideAngle: number | null } {
  if (!anchor) return { point: target, guideAngle: null };

  const dx = target.x - anchor.x;
  const dy = target.y - anchor.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-5) return { point: target, guideAngle: null };

  if (settings.ortho) {
    if (Math.abs(dx) >= Math.abs(dy)) {
      const angle = dx >= 0 ? 0 : 180;
      return {
        point: { x: target.x, y: anchor.y },
        guideAngle: angle,
      };
    } else {
      const angle = dy >= 0 ? 90 : 270;
      return {
        point: { x: anchor.x, y: target.y },
        guideAngle: angle,
      };
    }
  }

  if (settings.polar) {
    const rawDeg = angleDegrees(anchor, target);
    const step = settings.polarAngle || 45;
    const nearestMultiple = Math.round(rawDeg / step) * step;
    const diff = Math.abs(rawDeg - nearestMultiple);
    if (diff <= 5) {
      const rad = (nearestMultiple % 360) * DEG_TO_RAD;
      return {
        point: {
          x: anchor.x + d * Math.cos(rad),
          y: anchor.y + d * Math.sin(rad),
        },
        guideAngle: nearestMultiple % 360,
      };
    }
  }

  return { point: target, guideAngle: null };
}

export function isPointNearEntity(
  p: Point,
  entity: CadEntity,
  tolerance: number
): boolean {
  switch (entity.type) {
    case 'line':
      return distToSegment(p, entity.p1, entity.p2) <= tolerance;
    case 'rectangle':
    case 'polyline':
    case 'polygon': {
      const segs = getEntitySegments(entity);
      return segs.some(([a, b]) => distToSegment(p, a, b) <= tolerance);
    }
    case 'circle': {
      const d = dist(p, entity.center);
      return Math.abs(d - entity.radius) <= tolerance;
    }
    case 'arc': {
      const d = dist(p, entity.center);
      if (Math.abs(d - entity.radius) > tolerance) return false;
      const angle = Math.atan2(p.y - entity.center.y, p.x - entity.center.x);
      return isAngleOnArc(angle, entity.startAngle, entity.endAngle, 0.05);
    }
    case 'dimension': {
      const { dimP1, dimP2 } = getDimensionLinePoints(entity);
      return (
        distToSegment(p, dimP1, dimP2) <= tolerance * 1.5 ||
        distToSegment(p, entity.p1, dimP1) <= tolerance ||
        distToSegment(p, entity.p2, dimP2) <= tolerance
      );
    }
    case 'text': {
      const approxWidth = Math.max(
        20,
        entity.content.length * entity.fontSize * 0.65
      );
      const approxHeight = entity.fontSize * 1.3;
      return (
        p.x >= entity.position.x - tolerance &&
        p.x <= entity.position.x + approxWidth + tolerance &&
        p.y >= entity.position.y - approxHeight / 2 - tolerance &&
        p.y <= entity.position.y + approxHeight / 2 + tolerance
      );
    }
    case 'hatch': {
      if (
        entity.boundaryType === 'circle' &&
        entity.center &&
        entity.radius
      ) {
        const d = dist(p, entity.center);
        if (d <= entity.radius + tolerance) {
          if (Math.abs(d - entity.radius) <= tolerance) return true;
          const hatchSegs = getHatchSegments(entity);
          return hatchSegs.some(([a, b]) => distToSegment(p, a, b) <= tolerance * 1.5);
        }
        return false;
      }
      const segs = getEntitySegments(entity);
      if (segs.some(([a, b]) => distToSegment(p, a, b) <= tolerance)) {
        return true;
      }
      const hatchSegs = getHatchSegments(entity);
      return hatchSegs.some(([a, b]) => distToSegment(p, a, b) <= tolerance * 1.5);
    }
    case 'group': {
      return entity.children.some((child) =>
        isPointNearEntity(p, child, tolerance)
      );
    }
    default:
      return false;
  }
}

export function getDimensionLinePoints(entity: {
  p1: Point;
  p2: Point;
  offsetPoint: Point;
  dimMode?: 'linear' | 'diameter';
  textOverride?: string;
}): {
  dimP1: Point;
  dimP2: Point;
  mid: Point;
  angle: number;
  length: number;
  isDiameter: boolean;
  center: Point;
  leaderOutside: boolean;
  leaderElbow?: Point;
  leaderLanding?: Point;
} {
  const dx = entity.p2.x - entity.p1.x;
  const dy = entity.p2.y - entity.p1.y;
  const len = Math.hypot(dx, dy);
  const center = midpoint(entity.p1, entity.p2);

  if (len < 1e-5) {
    return {
      dimP1: entity.p1,
      dimP2: entity.p2,
      mid: entity.p1,
      angle: 0,
      length: 0,
      isDiameter: false,
      center: entity.p1,
      leaderOutside: false,
    };
  }

  const isDiameter = entity.dimMode === 'diameter';

  if (isDiameter) {
    const radius = len / 2;
    const odx = entity.offsetPoint.x - center.x;
    const ody = entity.offsetPoint.y - center.y;
    const distFromCenter = Math.hypot(odx, ody);
    // International standard ISO 129-1 diameter line passes through circle center at an oblique angle (default 30°)
    const dirAngle =
      distFromCenter > 1e-3 ? Math.atan2(ody, odx) : 30 * DEG_TO_RAD;
    const dimP1 = {
      x: center.x - radius * Math.cos(dirAngle),
      y: center.y - radius * Math.sin(dirAngle),
    };
    const dimP2 = {
      x: center.x + radius * Math.cos(dirAngle),
      y: center.y + radius * Math.sin(dirAngle),
    };

    const leaderOutside = distFromCenter > radius * 1.05;
    if (leaderOutside) {
      const shelfSign = Math.cos(dirAngle) >= 0 ? 1 : -1;
      const shelfLen = Math.max(18, radius * 0.35);
      const leaderElbow = { ...entity.offsetPoint };
      const leaderLanding = {
        x: leaderElbow.x + shelfSign * shelfLen,
        y: leaderElbow.y,
      };
      return {
        dimP1,
        dimP2,
        mid: {
          x: leaderElbow.x + (shelfSign * shelfLen) / 2,
          y: leaderElbow.y,
        },
        angle: dirAngle,
        length: len,
        isDiameter: true,
        center,
        leaderOutside: true,
        leaderElbow,
        leaderLanding,
      };
    }

    const midPt =
      distFromCenter > 1e-3 && distFromCenter < radius * 0.65
        ? entity.offsetPoint
        : center;

    return {
      dimP1,
      dimP2,
      mid: midPt,
      angle: dirAngle,
      length: len,
      isDiameter: true,
      center,
      leaderOutside: false,
    };
  }

  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const offsetDist =
    (entity.offsetPoint.x - entity.p1.x) * nx +
    (entity.offsetPoint.y - entity.p1.y) * ny;
  const dimP1 = {
    x: entity.p1.x + nx * offsetDist,
    y: entity.p1.y + ny * offsetDist,
  };
  const dimP2 = {
    x: entity.p2.x + nx * offsetDist,
    y: entity.p2.y + ny * offsetDist,
  };
  return {
    dimP1,
    dimP2,
    mid: midpoint(dimP1, dimP2),
    angle: Math.atan2(dy, dx),
    length: len,
    isDiameter: false,
    center,
    leaderOutside: false,
  };
}

export function formatToleranceNumber(val: number, forceSign = true): string {
  if (!Number.isFinite(val)) return '0';
  const rounded = Math.round(val * 100) / 100;
  if (Math.abs(rounded) < 1e-6) return '0';
  const sign = rounded > 0 ? (forceSign ? '+' : '') : '-';
  const absVal = Math.abs(rounded);
  return `${sign}${absVal.toFixed(2)}`;
}

export function formatDimensionLabel(
  entity: {
    p1: Point;
    p2: Point;
    dimMode?: 'linear' | 'diameter';
    precision?: 0 | 1 | 2;
    toleranceMode?: 'none' | 'symmetric' | 'deviation';
    toleranceUpper?: number;
    toleranceLower?: number;
    textOverride?: string;
  },
  computedLength?: number
): {
  mainText: string;
  symmetricText: string | null;
  upperText: string | null;
  lowerText: string | null;
  fullText: string;
} {
  const len = computedLength ?? dist(entity.p1, entity.p2);
  const prec: 0 | 1 | 2 =
    entity.precision === 0 || entity.precision === 1 || entity.precision === 2
      ? entity.precision
      : 1;
  const isDia = entity.dimMode === 'diameter';
  const baseNum = len.toFixed(prec);
  const mainText =
    entity.textOverride && entity.textOverride.trim() !== ''
      ? entity.textOverride.trim()
      : isDia
        ? `Ø${baseNum}`
        : `${baseNum}`;

  const tolMode = entity.toleranceMode || 'none';
  if (tolMode === 'symmetric') {
    const rawTol = Math.abs(entity.toleranceUpper ?? 0.05);
    const tolVal = rawTol < 1e-6 ? 0 : Math.max(0.01, rawTol);
    const symStr = tolVal === 0 ? '±0' : `±${tolVal.toFixed(2)}`;
    return {
      mainText,
      symmetricText: symStr,
      upperText: null,
      lowerText: null,
      fullText: `${mainText} ${symStr}`,
    };
  }

  if (tolMode === 'deviation') {
    const upVal =
      entity.toleranceUpper !== undefined ? entity.toleranceUpper : 0.05;
    const lowVal =
      entity.toleranceLower !== undefined ? entity.toleranceLower : -0.05;
    const upStr = formatToleranceNumber(upVal, true);
    const lowStr = formatToleranceNumber(lowVal, true);
    return {
      mainText,
      symmetricText: null,
      upperText: upStr,
      lowerText: lowStr,
      fullText: `${mainText} (${upStr}/${lowStr})`,
    };
  }

  return {
    mainText,
    symmetricText: null,
    upperText: null,
    lowerText: null,
    fullText: mainText,
  };
}

export function getSelectionReferencePoint(
  selectedEntities: CadEntity[]
): Point {
  if (selectedEntities.length === 0) return { x: 0, y: 0 };
  if (selectedEntities.length === 1) {
    const ent = selectedEntities[0];
    if (ent.type === 'circle' || ent.type === 'polygon' || ent.type === 'arc') {
      return { ...ent.center };
    }
    if (ent.type === 'line') {
      return midpoint(ent.p1, ent.p2);
    }
    if (ent.type === 'text') {
      return { ...ent.position };
    }
  }
  const bounds = selectedEntities.map(getEntityBounds);
  const minX = Math.min(...bounds.map((b) => b.minX));
  const maxX = Math.max(...bounds.map((b) => b.maxX));
  const minY = Math.min(...bounds.map((b) => b.minY));
  const maxY = Math.max(...bounds.map((b) => b.maxY));
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

export function getEntityBounds(entity: CadEntity): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  if (!entity || typeof entity !== 'object') {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  switch (entity.type) {
    case 'line':
      return {
        minX: Math.min(entity.p1.x, entity.p2.x),
        minY: Math.min(entity.p1.y, entity.p2.y),
        maxX: Math.max(entity.p1.x, entity.p2.x),
        maxY: Math.max(entity.p1.y, entity.p2.y),
      };
    case 'rectangle':
      return {
        minX: Math.min(entity.p1.x, entity.p2.x),
        minY: Math.min(entity.p1.y, entity.p2.y),
        maxX: Math.max(entity.p1.x, entity.p2.x),
        maxY: Math.max(entity.p1.y, entity.p2.y),
      };
    case 'polyline': {
      if (!entity.points || entity.points.length === 0) {
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      }
      const xs = entity.points.map((p) => p.x);
      const ys = entity.points.map((p) => p.y);
      return {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
      };
    }
    case 'circle':
    case 'arc':
    case 'polygon':
      return {
        minX: entity.center.x - entity.radius,
        minY: entity.center.y - entity.radius,
        maxX: entity.center.x + entity.radius,
        maxY: entity.center.y + entity.radius,
      };
    case 'dimension': {
      const { dimP1, dimP2 } = getDimensionLinePoints(entity);
      const xs = [entity.p1.x, entity.p2.x, dimP1.x, dimP2.x];
      const ys = [entity.p1.y, entity.p2.y, dimP1.y, dimP2.y];
      return {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
      };
    }
    case 'text': {
      const w = Math.max(20, entity.content.length * entity.fontSize * 0.65);
      const h = entity.fontSize * 1.2;
      return {
        minX: entity.position.x,
        minY: entity.position.y - h / 2,
        maxX: entity.position.x + w,
        maxY: entity.position.y + h / 2,
      };
    }
    case 'hatch': {
      if (
        entity.boundaryType === 'circle' &&
        entity.center &&
        entity.radius
      ) {
        return {
          minX: entity.center.x - entity.radius,
          minY: entity.center.y - entity.radius,
          maxX: entity.center.x + entity.radius,
          maxY: entity.center.y + entity.radius,
        };
      }
      if (entity.points && entity.points.length > 0) {
        const xs = entity.points.map((p) => p.x);
        const ys = entity.points.map((p) => p.y);
        return {
          minX: Math.min(...xs),
          minY: Math.min(...ys),
          maxX: Math.max(...xs),
          maxY: Math.max(...ys),
        };
      }
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
    case 'group': {
      if (!entity.children || entity.children.length === 0) {
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      }
      const childBounds = entity.children.map(getEntityBounds);
      return {
        minX: Math.min(...childBounds.map((b) => b.minX)),
        minY: Math.min(...childBounds.map((b) => b.minY)),
        maxX: Math.max(...childBounds.map((b) => b.maxX)),
        maxY: Math.max(...childBounds.map((b) => b.maxY)),
      };
    }
    default:
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
}

export function isEntityInSelectionBox(
  entity: CadEntity,
  boxStart: Point,
  boxEnd: Point,
  isCrossing: boolean
): boolean {
  const minX = Math.min(boxStart.x, boxEnd.x);
  const maxX = Math.max(boxStart.x, boxEnd.x);
  const minY = Math.min(boxStart.y, boxEnd.y);
  const maxY = Math.max(boxStart.y, boxEnd.y);

  const b = getEntityBounds(entity);
  const fullyInside =
    b.minX >= minX && b.maxX <= maxX && b.minY >= minY && b.maxY <= maxY;

  if (!isCrossing) {
    return fullyInside;
  }

  const boxesOverlap =
    b.maxX >= minX && b.minX <= maxX && b.maxY >= minY && b.minY <= maxY;
  if (!boxesOverlap) return false;
  if (fullyInside) return true;

  if (entity.type === 'group') {
    return entity.children.some((c) =>
      isEntityInSelectionBox(c, boxStart, boxEnd, isCrossing)
    );
  }

  const boxCorners: Point[] = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
  const boxEdges: Array<[Point, Point]> = [
    [boxCorners[0], boxCorners[1]],
    [boxCorners[1], boxCorners[2]],
    [boxCorners[2], boxCorners[3]],
    [boxCorners[3], boxCorners[0]],
  ];

  const segs = getEntitySegments(entity);
  if (segs.length > 0) {
    for (const [s1, s2] of segs) {
      if (
        (s1.x >= minX && s1.x <= maxX && s1.y >= minY && s1.y <= maxY) ||
        (s2.x >= minX && s2.x <= maxX && s2.y >= minY && s2.y <= maxY)
      ) {
        return true;
      }
      for (const [b1, b2] of boxEdges) {
        if (segmentIntersection(s1, s2, b1, b2)) return true;
      }
    }
    return false;
  }

  return boxesOverlap;
}

export function translateEntity(
  entity: CadEntity,
  dx: number,
  dy: number
): CadEntity {
  const shift = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });
  switch (entity.type) {
    case 'line':
      return { ...entity, p1: shift(entity.p1), p2: shift(entity.p2) };
    case 'rectangle':
      return { ...entity, p1: shift(entity.p1), p2: shift(entity.p2) };
    case 'polyline':
      return { ...entity, points: entity.points.map(shift) };
    case 'circle':
    case 'polygon':
      return { ...entity, center: shift(entity.center) };
    case 'arc':
      return {
        ...entity,
        center: shift(entity.center),
        p1: entity.p1 ? shift(entity.p1) : undefined,
        p2: entity.p2 ? shift(entity.p2) : undefined,
        p3: entity.p3 ? shift(entity.p3) : undefined,
      };
    case 'dimension':
      return {
        ...entity,
        p1: shift(entity.p1),
        p2: shift(entity.p2),
        offsetPoint: shift(entity.offsetPoint),
      };
    case 'text':
      return { ...entity, position: shift(entity.position) };
    case 'hatch':
      return {
        ...entity,
        center: entity.center ? shift(entity.center) : undefined,
        points: entity.points ? entity.points.map(shift) : undefined,
      };
    case 'group':
      return {
        ...entity,
        children: entity.children.map((c) => translateEntity(c, dx, dy)),
      };
    default:
      return entity;
  }
}

export function rotateEntity(
  entity: CadEntity,
  pivot: Point,
  angleRad: number
): CadEntity {
  const rot = (p: Point) => rotatePoint(p, pivot, angleRad);
  switch (entity.type) {
    case 'line':
      return { ...entity, p1: rot(entity.p1), p2: rot(entity.p2) };
    case 'rectangle': {
      const segs = getEntitySegments(entity);
      const pts = segs.map(([a]) => rot(a));
      return {
        id: entity.id,
        type: 'polyline',
        layerId: entity.layerId,
        color: entity.color,
        lineType: entity.lineType,
        lineWeight: entity.lineWeight,
        points: pts,
        closed: true,
      };
    }
    case 'polyline':
      return { ...entity, points: entity.points.map(rot) };
    case 'circle':
      return { ...entity, center: rot(entity.center) };
    case 'arc':
      return {
        ...entity,
        center: rot(entity.center),
        startAngle: entity.startAngle + angleRad,
        endAngle: entity.endAngle + angleRad,
        p1: entity.p1 ? rot(entity.p1) : undefined,
        p2: entity.p2 ? rot(entity.p2) : undefined,
        p3: entity.p3 ? rot(entity.p3) : undefined,
      };
    case 'polygon':
      return {
        ...entity,
        center: rot(entity.center),
        rotation: entity.rotation + angleRad,
      };
    case 'dimension':
      return {
        ...entity,
        p1: rot(entity.p1),
        p2: rot(entity.p2),
        offsetPoint: rot(entity.offsetPoint),
      };
    case 'text':
      return {
        ...entity,
        position: rot(entity.position),
        rotation: (entity.rotation + angleRad * RAD_TO_DEG) % 360,
      };
    case 'hatch':
      return {
        ...entity,
        center: entity.center ? rot(entity.center) : undefined,
        points: entity.points ? entity.points.map(rot) : undefined,
      };
    case 'group':
      return {
        ...entity,
        children: entity.children.map((c) => rotateEntity(c, pivot, angleRad)),
      };
    default:
      return entity;
  }
}

export function mirrorEntity(
  entity: CadEntity,
  axisA: Point,
  axisB: Point
): CadEntity {
  const mir = (p: Point) => mirrorPoint(p, axisA, axisB);
  switch (entity.type) {
    case 'line':
      return { ...entity, p1: mir(entity.p1), p2: mir(entity.p2) };
    case 'rectangle':
      return { ...entity, p1: mir(entity.p1), p2: mir(entity.p2) };
    case 'polyline':
      return { ...entity, points: entity.points.map(mir) };
    case 'circle':
    case 'polygon':
      return { ...entity, center: mir(entity.center) };
    case 'arc': {
      const [p1, p2, p3] = getArcThreePoints(entity);
      const mp1 = mir(p1);
      const mp2 = mir(p2);
      const mp3 = mir(p3);
      const arcData = arcFromThreePoints(mp1, mp2, mp3);
      if (arcData) {
        return {
          ...entity,
          center: arcData.center,
          radius: arcData.radius,
          startAngle: arcData.startAngle,
          endAngle: arcData.endAngle,
          p1: mp1,
          p2: mp2,
          p3: mp3,
        };
      }
      return entity;
    }
    case 'dimension':
      return {
        ...entity,
        p1: mir(entity.p1),
        p2: mir(entity.p2),
        offsetPoint: mir(entity.offsetPoint),
      };
    case 'text':
      return { ...entity, position: mir(entity.position) };
    case 'hatch':
      return {
        ...entity,
        center: entity.center ? mir(entity.center) : undefined,
        points: entity.points ? entity.points.map(mir) : undefined,
      };
    case 'group':
      return {
        ...entity,
        children: entity.children.map((c) => mirrorEntity(c, axisA, axisB)),
      };
    default:
      return entity;
  }
}

export function offsetEntity(
  entity: CadEntity,
  sidePoint: Point,
  offsetDist: number,
  newId: string
): CadEntity | null {
  if (offsetDist <= 0) return null;
  switch (entity.type) {
    case 'line': {
      const dx = entity.p2.x - entity.p1.x;
      const dy = entity.p2.y - entity.p1.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-5) return null;
      let nx = -dy / len;
      let ny = dx / len;
      const dot =
        (sidePoint.x - entity.p1.x) * nx + (sidePoint.y - entity.p1.y) * ny;
      if (dot < 0) {
        nx = -nx;
        ny = -ny;
      }
      return {
        ...entity,
        id: newId,
        p1: {
          x: entity.p1.x + nx * offsetDist,
          y: entity.p1.y + ny * offsetDist,
        },
        p2: {
          x: entity.p2.x + nx * offsetDist,
          y: entity.p2.y + ny * offsetDist,
        },
      };
    }
    case 'circle':
    case 'arc':
    case 'polygon': {
      const d = dist(sidePoint, entity.center);
      const sign = d >= entity.radius ? 1 : -1;
      const nextRadius = entity.radius + sign * offsetDist;
      if (nextRadius < 0.01) return null;
      if (entity.type === 'arc') {
        const [p1, p2, p3] = getArcThreePoints({
          ...entity,
          radius: nextRadius,
        });
        return { ...entity, id: newId, radius: nextRadius, p1, p2, p3 };
      }
      return { ...entity, id: newId, radius: nextRadius };
    }
    case 'rectangle': {
      const minX = Math.min(entity.p1.x, entity.p2.x);
      const maxX = Math.max(entity.p1.x, entity.p2.x);
      const minY = Math.min(entity.p1.y, entity.p2.y);
      const maxY = Math.max(entity.p1.y, entity.p2.y);
      const isOutside =
        sidePoint.x < minX ||
        sidePoint.x > maxX ||
        sidePoint.y < minY ||
        sidePoint.y > maxY;
      const delta = isOutside ? offsetDist : -offsetDist;
      if (maxX - minX + 2 * delta < 0.01 || maxY - minY + 2 * delta < 0.01) {
        return null;
      }
      return {
        ...entity,
        id: newId,
        p1: { x: minX - delta, y: minY - delta },
        p2: { x: maxX + delta, y: maxY + delta },
      };
    }
    case 'polyline': {
      if (entity.points.length < 2) return null;
      const segs = getEntitySegments(entity);
      if (segs.length === 0) return null;

      // Compute centroid of polyline vertices
      const cx =
        entity.points.reduce((s, p) => s + p.x, 0) / entity.points.length;
      const cy =
        entity.points.reduce((s, p) => s + p.y, 0) / entity.points.length;

      // Determine outward vs inward relative to sidePoint using closest segment
      let bestSegDist = Infinity;
      let sideSign = 1;
      for (const [a, b] of segs) {
        const d = distToSegment(sidePoint, a, b);
        if (d < bestSegDist) {
          bestSegDist = d;
          const mid = midpoint(a, b);
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          let nx = -dy / len;
          let ny = dx / len;
          // Orient normal away from centroid
          if ((mid.x - cx) * nx + (mid.y - cy) * ny < 0) {
            nx = -nx;
            ny = -ny;
          }
          const dotSide =
            (sidePoint.x - mid.x) * nx + (sidePoint.y - mid.y) * ny;
          sideSign = dotSide >= 0 ? 1 : -1;
        }
      }

      const offsetSegs: Array<[Point, Point]> = segs.map(([a, b]) => {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        let nx = -dy / len;
        let ny = dx / len;
        const mid = midpoint(a, b);
        if ((mid.x - cx) * nx + (mid.y - cy) * ny < 0) {
          nx = -nx;
          ny = -ny;
        }
        nx *= sideSign;
        ny *= sideSign;
        return [
          { x: a.x + nx * offsetDist, y: a.y + ny * offsetDist },
          { x: b.x + nx * offsetDist, y: b.y + ny * offsetDist },
        ];
      });

      const newPts: Point[] = [];
      if (entity.closed && offsetSegs.length >= 3) {
        for (let i = 0; i < offsetSegs.length; i++) {
          const prevSeg =
            offsetSegs[(i - 1 + offsetSegs.length) % offsetSegs.length];
          const currSeg = offsetSegs[i];
          const hit = infiniteLineIntersection(
            prevSeg[0],
            prevSeg[1],
            currSeg[0],
            currSeg[1]
          );
          if (hit && dist(currSeg[0], hit) <= offsetDist * 6) {
            newPts.push(hit);
          } else {
            newPts.push(currSeg[0]);
          }
        }
      } else {
        newPts.push(offsetSegs[0][0]);
        for (let i = 0; i < offsetSegs.length - 1; i++) {
          const hit = infiniteLineIntersection(
            offsetSegs[i][0],
            offsetSegs[i][1],
            offsetSegs[i + 1][0],
            offsetSegs[i + 1][1]
          );
          if (hit && dist(offsetSegs[i][1], hit) <= offsetDist * 6) {
            newPts.push(hit);
          } else {
            newPts.push(offsetSegs[i][1]);
          }
        }
        newPts.push(offsetSegs[offsetSegs.length - 1][1]);
      }

      return {
        ...entity,
        id: newId,
        points: newPts,
      };
    }
    case 'group': {
      const offsetChildren = offsetSelectedEntities(
        entity.children,
        sidePoint,
        offsetDist,
        `${newId}_child`
      );
      if (offsetChildren.length === 0) return null;
      return {
        ...entity,
        id: newId,
        children: offsetChildren,
      };
    }
    default:
      return null;
  }
}

/**
 * Offset ALL selected entities at once!
 * When multiple connected LineEntities are selected (e.g., via Tab or window selection),
 * offsets them consistently toward sidePoint and automatically trims/extends their shared corners!
 */
export function offsetSelectedEntities(
  selectedEntities: CadEntity[],
  sidePoint: Point,
  offsetDist: number,
  idPrefix = `off_${Date.now()}`
): CadEntity[] {
  if (offsetDist <= 0 || selectedEntities.length === 0) return [];

  const lines = selectedEntities.filter(
    (e): e is LineEntity => e.type === 'line'
  );
  const others = selectedEntities.filter((e) => e.type !== 'line');

  const results: CadEntity[] = [];

  // Handle multiple selected lines with smart corner mitering & consistent side orientation
  if (lines.length >= 2) {
    const allPts = lines.flatMap((l) => [l.p1, l.p2]);
    const cx = allPts.reduce((s, p) => s + p.x, 0) / allPts.length;
    const cy = allPts.reduce((s, p) => s + p.y, 0) / allPts.length;

    // Check if any lines share endpoints
    let hasSharedCorner = false;
    for (let i = 0; i < lines.length && !hasSharedCorner; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        if (
          dist(lines[i].p1, lines[j].p1) <= 1.5 ||
          dist(lines[i].p1, lines[j].p2) <= 1.5 ||
          dist(lines[i].p2, lines[j].p1) <= 1.5 ||
          dist(lines[i].p2, lines[j].p2) <= 1.5
        ) {
          hasSharedCorner = true;
          break;
        }
      }
    }

    if (hasSharedCorner) {
      // Find closest line to sidePoint to determine outward (+1) vs inward (-1) relative to centroid
      let bestDist = Infinity;
      let sideSign = 1;
      for (const l of lines) {
        const d = distToSegment(sidePoint, l.p1, l.p2);
        if (d < bestDist) {
          bestDist = d;
          const mid = midpoint(l.p1, l.p2);
          const dx = l.p2.x - l.p1.x;
          const dy = l.p2.y - l.p1.y;
          const len = Math.hypot(dx, dy) || 1;
          let nx = -dy / len;
          let ny = dx / len;
          if ((mid.x - cx) * nx + (mid.y - cy) * ny < 0) {
            nx = -nx;
            ny = -ny;
          }
          const dotSide =
            (sidePoint.x - mid.x) * nx + (sidePoint.y - mid.y) * ny;
          sideSign = dotSide >= 0 ? 1 : -1;
        }
      }

      const offsetLines: LineEntity[] = lines.map((l, idx) => {
        const dx = l.p2.x - l.p1.x;
        const dy = l.p2.y - l.p1.y;
        const len = Math.hypot(dx, dy) || 1;
        let nx = -dy / len;
        let ny = dx / len;
        const mid = midpoint(l.p1, l.p2);
        if ((mid.x - cx) * nx + (mid.y - cy) * ny < 0) {
          nx = -nx;
          ny = -ny;
        }
        nx *= sideSign;
        ny *= sideSign;
        return {
          ...l,
          id: `${idPrefix}_L_${idx}_${Math.random().toString(36).slice(2, 5)}`,
          p1: { x: l.p1.x + nx * offsetDist, y: l.p1.y + ny * offsetDist },
          p2: { x: l.p2.x + nx * offsetDist, y: l.p2.y + ny * offsetDist },
        };
      });

      // Miter shared corners between connected lines
      for (let i = 0; i < lines.length; i++) {
        for (let j = i + 1; j < lines.length; j++) {
          const origA = lines[i];
          const origB = lines[j];
          const offA = offsetLines[i];
          const offB = offsetLines[j];

          const pairs: Array<['p1' | 'p2', 'p1' | 'p2']> = [
            ['p1', 'p1'],
            ['p1', 'p2'],
            ['p2', 'p1'],
            ['p2', 'p2'],
          ];
          for (const [endA, endB] of pairs) {
            if (dist(origA[endA], origB[endB]) <= 1.5) {
              const hit = infiniteLineIntersection(
                offA.p1,
                offA.p2,
                offB.p1,
                offB.p2
              );
              if (hit && dist(offA[endA], hit) <= offsetDist * 6) {
                offA[endA] = { ...hit };
                offB[endB] = { ...hit };
              }
            }
          }
        }
      }

      results.push(...offsetLines);
    } else {
      // Disconnected lines: offset each line toward sidePoint
      lines.forEach((l, idx) => {
        const off = offsetEntity(
          l,
          sidePoint,
          offsetDist,
          `${idPrefix}_L_${idx}_${Math.random().toString(36).slice(2, 5)}`
        );
        if (off) results.push(off);
      });
    }
  } else if (lines.length === 1) {
    const off = offsetEntity(
      lines[0],
      sidePoint,
      offsetDist,
      `${idPrefix}_L_0_${Math.random().toString(36).slice(2, 5)}`
    );
    if (off) results.push(off);
  }

  // Offset all other selected entities (rectangles, circles, arcs, polygons, polylines, groups)
  others.forEach((ent, idx) => {
    const off = offsetEntity(
      ent,
      sidePoint,
      offsetDist,
      `${idPrefix}_E_${idx}_${Math.random().toString(36).slice(2, 5)}`
    );
    if (off) results.push(off);
  });

  return results;
}

export function getEntityGripHandles(entity: CadEntity): GripHandle[] {
  switch (entity.type) {
    case 'line':
      return [
        { entityId: entity.id, gripIndex: 0, point: entity.p1, type: 'vertex', label: 'P1' },
        { entityId: entity.id, gripIndex: 1, point: entity.p2, type: 'vertex', label: 'P2' },
        {
          entityId: entity.id,
          gripIndex: 2,
          point: midpoint(entity.p1, entity.p2),
          type: 'midpoint',
        },
      ];
    case 'rectangle':
      return [
        { entityId: entity.id, gripIndex: 0, point: entity.p1, type: 'vertex' },
        { entityId: entity.id, gripIndex: 1, point: entity.p2, type: 'vertex' },
        {
          entityId: entity.id,
          gripIndex: 2,
          point: { x: entity.p2.x, y: entity.p1.y },
          type: 'vertex',
        },
        {
          entityId: entity.id,
          gripIndex: 3,
          point: { x: entity.p1.x, y: entity.p2.y },
          type: 'vertex',
        },
        {
          entityId: entity.id,
          gripIndex: 4,
          point: midpoint(entity.p1, entity.p2),
          type: 'center',
        },
      ];
    case 'circle':
    case 'polygon':
      return [
        {
          entityId: entity.id,
          gripIndex: 0,
          point: entity.center,
          type: 'center',
        },
        {
          entityId: entity.id,
          gripIndex: 1,
          point: { x: entity.center.x + entity.radius, y: entity.center.y },
          type: 'radius',
        },
        {
          entityId: entity.id,
          gripIndex: 2,
          point: { x: entity.center.x, y: entity.center.y + entity.radius },
          type: 'radius',
        },
      ];
    case 'polyline':
      return entity.points.map((pt, idx) => ({
        entityId: entity.id,
        gripIndex: idx,
        point: pt,
        type: 'vertex' as const,
      }));
    case 'dimension': {
      const { mid } = getDimensionLinePoints(entity);
      return [
        { entityId: entity.id, gripIndex: 0, point: entity.p1, type: 'vertex' },
        { entityId: entity.id, gripIndex: 1, point: entity.p2, type: 'vertex' },
        {
          entityId: entity.id,
          gripIndex: 2,
          point: mid,
          type: 'midpoint',
        },
      ];
    }
    case 'text':
      return [
        {
          entityId: entity.id,
          gripIndex: 0,
          point: entity.position,
          type: 'center',
        },
      ];
    case 'arc': {
      const [p1, p2, p3] = getArcThreePoints(entity);
      return [
        {
          entityId: entity.id,
          gripIndex: 0,
          point: p1,
          type: 'vertex',
          label: 'P1',
        },
        {
          entityId: entity.id,
          gripIndex: 1,
          point: p2,
          type: 'midpoint',
          label: 'P2',
        },
        {
          entityId: entity.id,
          gripIndex: 2,
          point: p3,
          type: 'vertex',
          label: 'P3',
        },
        {
          entityId: entity.id,
          gripIndex: 3,
          point: entity.center,
          type: 'center',
        },
      ];
    }
    case 'hatch':
    case 'group': {
      const b = getEntityBounds(entity);
      const center = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
      return [
        {
          entityId: entity.id,
          gripIndex: 0,
          point: center,
          type: 'center',
        },
      ];
    }
    default:
      return [];
  }
}

export function applyGripMove(
  entity: CadEntity,
  gripIndex: number,
  newPoint: Point
): CadEntity {
  switch (entity.type) {
    case 'line': {
      if (gripIndex === 0) return { ...entity, p1: newPoint };
      if (gripIndex === 1) return { ...entity, p2: newPoint };
      const mid = midpoint(entity.p1, entity.p2);
      return translateEntity(entity, newPoint.x - mid.x, newPoint.y - mid.y);
    }
    case 'rectangle': {
      if (gripIndex === 0) return { ...entity, p1: newPoint };
      if (gripIndex === 1) return { ...entity, p2: newPoint };
      if (gripIndex === 2)
        return {
          ...entity,
          p1: { x: entity.p1.x, y: newPoint.y },
          p2: { x: newPoint.x, y: entity.p2.y },
        };
      if (gripIndex === 3)
        return {
          ...entity,
          p1: { x: newPoint.x, y: entity.p1.y },
          p2: { x: entity.p2.x, y: newPoint.y },
        };
      const mid = midpoint(entity.p1, entity.p2);
      return translateEntity(entity, newPoint.x - mid.x, newPoint.y - mid.y);
    }
    case 'circle':
    case 'polygon': {
      if (gripIndex === 0) return { ...entity, center: newPoint };
      return {
        ...entity,
        radius: Math.max(0.01, dist(entity.center, newPoint)),
      };
    }
    case 'polyline': {
      const nextPts = [...entity.points];
      if (gripIndex >= 0 && gripIndex < nextPts.length) {
        nextPts[gripIndex] = newPoint;
      }
      return { ...entity, points: nextPts };
    }
    case 'dimension': {
      if (entity.dimMode === 'diameter') {
        const c = midpoint(entity.p1, entity.p2);
        const r = Math.max(0.01, dist(entity.p1, entity.p2) / 2);
        if (gripIndex === 2) {
          const ang = Math.atan2(newPoint.y - c.y, newPoint.x - c.x);
          return {
            ...entity,
            p1: { x: c.x - r * Math.cos(ang), y: c.y - r * Math.sin(ang) },
            p2: { x: c.x + r * Math.cos(ang), y: c.y + r * Math.sin(ang) },
            offsetPoint: newPoint,
          };
        }
        if (gripIndex === 0 || gripIndex === 1) {
          const newR = Math.max(0.01, dist(c, newPoint));
          const ang = Math.atan2(newPoint.y - c.y, newPoint.x - c.x);
          return {
            ...entity,
            p1: { x: c.x - newR * Math.cos(ang), y: c.y - newR * Math.sin(ang) },
            p2: { x: c.x + newR * Math.cos(ang), y: c.y + newR * Math.sin(ang) },
          };
        }
      }
      if (gripIndex === 0) return { ...entity, p1: newPoint };
      if (gripIndex === 1) return { ...entity, p2: newPoint };
      return { ...entity, offsetPoint: newPoint };
    }
    case 'text':
      return { ...entity, position: newPoint };
    case 'arc': {
      const [p1, p2, p3] = getArcThreePoints(entity);
      if (gripIndex === 3) {
        return translateEntity(
          entity,
          newPoint.x - entity.center.x,
          newPoint.y - entity.center.y
        );
      }
      const nextP1 = gripIndex === 0 ? newPoint : p1;
      const nextP2 = gripIndex === 1 ? newPoint : p2;
      const nextP3 = gripIndex === 2 ? newPoint : p3;
      const arcData = arcFromThreePoints(nextP1, nextP2, nextP3);
      if (arcData) {
        return {
          ...entity,
          center: arcData.center,
          radius: arcData.radius,
          startAngle: arcData.startAngle,
          endAngle: arcData.endAngle,
          p1: nextP1,
          p2: nextP2,
          p3: nextP3,
        };
      }
      return entity;
    }
    case 'hatch':
    case 'group': {
      const b = getEntityBounds(entity);
      const center = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
      return translateEntity(
        entity,
        newPoint.x - center.x,
        newPoint.y - center.y
      );
    }
    default:
      return entity;
  }
}

export function getEntityMetrics(entity: CadEntity): {
  length?: number;
  area?: number;
  angleDeg?: number;
  width?: number;
  height?: number;
} {
  switch (entity.type) {
    case 'line':
      return {
        length: dist(entity.p1, entity.p2),
        angleDeg: angleDegrees(entity.p1, entity.p2),
      };
    case 'rectangle': {
      const w = Math.abs(entity.p2.x - entity.p1.x);
      const h = Math.abs(entity.p2.y - entity.p1.y);
      return {
        width: w,
        height: h,
        length: 2 * (w + h),
        area: w * h,
      };
    }
    case 'circle':
      return {
        length: 2 * Math.PI * entity.radius,
        area: Math.PI * entity.radius * entity.radius,
      };
    case 'arc': {
      const sweep = normalizeAngle(entity.endAngle - entity.startAngle);
      return {
        length: entity.radius * sweep,
      };
    }
    case 'polygon': {
      const sideLen = 2 * entity.radius * Math.sin(Math.PI / entity.sides);
      const perim = sideLen * entity.sides;
      const apothem = entity.radius * Math.cos(Math.PI / entity.sides);
      return {
        length: perim,
        area: 0.5 * perim * apothem,
      };
    }
    case 'polyline': {
      const segs = getEntitySegments(entity);
      const len = segs.reduce((acc, [a, b]) => acc + dist(a, b), 0);
      const b = getEntityBounds(entity);
      let area: number | undefined;
      if (entity.closed && entity.points.length >= 3) {
        let sum = 0;
        for (let i = 0; i < entity.points.length; i++) {
          const p1 = entity.points[i];
          const p2 = entity.points[(i + 1) % entity.points.length];
          sum += p1.x * p2.y - p2.x * p1.y;
        }
        area = Math.abs(sum) / 2;
      }
      return {
        length: len,
        area,
        width: b.maxX - b.minX,
        height: b.maxY - b.minY,
      };
    }
    case 'dimension':
      return {
        length: dist(entity.p1, entity.p2),
      };
    case 'group': {
      const b = getEntityBounds(entity);
      return {
        width: b.maxX - b.minX,
        height: b.maxY - b.minY,
      };
    }
    default:
      return {};
  }
}

export function exportToDXF(entities: CadEntity[], layers: CadLayer[]): string {
  const layerMap = new Map(layers.map((l) => [l.id, l.name]));
  const lines: string[] = [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$ACADVER',
    '1',
    'AC1009',
    '9',
    '$INSUNITS',
    '70',
    '4',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
  ];

  const getLayerName = (id: string) =>
    (layerMap.get(id) || '0').replace(/\s+/g, '_');

  const leaves = flattenEntities(entities);

  for (const ent of leaves) {
    const layer = getLayerName(ent.layerId);
    if (ent.type === 'line') {
      lines.push(
        '0',
        'LINE',
        '8',
        layer,
        '10',
        ent.p1.x.toFixed(4),
        '20',
        ent.p1.y.toFixed(4),
        '30',
        '0.0',
        '11',
        ent.p2.x.toFixed(4),
        '21',
        ent.p2.y.toFixed(4),
        '31',
        '0.0'
      );
    } else if (
      ent.type === 'rectangle' ||
      ent.type === 'polyline' ||
      ent.type === 'polygon'
    ) {
      const segs = getEntitySegments(ent);
      for (const [p1, p2] of segs) {
        lines.push(
          '0',
          'LINE',
          '8',
          layer,
          '10',
          p1.x.toFixed(4),
          '20',
          p1.y.toFixed(4),
          '30',
          '0.0',
          '11',
          p2.x.toFixed(4),
          '21',
          p2.y.toFixed(4),
          '31',
          '0.0'
        );
      }
    } else if (ent.type === 'circle') {
      lines.push(
        '0',
        'CIRCLE',
        '8',
        layer,
        '10',
        ent.center.x.toFixed(4),
        '20',
        ent.center.y.toFixed(4),
        '30',
        '0.0',
        '40',
        ent.radius.toFixed(4)
      );
    } else if (ent.type === 'arc') {
      lines.push(
        '0',
        'ARC',
        '8',
        layer,
        '10',
        ent.center.x.toFixed(4),
        '20',
        ent.center.y.toFixed(4),
        '30',
        '0.0',
        '40',
        ent.radius.toFixed(4),
        '50',
        (ent.startAngle * RAD_TO_DEG).toFixed(4),
        '51',
        (ent.endAngle * RAD_TO_DEG).toFixed(4)
      );
    } else if (ent.type === 'text') {
      lines.push(
        '0',
        'TEXT',
        '8',
        layer,
        '10',
        ent.position.x.toFixed(4),
        '20',
        ent.position.y.toFixed(4),
        '30',
        '0.0',
        '40',
        ent.fontSize.toFixed(2),
        '1',
        ent.content
      );
    } else if (ent.type === 'dimension') {
      const { dimP1, dimP2, mid, length } = getDimensionLinePoints(ent);
      const { fullText } = formatDimensionLabel(ent, length);
      const fSize = ent.fontSize || 11;
      lines.push(
        '0',
        'LINE',
        '8',
        layer,
        '10',
        dimP1.x.toFixed(4),
        '20',
        dimP1.y.toFixed(4),
        '30',
        '0.0',
        '11',
        dimP2.x.toFixed(4),
        '21',
        dimP2.y.toFixed(4),
        '31',
        '0.0',
        '0',
        'TEXT',
        '8',
        layer,
        '10',
        mid.x.toFixed(4),
        '20',
        mid.y.toFixed(4),
        '30',
        '0.0',
        '40',
        fSize.toFixed(2),
        '1',
        fullText
      );
    } else if (ent.type === 'hatch') {
      const hatchSegs = getHatchSegments(ent);
      for (const [p1, p2] of hatchSegs) {
        lines.push(
          '0',
          'LINE',
          '8',
          layer,
          '10',
          p1.x.toFixed(4),
          '20',
          p1.y.toFixed(4),
          '30',
          '0.0',
          '11',
          p2.x.toFixed(4),
          '21',
          p2.y.toFixed(4),
          '31',
          '0.0'
        );
      }
    }
  }

  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}

export function exportToSVG(entities: CadEntity[], layers: CadLayer[]): string {
  const visibleLayers = new Map(
    layers.filter((l) => l.visible).map((l) => [l.id, l])
  );
  const visibleEntities = flattenEntities(
    entities.filter((e) => visibleLayers.has(e.layerId))
  );

  let minX = -200,
    minY = -200,
    maxX = 200,
    maxY = 200;
  if (visibleEntities.length > 0) {
    const bounds = visibleEntities.map(getEntityBounds);
    minX = Math.min(...bounds.map((b) => b.minX)) - 40;
    minY = Math.min(...bounds.map((b) => b.minY)) - 40;
    maxX = Math.max(...bounds.map((b) => b.maxX)) + 40;
    maxY = Math.max(...bounds.map((b) => b.maxY)) + 40;
  }
  const width = Math.max(100, maxX - minX);
  const height = Math.max(100, maxY - minY);

  const sy = (y: number) => maxY - (y - minY);

  const elements: string[] = [];
  for (const ent of visibleEntities) {
    const layer = visibleLayers.get(ent.layerId) || layers[0];
    const stroke = ent.color || layer.color;
    const lw = (ent.lineWeight || layer.lineWeight || 0.25) * 4;
    const lt = ent.lineType || layer.lineType;
    const dash =
      lt === 'dashed'
        ? 'stroke-dasharray="8,5"'
        : lt === 'center'
          ? 'stroke-dasharray="14,4,3,4"'
          : lt === 'dotted'
            ? 'stroke-dasharray="2,4"'
            : '';

    if (ent.type === 'line') {
      elements.push(
        `<line x1="${ent.p1.x}" y1="${sy(ent.p1.y)}" x2="${ent.p2.x}" y2="${sy(ent.p2.y)}" stroke="${stroke}" stroke-width="${lw}" ${dash} stroke-linecap="round" />`
      );
    } else if (
      ent.type === 'rectangle' ||
      ent.type === 'polyline' ||
      ent.type === 'polygon'
    ) {
      const segs = getEntitySegments(ent);
      for (const [p1, p2] of segs) {
        elements.push(
          `<line x1="${p1.x}" y1="${sy(p1.y)}" x2="${p2.x}" y2="${sy(p2.y)}" stroke="${stroke}" stroke-width="${lw}" ${dash} stroke-linecap="round" />`
        );
      }
    } else if (ent.type === 'circle') {
      elements.push(
        `<circle cx="${ent.center.x}" cy="${sy(ent.center.y)}" r="${ent.radius}" fill="none" stroke="${stroke}" stroke-width="${lw}" ${dash} />`
      );
    } else if (ent.type === 'text') {
      elements.push(
        `<text x="${ent.position.x}" y="${sy(ent.position.y)}" fill="${stroke}" font-family="JetBrains Mono, monospace" font-size="${ent.fontSize}">${ent.content}</text>`
      );
    } else if (ent.type === 'dimension') {
      const { dimP1, dimP2, mid, length, isDiameter } =
        getDimensionLinePoints(ent);
      const { fullText } = formatDimensionLabel(ent, length);
      const fSize = ent.fontSize || 11;
      if (!isDiameter) {
        elements.push(
          `<line x1="${ent.p1.x}" y1="${sy(ent.p1.y)}" x2="${dimP1.x}" y2="${sy(dimP1.y)}" stroke="${stroke}" stroke-width="1" stroke-opacity="0.6" />`,
          `<line x1="${ent.p2.x}" y1="${sy(ent.p2.y)}" x2="${dimP2.x}" y2="${sy(dimP2.y)}" stroke="${stroke}" stroke-width="1" stroke-opacity="0.6" />`
        );
      }
      elements.push(
        `<line x1="${dimP1.x}" y1="${sy(dimP1.y)}" x2="${dimP2.x}" y2="${sy(dimP2.y)}" stroke="${stroke}" stroke-width="1.2" />`,
        `<text x="${mid.x}" y="${sy(mid.y) - 6}" fill="${stroke}" font-family="JetBrains Mono, monospace" font-size="${fSize}" text-anchor="middle">${fullText}</text>`
      );
    } else if (ent.type === 'hatch') {
      const hatchSegs = getHatchSegments(ent);
      for (const [p1, p2] of hatchSegs) {
        elements.push(
          `<line x1="${p1.x}" y1="${sy(p1.y)}" x2="${p2.x}" y2="${sy(p2.y)}" stroke="${stroke}" stroke-width="1" stroke-opacity="0.85" />`
        );
      }
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="100%" height="100%" style="background:#0B0F17">
  ${elements.join('\n  ')}
</svg>`;
}

/**
 * Extract key connection points (endpoints, vertices, arc endpoints) of an entity for chain-selection
 */
function getEntityConnectionPoints(entity: CadEntity): Point[] {
  switch (entity.type) {
    case 'line':
      return [entity.p1, entity.p2];
    case 'polyline':
      return entity.points;
    case 'rectangle':
    case 'polygon': {
      const segs = getEntitySegments(entity);
      return segs.map(([a]) => a);
    }
    case 'arc': {
      const [p1, p2, p3] = getArcThreePoints(entity);
      return [p1, p2, p3];
    }
    case 'circle': {
      const { center, radius } = entity;
      return [
        { x: center.x + radius, y: center.y },
        { x: center.x - radius, y: center.y },
        { x: center.x, y: center.y + radius },
        { x: center.x, y: center.y - radius },
      ];
    }
    case 'group':
      return entity.children.flatMap(getEntityConnectionPoints);
    default:
      return [];
  }
}

/**
 * Find all entities connected (sharing endpoints or intersecting) in a chain starting from seedIds
 */
export function findConnectedEntityIds(
  seedIds: string[],
  entities: CadEntity[],
  tolerance = 2.0
): string[] {
  const visited = new Set<string>(seedIds);
  const queue: CadEntity[] = entities.filter((e) => visited.has(e.id));

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currPts = getEntityConnectionPoints(curr);
    const currSegs = getEntitySegments(curr);

    for (const candidate of entities) {
      if (visited.has(candidate.id)) continue;
      if (candidate.type === 'dimension' || candidate.type === 'text') continue;

      let connected = false;

      // 1. Check if any connection point of curr touches candidate
      for (const pt of currPts) {
        if (isPointNearEntity(pt, candidate, tolerance)) {
          connected = true;
          break;
        }
      }

      // 2. Check if any connection point of candidate touches curr
      if (!connected) {
        const candPts = getEntityConnectionPoints(candidate);
        for (const pt of candPts) {
          if (isPointNearEntity(pt, curr, tolerance)) {
            connected = true;
            break;
          }
        }
      }

      // 3. Check if any segments intersect
      if (!connected && currSegs.length > 0) {
        const candSegs = getEntitySegments(candidate);
        for (const [a1, a2] of currSegs) {
          for (const [b1, b2] of candSegs) {
            if (segmentIntersection(a1, a2, b1, b2)) {
              connected = true;
              break;
            }
          }
          if (connected) break;
        }
      }

      if (connected) {
        visited.add(candidate.id);
        queue.push(candidate);
      }
    }
  }

  return Array.from(visited);
}

