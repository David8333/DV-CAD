import {
  CadEntity,
  CadLayer,
  DraftingSettings,
  GripHandle,
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

  // Check if a2 lies on the CCW sweep from a1 to a3
  const ccwSweep12 = normalizeAngle(a2 - a1);
  const ccwSweep13 = normalizeAngle(a3 - a1);

  if (ccwSweep12 <= ccwSweep13) {
    // CCW from a1 to a3 passes through a2
    return { center, radius, startAngle: a1, endAngle: a3 };
  } else {
    // CW from a1 to a3 passes through a2 -> equivalent to CCW from a3 to a1
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

/**
 * Ray-segment intersection: ray starts at rayOrigin in direction (rayDirX, rayDirY) with t > 1e-4,
 * and segment is [s1, s2] with 0 <= u <= 1.
 */
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

/**
 * Intersections between a line segment [p1, p2] (or ray) and a circle (center, radius).
 */
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
    default:
      return [];
  }
}

/**
 * Find all intersection points along a segment [segA, segB] with all other entities.
 * Returns parameter values t in (0, 1) sorted ascending.
 */
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

  for (const other of allEntities) {
    if (other.id === ignoreEntityId) continue;

    const otherSegs = getEntitySegments(other);
    for (const [o1, o2] of otherSegs) {
      const pt = segmentIntersection(segA, segB, o1, o2);
      if (pt) addPoint(pt);
    }

    if (other.type === 'circle') {
      const pts = lineCircleIntersections(segA, segB, other.center, other.radius, false);
      pts.forEach(addPoint);
    } else if (other.type === 'arc') {
      const pts = lineCircleIntersections(segA, segB, other.center, other.radius, false);
      for (const pt of pts) {
        const ang = normalizeAngle(
          Math.atan2(pt.y - other.center.y, pt.x - other.center.x)
        );
        const s = normalizeAngle(other.startAngle);
        const e = normalizeAngle(other.endAngle);
        const inArc = s <= e ? ang >= s - 0.02 && ang <= e + 0.02 : ang >= s - 0.02 || ang <= e + 0.02;
        if (inArc) addPoint(pt);
      }
    }
  }

  return ts.sort((a, b) => a - b);
}

/**
 * Compute Trim (剪切) operation on a target entity at clickPt.
 * Returns the segment that will be cut [cutStart, cutEnd] for preview, and the resulting entity list after cutting.
 */
export function computeTrimResult(
  clickPt: Point,
  target: CadEntity,
  allEntities: CadEntity[]
): {
  cutSegment: [Point, Point];
  replacementEntities: CadEntity[];
} | null {
  const segs = getEntitySegments(target);
  if (segs.length === 0) return null;

  // Find which segment of target is closest to clickPt
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

  // Project clickPt onto [segA, segB] to get clickT in [0, 1]
  const dx = segB.x - segA.x;
  const dy = segB.y - segA.y;
  const clickT = Math.max(
    0,
    Math.min(1, ((clickPt.x - segA.x) * dx + (clickPt.y - segA.y) * dy) / (segLen * segLen))
  );

  const lerpPt = (t: number): Point => ({
    x: segA.x + t * dx,
    y: segA.y + t * dy,
  });

  // Determine the interval [tStart, tEnd] containing clickT bounded by intersections (and 0, 1)
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

  // Build replacement LineEntities for all remaining segments
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
 * Compute Extend (延伸) operation on a line or open polyline near clickPt.
 * Extends the endpoint closest to clickPt until it hits the nearest boundary entity.
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

  // Find closest intersection along rayOrigin + t * rayDir (t > 0.05)
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

  for (const other of allEntities) {
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
 * Assemble / Join (組裝圖元) multiple selected entities into a single PolylineEntity.
 * Chains connected segments automatically and closes the loop if endpoints meet.
 */
export function joinSelectedEntities(
  selectedEntities: CadEntity[],
  layerId: string
): PolylineEntity | null {
  const allSegs: Array<[Point, Point]> = [];
  for (const ent of selectedEntities) {
    const segs = getEntitySegments(ent);
    allSegs.push(...segs);
  }
  if (allSegs.length === 0) return null;

  const used = new Array(allSegs.length).fill(false);
  const chain: Point[] = [allSegs[0][0], allSegs[0][1]];
  used[0] = true;

  const tol = 2.0;
  let progress = true;
  while (progress) {
    progress = false;
    for (let i = 0; i < allSegs.length; i++) {
      if (used[i]) continue;
      const [a, b] = allSegs[i];
      const head = chain[0];
      const tail = chain[chain.length - 1];

      if (dist(tail, a) <= tol) {
        chain.push(b);
        used[i] = true;
        progress = true;
      } else if (dist(tail, b) <= tol) {
        chain.push(a);
        used[i] = true;
        progress = true;
      } else if (dist(head, b) <= tol) {
        chain.unshift(a);
        used[i] = true;
        progress = true;
      } else if (dist(head, a) <= tol) {
        chain.unshift(b);
        used[i] = true;
        progress = true;
      }
    }
  }

  // Append any remaining non-contiguous segments so all selected geometry is assembled into one unit
  for (let i = 0; i < allSegs.length; i++) {
    if (!used[i]) {
      const [a, b] = allSegs[i];
      if (dist(chain[chain.length - 1], a) > tol) {
        chain.push(a);
      }
      chain.push(b);
    }
  }

  let closed = false;
  if (chain.length >= 3 && dist(chain[0], chain[chain.length - 1]) <= tol) {
    closed = true;
    chain.pop();
  }

  const first = selectedEntities[0];
  return {
    id: `join_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'polyline',
    layerId: first.layerId || layerId,
    color: first.color,
    lineType: first.lineType,
    lineWeight: first.lineWeight,
    points: chain,
    closed,
  };
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
  const visibleEntities = entities.filter((e) => visibleLayerIds.has(e.layerId));

  const maxSnapDist = 14 / zoom;
  let bestSnap: SnapPoint | null = null;
  let bestDist = maxSnapDist;

  const consider = (
    pt: Point,
    type: SnapPoint['type'],
    label: string,
    entityId?: string
  ) => {
    const d = dist(cursorWorld, pt);
    if (d < bestDist) {
      bestDist = d;
      bestSnap = { point: pt, type, label, entityId };
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
          consider(
            {
              x: ent.center.x + ent.radius * Math.cos(ent.startAngle),
              y: ent.center.y + ent.radius * Math.sin(ent.startAngle),
            },
            'endpoint',
            '端點 (Endpoint)',
            ent.id
          );
          consider(
            {
              x: ent.center.x + ent.radius * Math.cos(ent.endAngle),
              y: ent.center.y + ent.radius * Math.sin(ent.endAngle),
            },
            'endpoint',
            '端點 (Endpoint)',
            ent.id
          );
        }
        if (ent.type === 'dimension') {
          consider(ent.p1, 'endpoint', '端點 (Endpoint)', ent.id);
          consider(ent.p2, 'endpoint', '端點 (Endpoint)', ent.id);
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
          ent.type === 'ellipse' ||
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
        } else if (ent.type === 'ellipse') {
          const { center, rx, ry } = ent;
          consider(
            { x: center.x + rx, y: center.y },
            'quadrant',
            '四分點 (Quadrant)',
            ent.id
          );
          consider(
            { x: center.x - rx, y: center.y },
            'quadrant',
            '四分點 (Quadrant)',
            ent.id
          );
          consider(
            { x: center.x, y: center.y + ry },
            'quadrant',
            '四分點 (Quadrant)',
            ent.id
          );
          consider(
            { x: center.x, y: center.y - ry },
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
      const angle = normalizeAngle(
        Math.atan2(p.y - entity.center.y, p.x - entity.center.x)
      );
      const s = normalizeAngle(entity.startAngle);
      const e = normalizeAngle(entity.endAngle);
      if (s <= e) return angle >= s - 0.05 && angle <= e + 0.05;
      return angle >= s - 0.05 || angle <= e + 0.05;
    }
    case 'ellipse': {
      if (entity.rx < 1e-3 || entity.ry < 1e-3) return false;
      const nx = (p.x - entity.center.x) / entity.rx;
      const ny = (p.y - entity.center.y) / entity.ry;
      const val = Math.hypot(nx, ny);
      const avgR = (entity.rx + entity.ry) / 2;
      return Math.abs(val - 1) * avgR <= tolerance;
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
  }
}

export function getDimensionLinePoints(entity: {
  p1: Point;
  p2: Point;
  offsetPoint: Point;
}): { dimP1: Point; dimP2: Point; mid: Point; angle: number; length: number } {
  const dx = entity.p2.x - entity.p1.x;
  const dy = entity.p2.y - entity.p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-5) {
    return {
      dimP1: entity.p1,
      dimP2: entity.p2,
      mid: entity.p1,
      angle: 0,
      length: 0,
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
  };
}

export function getEntityBounds(entity: CadEntity): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
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
    case 'ellipse':
      return {
        minX: entity.center.x - entity.rx,
        minY: entity.center.y - entity.ry,
        maxX: entity.center.x + entity.rx,
        maxY: entity.center.y + entity.ry,
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
    case 'arc':
    case 'ellipse':
    case 'polygon':
      return { ...entity, center: shift(entity.center) };
    case 'dimension':
      return {
        ...entity,
        p1: shift(entity.p1),
        p2: shift(entity.p2),
        offsetPoint: shift(entity.offsetPoint),
      };
    case 'text':
      return { ...entity, position: shift(entity.position) };
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
    case 'ellipse':
      return { ...entity, center: rot(entity.center) };
    case 'arc':
      return {
        ...entity,
        center: rot(entity.center),
        startAngle: entity.startAngle + angleRad,
        endAngle: entity.endAngle + angleRad,
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
    case 'ellipse':
    case 'polygon':
      return { ...entity, center: mir(entity.center) };
    case 'arc': {
      const pStart = {
        x: entity.center.x + entity.radius * Math.cos(entity.startAngle),
        y: entity.center.y + entity.radius * Math.sin(entity.startAngle),
      };
      const pEnd = {
        x: entity.center.x + entity.radius * Math.cos(entity.endAngle),
        y: entity.center.y + entity.radius * Math.sin(entity.endAngle),
      };
      const newCenter = mir(entity.center);
      const mStart = mir(pStart);
      const mEnd = mir(pEnd);
      return {
        ...entity,
        center: newCenter,
        startAngle: Math.atan2(mEnd.y - newCenter.y, mEnd.x - newCenter.x),
        endAngle: Math.atan2(mStart.y - newCenter.y, mStart.x - newCenter.x),
      };
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
      if (nextRadius <= 0.5) return null;
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
      if (maxX - minX + 2 * delta <= 1 || maxY - minY + 2 * delta <= 1) {
        return null;
      }
      return {
        ...entity,
        id: newId,
        p1: { x: minX - delta, y: minY - delta },
        p2: { x: maxX + delta, y: maxY + delta },
      };
    }
    case 'ellipse': {
      const d = dist(sidePoint, entity.center);
      const avg = (entity.rx + entity.ry) / 2;
      const sign = d >= avg ? 1 : -1;
      if (
        entity.rx + sign * offsetDist <= 1 ||
        entity.ry + sign * offsetDist <= 1
      )
        return null;
      return {
        ...entity,
        id: newId,
        rx: entity.rx + sign * offsetDist,
        ry: entity.ry + sign * offsetDist,
      };
    }
    default:
      return null;
  }
}

export function explodeEntity(entity: CadEntity): LineEntity[] | null {
  const segs = getEntitySegments(entity);
  if (segs.length === 0 || entity.type === 'line') return null;
  return segs.map(([p1, p2], idx) => ({
    id: `${entity.id}_exp_${idx}_${Date.now()}`,
    type: 'line',
    layerId: entity.layerId,
    color: entity.color,
    lineType: entity.lineType,
    lineWeight: entity.lineWeight,
    p1: { ...p1 },
    p2: { ...p2 },
  }));
}

export function getEntityGripHandles(entity: CadEntity): GripHandle[] {
  switch (entity.type) {
    case 'line':
      return [
        { entityId: entity.id, gripIndex: 0, point: entity.p1, type: 'vertex' },
        { entityId: entity.id, gripIndex: 1, point: entity.p2, type: 'vertex' },
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
    case 'ellipse':
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
          point: { x: entity.center.x + entity.rx, y: entity.center.y },
          type: 'radius',
        },
        {
          entityId: entity.id,
          gripIndex: 2,
          point: { x: entity.center.x, y: entity.center.y + entity.ry },
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
    case 'dimension':
      return [
        { entityId: entity.id, gripIndex: 0, point: entity.p1, type: 'vertex' },
        { entityId: entity.id, gripIndex: 1, point: entity.p2, type: 'vertex' },
        {
          entityId: entity.id,
          gripIndex: 2,
          point: entity.offsetPoint,
          type: 'midpoint',
        },
      ];
    case 'text':
      return [
        {
          entityId: entity.id,
          gripIndex: 0,
          point: entity.position,
          type: 'center',
        },
      ];
    case 'arc':
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
          point: {
            x: entity.center.x + entity.radius * Math.cos(entity.startAngle),
            y: entity.center.y + entity.radius * Math.sin(entity.startAngle),
          },
          type: 'vertex',
        },
        {
          entityId: entity.id,
          gripIndex: 2,
          point: {
            x: entity.center.x + entity.radius * Math.cos(entity.endAngle),
            y: entity.center.y + entity.radius * Math.sin(entity.endAngle),
          },
          type: 'vertex',
        },
      ];
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
        radius: Math.max(1, dist(entity.center, newPoint)),
      };
    }
    case 'ellipse': {
      if (gripIndex === 0) return { ...entity, center: newPoint };
      if (gripIndex === 1)
        return {
          ...entity,
          rx: Math.max(1, Math.abs(newPoint.x - entity.center.x)),
        };
      return {
        ...entity,
        ry: Math.max(1, Math.abs(newPoint.y - entity.center.y)),
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
      if (gripIndex === 0) return { ...entity, p1: newPoint };
      if (gripIndex === 1) return { ...entity, p2: newPoint };
      return { ...entity, offsetPoint: newPoint };
    }
    case 'text':
      return { ...entity, position: newPoint };
    case 'arc': {
      if (gripIndex === 0) return { ...entity, center: newPoint };
      if (gripIndex === 1)
        return {
          ...entity,
          startAngle: Math.atan2(
            newPoint.y - entity.center.y,
            newPoint.x - entity.center.x
          ),
        };
      return {
        ...entity,
        endAngle: Math.atan2(
          newPoint.y - entity.center.y,
          newPoint.x - entity.center.x
        ),
      };
    }
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
      let sweep = entity.endAngle - entity.startAngle;
      while (sweep < 0) sweep += Math.PI * 2;
      return {
        length: entity.radius * sweep,
      };
    }
    case 'ellipse': {
      const a = entity.rx;
      const b = entity.ry;
      const h = (a - b) ** 2 / ((a + b) ** 2 || 1);
      const perim =
        Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
      return {
        width: a * 2,
        height: b * 2,
        length: perim,
        area: Math.PI * a * b,
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
      return { length: len, area };
    }
    case 'dimension':
      return {
        length: dist(entity.p1, entity.p2),
      };
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

  for (const ent of entities) {
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
        '8.0',
        '1',
        ent.textOverride || `${length.toFixed(1)}`
      );
    }
  }

  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}

export function exportToSVG(entities: CadEntity[], layers: CadLayer[]): string {
  const visibleLayers = new Map(
    layers.filter((l) => l.visible).map((l) => [l.id, l])
  );
  const visibleEntities = entities.filter((e) => visibleLayers.has(e.layerId));

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
    const layer = visibleLayers.get(ent.layerId)!;
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
    } else if (ent.type === 'ellipse') {
      elements.push(
        `<ellipse cx="${ent.center.x}" cy="${sy(ent.center.y)}" rx="${ent.rx}" ry="${ent.ry}" fill="none" stroke="${stroke}" stroke-width="${lw}" ${dash} />`
      );
    } else if (ent.type === 'text') {
      elements.push(
        `<text x="${ent.position.x}" y="${sy(ent.position.y)}" fill="${stroke}" font-family="JetBrains Mono, monospace" font-size="${ent.fontSize}">${ent.content}</text>`
      );
    } else if (ent.type === 'dimension') {
      const { dimP1, dimP2, mid, length } = getDimensionLinePoints(ent);
      elements.push(
        `<line x1="${ent.p1.x}" y1="${sy(ent.p1.y)}" x2="${dimP1.x}" y2="${sy(dimP1.y)}" stroke="${stroke}" stroke-width="1" stroke-opacity="0.6" />`,
        `<line x1="${ent.p2.x}" y1="${sy(ent.p2.y)}" x2="${dimP2.x}" y2="${sy(dimP2.y)}" stroke="${stroke}" stroke-width="1" stroke-opacity="0.6" />`,
        `<line x1="${dimP1.x}" y1="${sy(dimP1.y)}" x2="${dimP2.x}" y2="${sy(dimP2.y)}" stroke="${stroke}" stroke-width="1.2" />`,
        `<text x="${mid.x}" y="${sy(mid.y) - 6}" fill="${stroke}" font-family="JetBrains Mono, monospace" font-size="10" text-anchor="middle">${ent.textOverride || `${length.toFixed(1)} mm`}</text>`
      );
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="100%" height="100%" style="background:#0B0F17">
  ${elements.join('\n  ')}
</svg>`;
}
