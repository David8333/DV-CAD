import {
  CadEntity,
  CadLayer,
  LineType,
  PdfWindowBounds,
  Point,
} from '../types/cad';
import {
  dist,
  flattenEntities,
  formatDimensionLabel,
  getDimensionLinePoints,
  getEntityBounds,
  getEntitySegments,
  getHatchSegments,
} from './geometry';

export type PdfColorTheme = 'white-color' | 'dark-blueprint' | 'monochrome';
export type PdfPaperFormat = 'a4-landscape' | 'a4-portrait' | 'a3-landscape';

export interface PdfPageInput {
  title: string;
  subtitle?: string;
  entities: CadEntity[];
  layers: CadLayer[];
  windowBounds?: PdfWindowBounds | null;
}

export interface PdfExportConfig {
  paperFormat: PdfPaperFormat;
  colorTheme: PdfColorTheme;
  includeTitleBlock: boolean;
  includeGrid: boolean;
}

function getPaperDimensions(format: PdfPaperFormat): {
  widthPt: number;
  heightPt: number;
  label: string;
} {
  switch (format) {
    case 'a4-portrait':
      return {
        widthPt: 595.28,
        heightPt: 841.89,
        label: 'A4 直向 (210×297 mm)',
      };
    case 'a3-landscape':
      return {
        widthPt: 1190.55,
        heightPt: 841.89,
        label: 'A3 橫向 (420×297 mm)',
      };
    case 'a4-landscape':
    default:
      return {
        widthPt: 841.89,
        heightPt: 595.28,
        label: 'A4 橫向 (297×210 mm)',
      };
  }
}

/**
 * Map a CAD entity color for crisp visibility on the selected PDF background theme.
 */
function resolvePrintColor(rawColor: string, theme: PdfColorTheme): string {
  if (theme === 'monochrome') {
    return '#000000';
  }
  if (theme === 'dark-blueprint') {
    return rawColor || '#F8FAFC';
  }
  // 'white-color': convert pure white or very pale colors to dark slate so they print clearly on white paper
  const upper = (rawColor || '').trim().toUpperCase();
  if (
    upper === '#FFFFFF' ||
    upper === '#F8FAFC' ||
    upper === '#F1F5F9' ||
    upper === '#E2E8F0' ||
    upper === 'WHITE'
  ) {
    return '#0F172A';
  }
  if (upper === '#38BDF8' || upper === '#7DD3FC') {
    return '#0284C7';
  }
  if (upper === '#FBBF24' || upper === '#FDE047') {
    return '#B45309';
  }
  if (upper === '#34D399' || upper === '#6EE7B7') {
    return '#047857';
  }
  if (upper === '#F87171' || upper === '#FDA4AF') {
    return '#BE123C';
  }
  return rawColor || '#0F172A';
}

function hexToRgbNormalized(colorStr: string): [number, number, number] {
  const clean = (colorStr || '#000000').trim();
  if (clean.startsWith('#')) {
    const hex = clean.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16) / 255;
      const g = parseInt(hex[1] + hex[1], 16) / 255;
      const b = parseInt(hex[2] + hex[2], 16) / 255;
      return [r || 0, g || 0, b || 0];
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      return [
        Number.isFinite(r) ? r : 0,
        Number.isFinite(g) ? g : 0,
        Number.isFinite(b) ? b : 0,
      ];
    }
  }
  return [0, 0, 0];
}

function pdfRgbStroke(colorStr: string): string {
  const [r, g, b] = hexToRgbNormalized(colorStr);
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`;
}

function pdfRgbFill(colorStr: string): string {
  const [r, g, b] = hexToRgbNormalized(colorStr);
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`;
}

interface PageLayoutPt {
  widthPt: number;
  heightPt: number;
  paperLabel: string;
  outerMarginPt: number;
  titleBlockHeightPt: number;
  viewLeftPt: number;
  viewTopPt: number;
  viewWidthPt: number;
  viewHeightPt: number;
  worldMinX: number;
  worldMinY: number;
  worldMaxX: number;
  worldMaxY: number;
  worldSpanX: number;
  worldSpanY: number;
  worldCenterX: number;
  worldCenterY: number;
  zoomPt: number;
  leafEntities: CadEntity[];
  layerMap: Map<string, CadLayer>;
  wallLayer?: CadLayer;
  worldToPt: (wx: number, wy: number) => Point;
}

function computePageLayoutPt(
  page: PdfPageInput,
  config: PdfExportConfig
): PageLayoutPt {
  const paper = getPaperDimensions(config.paperFormat);
  const widthPt = paper.widthPt;
  const heightPt = paper.heightPt;

  const outerMarginPt = 20;
  const titleBlockHeightPt = config.includeTitleBlock ? 46 : 0;

  const viewLeftPt = outerMarginPt;
  const viewTopPt = outerMarginPt;
  const viewWidthPt = Math.max(80, widthPt - outerMarginPt * 2);
  const viewHeightPt = Math.max(
    80,
    heightPt - outerMarginPt * 2 - titleBlockHeightPt
  );

  const layerMap = new Map(page.layers.map((l) => [l.id, l]));
  const wallLayer =
    layerMap.get('WALL') ||
    page.layers.find(
      (l) => l.name.includes('建築主牆') || l.name.includes('輪廓')
    );

  const leafEntities = flattenEntities(page.entities).filter((ent) => {
    const layer =
      (ent.type === 'hatch' && wallLayer
        ? wallLayer
        : layerMap.get(ent.layerId)) || page.layers[0];
    return layer ? layer.visible : true;
  });

  let worldMinX = -200;
  let worldMinY = -150;
  let worldMaxX = 200;
  let worldMaxY = 150;

  if (
    page.windowBounds &&
    Math.abs(page.windowBounds.maxX - page.windowBounds.minX) > 0.01 &&
    Math.abs(page.windowBounds.maxY - page.windowBounds.minY) > 0.01
  ) {
    worldMinX = Math.min(page.windowBounds.minX, page.windowBounds.maxX);
    worldMaxX = Math.max(page.windowBounds.minX, page.windowBounds.maxX);
    worldMinY = Math.min(page.windowBounds.minY, page.windowBounds.maxY);
    worldMaxY = Math.max(page.windowBounds.minY, page.windowBounds.maxY);
  } else if (leafEntities.length > 0) {
    const bounds = leafEntities.map(getEntityBounds);
    const minX = Math.min(...bounds.map((b) => b.minX));
    const minY = Math.min(...bounds.map((b) => b.minY));
    const maxX = Math.max(...bounds.map((b) => b.maxX));
    const maxY = Math.max(...bounds.map((b) => b.maxY));
    const spanX = Math.max(20, maxX - minX);
    const spanY = Math.max(20, maxY - minY);
    const padX = spanX * 0.08;
    const padY = spanY * 0.08;
    worldMinX = minX - padX;
    worldMaxX = maxX + padX;
    worldMinY = minY - padY;
    worldMaxY = maxY + padY;
  }

  const worldSpanX = Math.max(1, worldMaxX - worldMinX);
  const worldSpanY = Math.max(1, worldMaxY - worldMinY);
  const worldCenterX = (worldMinX + worldMaxX) / 2;
  const worldCenterY = (worldMinY + worldMaxY) / 2;

  const paddingPt = page.windowBounds ? 10 : 18;
  const usableW = Math.max(40, viewWidthPt - paddingPt * 2);
  const usableH = Math.max(40, viewHeightPt - paddingPt * 2);
  const zoomPt = Math.min(usableW / worldSpanX, usableH / worldSpanY);

  const viewCenterX = viewLeftPt + viewWidthPt / 2;
  const viewCenterY = viewTopPt + viewHeightPt / 2;

  // Returns top-down page coordinates in points (pt)
  const worldToPt = (wx: number, wy: number): Point => ({
    x: viewCenterX + (wx - worldCenterX) * zoomPt,
    y: viewCenterY - (wy - worldCenterY) * zoomPt,
  });

  return {
    widthPt,
    heightPt,
    paperLabel: paper.label,
    outerMarginPt,
    titleBlockHeightPt,
    viewLeftPt,
    viewTopPt,
    viewWidthPt,
    viewHeightPt,
    worldMinX,
    worldMinY,
    worldMaxX,
    worldMaxY,
    worldSpanX,
    worldSpanY,
    worldCenterX,
    worldCenterY,
    zoomPt,
    leafEntities,
    layerMap,
    wallLayer,
    worldToPt,
  };
}

/**
 * Render a single CAD page onto an HTMLCanvasElement (used for live modal preview).
 */
export function renderCadPageToCanvas(
  page: PdfPageInput,
  config: PdfExportConfig,
  pageIndex = 0,
  totalPages = 1,
  scaleDownForPreview = false
): HTMLCanvasElement {
  const layout = computePageLayoutPt(page, config);
  const ptScale = scaleDownForPreview ? 1.6 : 3.2;
  const widthPx = Math.round(layout.widthPt * ptScale);
  const heightPx = Math.round(layout.heightPt * ptScale);

  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.scale(ptScale, ptScale);

  const isDark = config.colorTheme === 'dark-blueprint';
  const bgColor = isDark ? '#090D14' : '#FFFFFF';
  const borderColor = isDark ? '#334155' : '#1E293B';
  const subBorderColor = isDark ? '#1E293B' : '#CBD5E1';
  const primaryTextColor = isDark ? '#F8FAFC' : '#0F172A';
  const secondaryTextColor = isDark ? '#94A3B8' : '#475569';

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, layout.widthPt, layout.heightPt);

  const {
    outerMarginPt,
    titleBlockHeightPt,
    viewLeftPt,
    viewTopPt,
    viewWidthPt,
    viewHeightPt,
    worldMinX,
    worldMinY,
    worldMaxX,
    worldMaxY,
    worldSpanX,
    worldSpanY,
    zoomPt,
    leafEntities,
    layerMap,
    wallLayer,
    worldToPt,
  } = layout;

  ctx.save();
  ctx.beginPath();
  ctx.rect(viewLeftPt, viewTopPt, viewWidthPt, viewHeightPt);
  ctx.clip();

  if (config.includeGrid) {
    let gridStep = 10;
    const rawSpan = Math.max(worldSpanX, worldSpanY);
    if (rawSpan > 2000) gridStep = 200;
    else if (rawSpan > 800) gridStep = 100;
    else if (rawSpan > 300) gridStep = 50;
    else if (rawSpan > 100) gridStep = 20;
    else if (rawSpan < 30) gridStep = 2;

    ctx.save();
    ctx.lineWidth = 0.45;
    ctx.strokeStyle = isDark
      ? 'rgba(148, 163, 184, 0.14)'
      : 'rgba(148, 163, 184, 0.25)';
    ctx.beginPath();

    const gxStart = Math.floor(worldMinX / gridStep) * gridStep;
    const gxEnd = Math.ceil(worldMaxX / gridStep) * gridStep;
    for (let gx = gxStart; gx <= gxEnd; gx += gridStep) {
      const sx = worldToPt(gx, 0).x;
      if (sx >= viewLeftPt && sx <= viewLeftPt + viewWidthPt) {
        ctx.moveTo(sx, viewTopPt);
        ctx.lineTo(sx, viewTopPt + viewHeightPt);
      }
    }

    const gyStart = Math.floor(worldMinY / gridStep) * gridStep;
    const gyEnd = Math.ceil(worldMaxY / gridStep) * gridStep;
    for (let gy = gyStart; gy <= gyEnd; gy += gridStep) {
      const sy = worldToPt(0, gy).y;
      if (sy >= viewTopPt && sy <= viewTopPt + viewHeightPt) {
        ctx.moveTo(viewLeftPt, sy);
        ctx.lineTo(viewLeftPt + viewWidthPt, sy);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  if (page.windowBounds) {
    const pTopLeft = worldToPt(worldMinX, worldMaxY);
    const pBottomRight = worldToPt(worldMaxX, worldMinY);
    const clipX = Math.min(pTopLeft.x, pBottomRight.x);
    const clipY = Math.min(pTopLeft.y, pBottomRight.y);
    const clipW = Math.abs(pBottomRight.x - pTopLeft.x);
    const clipH = Math.abs(pBottomRight.y - pTopLeft.y);
    ctx.beginPath();
    ctx.rect(clipX, clipY, clipW, clipH);
    ctx.clip();
  }

  const applyDash = (lt: LineType) => {
    switch (lt) {
      case 'dashed':
        ctx.setLineDash([5, 3]);
        break;
      case 'center':
        ctx.setLineDash([10, 2.5, 2, 2.5]);
        break;
      case 'dotted':
        ctx.setLineDash([1.5, 2.5]);
        break;
      default:
        ctx.setLineDash([]);
    }
  };

  for (const ent of leafEntities) {
    const layer =
      (ent.type === 'hatch' && wallLayer
        ? wallLayer
        : layerMap.get(ent.layerId)) || page.layers[0];
    if (!layer || !layer.visible) continue;

    const rawColor =
      ent.color ||
      (ent.type === 'hatch' && wallLayer ? wallLayer.color : layer.color);
    const color = resolvePrintColor(rawColor, config.colorTheme);
    const lineType =
      ent.lineType ||
      (ent.type === 'hatch' && wallLayer ? wallLayer.lineType : layer.lineType);
    const rawWeight =
      ent.lineWeight ||
      (ent.type === 'hatch' && wallLayer
        ? wallLayer.lineWeight
        : layer.lineWeight) ||
      0.25;
    const strokeWidth = Math.max(0.65, rawWeight * 2.4);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    applyDash(lineType);

    switch (ent.type) {
      case 'line': {
        const s1 = worldToPt(ent.p1.x, ent.p1.y);
        const s2 = worldToPt(ent.p2.x, ent.p2.y);
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();
        break;
      }
      case 'rectangle':
      case 'polyline':
      case 'polygon': {
        const segs = getEntitySegments(ent);
        if (segs.length > 0) {
          ctx.beginPath();
          for (const [p1, p2] of segs) {
            const s1 = worldToPt(p1.x, p1.y);
            const s2 = worldToPt(p2.x, p2.y);
            ctx.moveTo(s1.x, s1.y);
            ctx.lineTo(s2.x, s2.y);
          }
          ctx.stroke();
        }
        break;
      }
      case 'circle': {
        const sc = worldToPt(ent.center.x, ent.center.y);
        ctx.beginPath();
        ctx.arc(sc.x, sc.y, Math.max(0.5, ent.radius * zoomPt), 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'arc': {
        const sc = worldToPt(ent.center.x, ent.center.y);
        ctx.beginPath();
        ctx.arc(
          sc.x,
          sc.y,
          Math.max(0.5, ent.radius * zoomPt),
          -ent.endAngle,
          -ent.startAngle
        );
        ctx.stroke();
        break;
      }
      case 'hatch': {
        ctx.setLineDash([]);
        ctx.lineWidth = Math.max(0.45, strokeWidth * 0.75);
        const hatchSegs = getHatchSegments(ent);
        if (hatchSegs.length > 0) {
          ctx.beginPath();
          for (const [p1, p2] of hatchSegs) {
            const s1 = worldToPt(p1.x, p1.y);
            const s2 = worldToPt(p2.x, p2.y);
            ctx.moveTo(s1.x, s1.y);
            ctx.lineTo(s2.x, s2.y);
          }
          ctx.stroke();
        }
        break;
      }
      case 'dimension': {
        ctx.setLineDash([]);
        const {
          dimP1,
          dimP2,
          mid,
          length,
          isDiameter,
          isRadius,
          center,
          leaderOutside,
          leaderElbow,
          leaderLanding,
        } = getDimensionLinePoints(ent);

        const sp1 = worldToPt(ent.p1.x, ent.p1.y);
        const sp2 = worldToPt(ent.p2.x, ent.p2.y);
        const sd1 = worldToPt(dimP1.x, dimP1.y);
        const sd2 = worldToPt(dimP2.x, dimP2.y);
        const smid = worldToPt(mid.x, mid.y);

        const ang = Math.atan2(sd2.y - sd1.y, sd2.x - sd1.x);
        const arrowLen = Math.min(7, Math.max(3.5, dist(sd1, sd2) * 0.14));
        const drawArrow = (tip: Point, dirAngle: number) => {
          ctx.beginPath();
          ctx.moveTo(tip.x, tip.y);
          ctx.lineTo(
            tip.x - arrowLen * Math.cos(dirAngle - 0.35),
            tip.y - arrowLen * Math.sin(dirAngle - 0.35)
          );
          ctx.lineTo(
            tip.x - arrowLen * Math.cos(dirAngle + 0.35),
            tip.y - arrowLen * Math.sin(dirAngle + 0.35)
          );
          ctx.closePath();
          ctx.fill();
        };

        if (isRadius || isDiameter) {
          if (center) {
            const sc = worldToPt(center.x, center.y);
            ctx.save();
            ctx.lineWidth = 0.6;
            const cSize = 3;
            ctx.beginPath();
            ctx.moveTo(sc.x - cSize, sc.y);
            ctx.lineTo(sc.x + cSize, sc.y);
            ctx.moveTo(sc.x, sc.y - cSize);
            ctx.lineTo(sc.x, sc.y + cSize);
            ctx.stroke();
            ctx.restore();
          }
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(sd1.x, sd1.y);
          ctx.lineTo(sd2.x, sd2.y);
          if (leaderOutside && leaderElbow && leaderLanding) {
            const sElbow = worldToPt(leaderElbow.x, leaderElbow.y);
            const sLanding = worldToPt(leaderLanding.x, leaderLanding.y);
            ctx.moveTo(sd2.x, sd2.y);
            ctx.lineTo(sElbow.x, sElbow.y);
            ctx.lineTo(sLanding.x, sLanding.y);
          }
          ctx.stroke();
          if (isDiameter) drawArrow(sd1, ang + Math.PI);
          drawArrow(sd2, ang);
        } else {
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(sp1.x, sp1.y);
          ctx.lineTo(sd1.x, sd1.y);
          ctx.moveTo(sp2.x, sp2.y);
          ctx.lineTo(sd2.x, sd2.y);
          ctx.stroke();

          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(sd1.x, sd1.y);
          ctx.lineTo(sd2.x, sd2.y);
          ctx.stroke();

          drawArrow(sd1, ang + Math.PI);
          drawArrow(sd2, ang);
        }

        const baseFontSize = ent.fontSize || 11;
        const fontPt = Math.max(6.5, baseFontSize * 0.78);
        const tolFontPt = Math.max(5, fontPt * 0.72);
        const formatted = formatDimensionLabel(ent, length);

        ctx.font = `700 ${fontPt}px "JetBrains Mono", "Noto Sans TC", monospace`;
        const mainW = ctx.measureText(formatted.mainText).width;

        let symW = 0;
        let devW = 0;
        if (formatted.symmetricText) {
          ctx.font = `700 ${fontPt * 0.88}px "JetBrains Mono", monospace`;
          symW = ctx.measureText(` ${formatted.symmetricText}`).width;
        } else if (formatted.upperText && formatted.lowerText) {
          ctx.font = `700 ${tolFontPt}px "JetBrains Mono", monospace`;
          devW =
            Math.max(
              ctx.measureText(formatted.upperText).width,
              ctx.measureText(formatted.lowerText).width
            ) + 3;
        }

        const totalW = mainW + symW + devW;
        const boxH =
          formatted.upperText && formatted.lowerText
            ? Math.max(fontPt + 4, tolFontPt * 2 + 3)
            : fontPt + 3;

        ctx.fillStyle = bgColor;
        ctx.fillRect(
          smid.x - totalW / 2 - 2,
          smid.y - boxH / 2,
          totalW + 4,
          boxH
        );

        ctx.fillStyle = color;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';

        const startX = smid.x - totalW / 2;
        ctx.font = `700 ${fontPt}px "JetBrains Mono", "Noto Sans TC", monospace`;
        ctx.fillText(formatted.mainText, startX, smid.y);

        if (formatted.symmetricText) {
          ctx.font = `700 ${fontPt * 0.88}px "JetBrains Mono", monospace`;
          ctx.fillText(` ${formatted.symmetricText}`, startX + mainW, smid.y);
        } else if (formatted.upperText && formatted.lowerText) {
          ctx.font = `700 ${tolFontPt}px "JetBrains Mono", monospace`;
          ctx.fillText(
            formatted.upperText,
            startX + mainW + 2,
            smid.y - tolFontPt * 0.52
          );
          ctx.fillText(
            formatted.lowerText,
            startX + mainW + 2,
            smid.y + tolFontPt * 0.52
          );
        }
        break;
      }
      case 'text': {
        const sp = worldToPt(ent.position.x, ent.position.y);
        const fontPt = Math.max(6.5, ent.fontSize * zoomPt);
        ctx.font = `600 ${fontPt}px "JetBrains Mono", "Plus Jakarta Sans", "Noto Sans TC", sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.save();
        ctx.translate(sp.x, sp.y);
        if (ent.rotation) {
          ctx.rotate((-ent.rotation * Math.PI) / 180);
        }
        ctx.fillText(ent.content, 0, 0);
        ctx.restore();
        break;
      }
    }
    ctx.restore();
  }

  ctx.restore();

  // Viewport Border & Title Block
  ctx.save();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(
    outerMarginPt,
    outerMarginPt,
    layout.widthPt - outerMarginPt * 2,
    layout.heightPt - outerMarginPt * 2
  );

  if (config.includeTitleBlock) {
    const tbTop = viewTopPt + viewHeightPt;
    ctx.beginPath();
    ctx.moveTo(outerMarginPt, tbTop);
    ctx.lineTo(layout.widthPt - outerMarginPt, tbTop);
    ctx.stroke();

    const col1Width = viewWidthPt * 0.44;
    const col2Width = viewWidthPt * 0.34;
    const x1 = outerMarginPt + col1Width;
    const x2 = x1 + col2Width;

    ctx.strokeStyle = subBorderColor;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x1, tbTop);
    ctx.lineTo(x1, layout.heightPt - outerMarginPt);
    ctx.moveTo(x2, tbTop);
    ctx.lineTo(x2, layout.heightPt - outerMarginPt);
    ctx.stroke();

    const padX = 10;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    ctx.fillStyle = primaryTextColor;
    ctx.font = `700 11px "Plus Jakarta Sans", "Noto Sans TC", sans-serif`;
    ctx.fillText(
      `VektorCAD 工程圖面 — ${page.title}`,
      outerMarginPt + padX,
      tbTop + titleBlockHeightPt * 0.36
    );

    ctx.fillStyle = secondaryTextColor;
    ctx.font = `500 8px "JetBrains Mono", "Noto Sans TC", monospace`;
    const scopeDesc = page.windowBounds
      ? `窗選區域匯出: (${worldMinX.toFixed(1)}, ${worldMinY.toFixed(1)}) ~ (${worldMaxX.toFixed(1)}, ${worldMaxY.toFixed(1)}) mm`
      : page.subtitle ||
        `分頁全圖匯出 · 圖元數: ${leafEntities.length} · 範圍: ${worldSpanX.toFixed(1)} × ${worldSpanY.toFixed(1)} mm`;
    ctx.fillText(
      scopeDesc,
      outerMarginPt + padX,
      tbTop + titleBlockHeightPt * 0.73
    );

    ctx.fillStyle = primaryTextColor;
    ctx.font = `600 8.5px "JetBrains Mono", "Noto Sans TC", monospace`;
    ctx.fillText(
      `圖紙規格: ${layout.paperLabel}`,
      x1 + padX,
      tbTop + titleBlockHeightPt * 0.36
    );
    ctx.fillStyle = secondaryTextColor;
    ctx.font = `500 7.5px "JetBrains Mono", "Noto Sans TC", monospace`;
    ctx.fillText(
      `單位: mm (公制) · 視角範圍: ${worldSpanX.toFixed(1)}×${worldSpanY.toFixed(1)} mm`,
      x1 + padX,
      tbTop + titleBlockHeightPt * 0.73
    );

    const nowStr = new Date().toISOString().slice(0, 10);
    ctx.fillStyle = primaryTextColor;
    ctx.font = `700 9px "JetBrains Mono", "Noto Sans TC", monospace`;
    ctx.fillText(
      `頁次: ${pageIndex + 1} / ${totalPages}`,
      x2 + padX,
      tbTop + titleBlockHeightPt * 0.36
    );
    ctx.fillStyle = secondaryTextColor;
    ctx.font = `500 7.5px "JetBrains Mono", monospace`;
    ctx.fillText(
      `匯出日期: ${nowStr}`,
      x2 + padX,
      tbTop + titleBlockHeightPt * 0.73
    );
  }
  ctx.restore();

  return canvas;
}

/**
 * Check if a string can be losslessly represented in PDF WinAnsiEncoding (ASCII + Ø, ±, °, ×, ·, —).
 */
const WIN_ANSI_SPECIAL: Record<number, number> = {
  0x00d8: 0xd8, // Ø
  0x00f8: 0xf8, // ø
  0x00b1: 0xb1, // ±
  0x00b0: 0xb0, // °
  0x00d7: 0xd7, // ×
  0x00b7: 0xb7, // ·
  0x2014: 0x97, // —
  0x2013: 0x96, // –
};

function isWinAnsiString(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0x20 && code <= 0x7e) continue;
    if (WIN_ANSI_SPECIAL[code] !== undefined) continue;
    return false;
  }
  return true;
}

function encodeWinAnsiLiteral(str: string): string {
  let out = '(';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code === 0x28 || code === 0x29 || code === 0x5c) {
      out += '\\' + str[i];
    } else if (code >= 0x20 && code <= 0x7e) {
      out += str[i];
    } else {
      const mapped = WIN_ANSI_SPECIAL[code] ?? 0x3f;
      out += '\\' + mapped.toString(8).padStart(3, '0');
    }
  }
  out += ')';
  return out;
}

let sharedMeasureCanvas: HTMLCanvasElement | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (!sharedMeasureCanvas) {
    sharedMeasureCanvas = document.createElement('canvas');
    sharedMeasureCanvas.width = 2400;
    sharedMeasureCanvas.height = 320;
  }
  return sharedMeasureCanvas.getContext('2d');
}

function measureTextWidthPt(
  text: string,
  fontPt: number,
  fontWeight = 600
): number {
  const ctx = getMeasureCtx();
  if (!ctx) return text.length * fontPt * 0.6;
  ctx.font = `${fontWeight} ${fontPt}px "JetBrains Mono", "Plus Jakarta Sans", "Noto Sans TC", sans-serif`;
  return ctx.measureText(text).width;
}

/**
 * Render any text (including Traditional Chinese / CJK) into crisp PDF vector paths (`re f`)
 * by sampling glyph outlines at high resolution (4.5x oversampling = 324 DPI) and vertically
 * merging identical scanline runs. This guarantees 100% vector sharpness with zero JPEG blur
 * and zero font-embedding dependencies.
 */
function renderUnicodeTextToPdfVectors(
  text: string,
  anchorXPt: number,
  middleYPt: number,
  heightPt: number,
  fontPt: number,
  colorHex: string,
  rotationDeg = 0,
  fontWeight = 600
): string {
  if (!text || !text.trim()) return '';
  const oversample = 4.5;
  const fontPx = Math.max(14, Math.round(fontPt * oversample));
  const scaleToPt = fontPt / fontPx;

  const ctx = getMeasureCtx();
  if (!ctx) return '';

  const fontSpec = `${fontWeight} ${fontPx}px "Plus Jakarta Sans", "Noto Sans TC", "JetBrains Mono", sans-serif`;
  ctx.font = fontSpec;
  const measuredW = Math.ceil(ctx.measureText(text).width);
  const padPx = Math.ceil(fontPx * 0.35);
  const boxW = Math.min(2380, Math.max(16, measuredW + padPx * 2));
  const boxH = Math.min(310, Math.max(16, Math.ceil(fontPx * 1.55)));

  if (sharedMeasureCanvas!.width < boxW) sharedMeasureCanvas!.width = boxW;
  if (sharedMeasureCanvas!.height < boxH) sharedMeasureCanvas!.height = boxH;

  ctx.clearRect(0, 0, boxW, boxH);
  ctx.font = fontSpec;
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const originX = padPx;
  const originY = Math.round(boxH / 2);
  ctx.fillText(text, originX, originY);

  const imgData = ctx.getImageData(0, 0, boxW, boxH).data;

  // Extract horizontal runs per row and merge vertically identical runs
  const activeRuns = new Map<
    string,
    { x0: number; x1: number; yStart: number; yEnd: number }
  >();
  const finishedRects: Array<{
    x0: number;
    x1: number;
    yStart: number;
    yEnd: number;
  }> = [];

  for (let y = 0; y < boxH; y++) {
    const rowOffset = y * boxW * 4;
    const currentRowKeys = new Set<string>();
    let x = 0;
    while (x < boxW) {
      while (x < boxW && imgData[rowOffset + x * 4 + 3] < 118) {
        x++;
      }
      if (x >= boxW) break;
      const x0 = x;
      while (x < boxW && imgData[rowOffset + x * 4 + 3] >= 118) {
        x++;
      }
      const x1 = x;
      const key = `${x0}:${x1}`;
      currentRowKeys.add(key);
      const existing = activeRuns.get(key);
      if (existing && existing.yEnd === y) {
        existing.yEnd = y + 1;
      } else {
        if (existing) finishedRects.push(existing);
        activeRuns.set(key, { x0, x1, yStart: y, yEnd: y + 1 });
      }
    }
    for (const [key, run] of activeRuns.entries()) {
      if (!currentRowKeys.has(key)) {
        finishedRects.push(run);
        activeRuns.delete(key);
      }
    }
  }
  for (const run of activeRuns.values()) {
    finishedRects.push(run);
  }

  if (finishedRects.length === 0) return '';

  const pdfAnchorX = anchorXPt;
  const pdfAnchorY = heightPt - middleYPt;
  const rad = (rotationDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);

  const lines: string[] = [];
  lines.push('q');
  lines.push(pdfRgbFill(colorHex));
  lines.push(
    `${cosA.toFixed(4)} ${sinA.toFixed(4)} ${(-sinA).toFixed(4)} ${cosA.toFixed(4)} ${pdfAnchorX.toFixed(2)} ${pdfAnchorY.toFixed(2)} cm`
  );

  let batch: string[] = [];
  for (let i = 0; i < finishedRects.length; i++) {
    const r = finishedRects[i];
    const rx = (r.x0 - originX) * scaleToPt;
    const ry = (originY - r.yEnd) * scaleToPt;
    const rw = (r.x1 - r.x0) * scaleToPt;
    const rh = (r.yEnd - r.yStart) * scaleToPt;
    batch.push(
      `${rx.toFixed(2)} ${ry.toFixed(2)} ${rw.toFixed(2)} ${rh.toFixed(2)} re`
    );
    if (batch.length >= 200) {
      lines.push(batch.join(' ') + ' f');
      batch = [];
    }
  }
  if (batch.length > 0) {
    lines.push(batch.join(' ') + ' f');
  }
  lines.push('Q');
  return lines.join('\n');
}

/**
 * Draw crisp text in the PDF content stream:
 * - Uses native PDF Type1 vector font (/F1 Helvetica-Bold or /F2 Helvetica) for pure WinAnsi/ASCII strings
 *   (dimension numbers, tolerances, diameters, radii, dates, English labels)
 * - Uses high-resolution vector outline paths for strings containing CJK/Chinese characters
 */
function drawPdfText(
  text: string,
  anchorXPt: number,
  middleYPt: number,
  heightPt: number,
  fontPt: number,
  colorHex: string,
  rotationDeg = 0,
  bold = true
): string {
  if (!text) return '';
  if (isWinAnsiString(text)) {
    const pdfX = anchorXPt;
    const pdfY = heightPt - middleYPt;
    const rad = (rotationDeg * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    // Offset baseline by -0.34 * fontPt from vertical middle in local text space
    const baselineOffset = -fontPt * 0.34;
    const tx = pdfX - baselineOffset * sinA;
    const ty = pdfY + baselineOffset * cosA;
    const fontName = bold ? '/F1' : '/F2';
    return [
      'q',
      pdfRgbFill(colorHex),
      'BT',
      `${fontName} ${fontPt.toFixed(2)} Tf`,
      `${cosA.toFixed(4)} ${sinA.toFixed(4)} ${(-sinA).toFixed(4)} ${cosA.toFixed(4)} ${tx.toFixed(2)} ${ty.toFixed(2)} Tm`,
      `${encodeWinAnsiLiteral(text)} Tj`,
      'ET',
      'Q',
    ].join('\n');
  }
  return renderUnicodeTextToPdfVectors(
    text,
    anchorXPt,
    middleYPt,
    heightPt,
    fontPt,
    colorHex,
    rotationDeg,
    bold ? 700 : 500
  );
}

/**
 * Build a pure vector PDF content stream for a single CAD page.
 */
function buildVectorPdfPageStream(
  page: PdfPageInput,
  config: PdfExportConfig,
  pageIndex: number,
  totalPages: number
): { contentStream: string; widthPt: number; heightPt: number } {
  const layout = computePageLayoutPt(page, config);
  const {
    widthPt,
    heightPt,
    paperLabel,
    outerMarginPt,
    titleBlockHeightPt,
    viewLeftPt,
    viewTopPt,
    viewWidthPt,
    viewHeightPt,
    worldMinX,
    worldMinY,
    worldMaxX,
    worldMaxY,
    worldSpanX,
    worldSpanY,
    zoomPt,
    leafEntities,
    layerMap,
    wallLayer,
    worldToPt,
  } = layout;

  const toPdfY = (yTopDownPt: number) => heightPt - yTopDownPt;

  const isDark = config.colorTheme === 'dark-blueprint';
  const bgColor = isDark ? '#090D14' : '#FFFFFF';
  const borderColor = isDark ? '#334155' : '#1E293B';
  const subBorderColor = isDark ? '#1E293B' : '#CBD5E1';
  const primaryTextColor = isDark ? '#F8FAFC' : '#0F172A';
  const secondaryTextColor = isDark ? '#94A3B8' : '#475569';
  const gridColor = isDark ? '#1E293B' : '#E2E8F0';

  const ops: string[] = [];

  // 1. Page Background Fill (Vector Rectangle)
  ops.push('q');
  ops.push(pdfRgbFill(bgColor));
  ops.push(`0 0 ${widthPt.toFixed(2)} ${heightPt.toFixed(2)} re f`);
  ops.push('Q');

  // 2. Clip to Drawing Viewport
  ops.push('q');
  const viewBottomPdfY = toPdfY(viewTopPt + viewHeightPt);
  ops.push(
    `${viewLeftPt.toFixed(2)} ${viewBottomPdfY.toFixed(2)} ${viewWidthPt.toFixed(2)} ${viewHeightPt.toFixed(2)} re W n`
  );

  // Optional Coordinate Grid (Pure Vector Lines)
  if (config.includeGrid) {
    let gridStep = 10;
    const rawSpan = Math.max(worldSpanX, worldSpanY);
    if (rawSpan > 2000) gridStep = 200;
    else if (rawSpan > 800) gridStep = 100;
    else if (rawSpan > 300) gridStep = 50;
    else if (rawSpan > 100) gridStep = 20;
    else if (rawSpan < 30) gridStep = 2;

    ops.push('q');
    ops.push('0.35 w');
    ops.push('[] 0 d');
    ops.push(pdfRgbStroke(gridColor));

    const gxStart = Math.floor(worldMinX / gridStep) * gridStep;
    const gxEnd = Math.ceil(worldMaxX / gridStep) * gridStep;
    const yTopPdf = toPdfY(viewTopPt);
    const yBotPdf = toPdfY(viewTopPt + viewHeightPt);
    for (let gx = gxStart; gx <= gxEnd; gx += gridStep) {
      const sx = worldToPt(gx, 0).x;
      if (sx >= viewLeftPt && sx <= viewLeftPt + viewWidthPt) {
        ops.push(
          `${sx.toFixed(2)} ${yTopPdf.toFixed(2)} m ${sx.toFixed(2)} ${yBotPdf.toFixed(2)} l`
        );
      }
    }

    const gyStart = Math.floor(worldMinY / gridStep) * gridStep;
    const gyEnd = Math.ceil(worldMaxY / gridStep) * gridStep;
    for (let gy = gyStart; gy <= gyEnd; gy += gridStep) {
      const sy = worldToPt(0, gy).y;
      if (sy >= viewTopPt && sy <= viewTopPt + viewHeightPt) {
        const py = toPdfY(sy);
        ops.push(
          `${viewLeftPt.toFixed(2)} ${py.toFixed(2)} m ${(viewLeftPt + viewWidthPt).toFixed(2)} ${py.toFixed(2)} l`
        );
      }
    }
    ops.push('S');
    ops.push('Q');
  }

  // Optional Window Bounds Clip
  if (page.windowBounds) {
    const pTopLeft = worldToPt(worldMinX, worldMaxY);
    const pBottomRight = worldToPt(worldMaxX, worldMinY);
    const clipX = Math.min(pTopLeft.x, pBottomRight.x);
    const clipTopY = Math.min(pTopLeft.y, pBottomRight.y);
    const clipW = Math.abs(pBottomRight.x - pTopLeft.x);
    const clipH = Math.abs(pBottomRight.y - pTopLeft.y);
    const clipBottomPdfY = toPdfY(clipTopY + clipH);
    ops.push(
      `${clipX.toFixed(2)} ${clipBottomPdfY.toFixed(2)} ${clipW.toFixed(2)} ${clipH.toFixed(2)} re W n`
    );
  }

  const getDashOp = (lt: LineType): string => {
    switch (lt) {
      case 'dashed':
        return '[5 3] 0 d';
      case 'center':
        return '[10 2.5 2 2.5] 0 d';
      case 'dotted':
        return '[1.5 2.5] 0 d';
      default:
        return '[] 0 d';
    }
  };

  // 3. Render CAD Entities as 100% Native Vector Paths & Crisp Vector Text
  for (const ent of leafEntities) {
    const layer =
      (ent.type === 'hatch' && wallLayer
        ? wallLayer
        : layerMap.get(ent.layerId)) || page.layers[0];
    if (!layer || !layer.visible) continue;

    const rawColor =
      ent.color ||
      (ent.type === 'hatch' && wallLayer ? wallLayer.color : layer.color);
    const color = resolvePrintColor(rawColor, config.colorTheme);
    const lineType =
      ent.lineType ||
      (ent.type === 'hatch' && wallLayer ? wallLayer.lineType : layer.lineType);
    const rawWeight =
      ent.lineWeight ||
      (ent.type === 'hatch' && wallLayer
        ? wallLayer.lineWeight
        : layer.lineWeight) ||
      0.25;
    const strokeWidthPt = Math.max(0.55, rawWeight * 2.2);

    ops.push('q');
    ops.push('1 J 1 j'); // Round cap, round join
    ops.push(`${strokeWidthPt.toFixed(2)} w`);
    ops.push(getDashOp(lineType));
    ops.push(pdfRgbStroke(color));
    ops.push(pdfRgbFill(color));

    switch (ent.type) {
      case 'line': {
        const s1 = worldToPt(ent.p1.x, ent.p1.y);
        const s2 = worldToPt(ent.p2.x, ent.p2.y);
        ops.push(
          `${s1.x.toFixed(2)} ${toPdfY(s1.y).toFixed(2)} m ${s2.x.toFixed(2)} ${toPdfY(s2.y).toFixed(2)} l S`
        );
        break;
      }
      case 'rectangle':
      case 'polyline':
      case 'polygon': {
        const segs = getEntitySegments(ent);
        if (segs.length > 0) {
          const pathParts: string[] = [];
          for (const [p1, p2] of segs) {
            const s1 = worldToPt(p1.x, p1.y);
            const s2 = worldToPt(p2.x, p2.y);
            pathParts.push(
              `${s1.x.toFixed(2)} ${toPdfY(s1.y).toFixed(2)} m ${s2.x.toFixed(2)} ${toPdfY(s2.y).toFixed(2)} l`
            );
          }
          ops.push(pathParts.join(' ') + ' S');
        }
        break;
      }
      case 'circle': {
        const steps = 120;
        const pts: string[] = [];
        for (let i = 0; i <= steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const wx = ent.center.x + ent.radius * Math.cos(a);
          const wy = ent.center.y + ent.radius * Math.sin(a);
          const sp = worldToPt(wx, wy);
          pts.push(
            `${sp.x.toFixed(2)} ${toPdfY(sp.y).toFixed(2)} ${i === 0 ? 'm' : 'l'}`
          );
        }
        ops.push(pts.join(' ') + ' S');
        break;
      }
      case 'arc': {
        let sweep = ent.endAngle - ent.startAngle;
        while (sweep <= 0) sweep += Math.PI * 2;
        const steps = Math.max(32, Math.ceil((sweep / (Math.PI * 2)) * 120));
        const pts: string[] = [];
        for (let i = 0; i <= steps; i++) {
          const a = ent.startAngle + (sweep * i) / steps;
          const wx = ent.center.x + ent.radius * Math.cos(a);
          const wy = ent.center.y + ent.radius * Math.sin(a);
          const sp = worldToPt(wx, wy);
          pts.push(
            `${sp.x.toFixed(2)} ${toPdfY(sp.y).toFixed(2)} ${i === 0 ? 'm' : 'l'}`
          );
        }
        ops.push(pts.join(' ') + ' S');
        break;
      }
      case 'hatch': {
        ops.push('[] 0 d');
        ops.push(`${Math.max(0.4, strokeWidthPt * 0.72).toFixed(2)} w`);
        const hatchSegs = getHatchSegments(ent);
        if (hatchSegs.length > 0) {
          let batch: string[] = [];
          for (const [p1, p2] of hatchSegs) {
            const s1 = worldToPt(p1.x, p1.y);
            const s2 = worldToPt(p2.x, p2.y);
            batch.push(
              `${s1.x.toFixed(2)} ${toPdfY(s1.y).toFixed(2)} m ${s2.x.toFixed(2)} ${toPdfY(s2.y).toFixed(2)} l`
            );
            if (batch.length >= 150) {
              ops.push(batch.join(' ') + ' S');
              batch = [];
            }
          }
          if (batch.length > 0) {
            ops.push(batch.join(' ') + ' S');
          }
        }
        break;
      }
      case 'dimension': {
        ops.push('[] 0 d');
        const {
          dimP1,
          dimP2,
          mid,
          length,
          isDiameter,
          isRadius,
          center,
          leaderOutside,
          leaderElbow,
          leaderLanding,
        } = getDimensionLinePoints(ent);

        const sp1 = worldToPt(ent.p1.x, ent.p1.y);
        const sp2 = worldToPt(ent.p2.x, ent.p2.y);
        const sd1 = worldToPt(dimP1.x, dimP1.y);
        const sd2 = worldToPt(dimP2.x, dimP2.y);
        const smid = worldToPt(mid.x, mid.y);

        const ang = Math.atan2(sd2.y - sd1.y, sd2.x - sd1.x);
        const arrowLen = Math.min(6.5, Math.max(3.2, dist(sd1, sd2) * 0.14));
        const emitArrow = (tip: Point, dirAngle: number) => {
          const ax1 = tip.x - arrowLen * Math.cos(dirAngle - 0.35);
          const ay1 = tip.y - arrowLen * Math.sin(dirAngle - 0.35);
          const ax2 = tip.x - arrowLen * Math.cos(dirAngle + 0.35);
          const ay2 = tip.y - arrowLen * Math.sin(dirAngle + 0.35);
          ops.push(
            `${tip.x.toFixed(2)} ${toPdfY(tip.y).toFixed(2)} m ${ax1.toFixed(2)} ${toPdfY(ay1).toFixed(2)} l ${ax2.toFixed(2)} ${toPdfY(ay2).toFixed(2)} l h f`
          );
        };

        if (isRadius || isDiameter) {
          if (center) {
            const sc = worldToPt(center.x, center.y);
            const cSize = 3;
            ops.push('0.50 w');
            ops.push(
              `${(sc.x - cSize).toFixed(2)} ${toPdfY(sc.y).toFixed(2)} m ${(sc.x + cSize).toFixed(2)} ${toPdfY(sc.y).toFixed(2)} l ${sc.x.toFixed(2)} ${toPdfY(sc.y - cSize).toFixed(2)} m ${sc.x.toFixed(2)} ${toPdfY(sc.y + cSize).toFixed(2)} l S`
            );
          }
          ops.push('0.70 w');
          let lineCmd = `${sd1.x.toFixed(2)} ${toPdfY(sd1.y).toFixed(2)} m ${sd2.x.toFixed(2)} ${toPdfY(sd2.y).toFixed(2)} l`;
          if (leaderOutside && leaderElbow && leaderLanding) {
            const sElbow = worldToPt(leaderElbow.x, leaderElbow.y);
            const sLanding = worldToPt(leaderLanding.x, leaderLanding.y);
            lineCmd += ` ${sd2.x.toFixed(2)} ${toPdfY(sd2.y).toFixed(2)} m ${sElbow.x.toFixed(2)} ${toPdfY(sElbow.y).toFixed(2)} l ${sLanding.x.toFixed(2)} ${toPdfY(sLanding.y).toFixed(2)} l`;
          }
          ops.push(lineCmd + ' S');
          if (isDiameter) emitArrow(sd1, ang + Math.PI);
          emitArrow(sd2, ang);
        } else {
          ops.push('0.50 w');
          ops.push(
            `${sp1.x.toFixed(2)} ${toPdfY(sp1.y).toFixed(2)} m ${sd1.x.toFixed(2)} ${toPdfY(sd1.y).toFixed(2)} l ${sp2.x.toFixed(2)} ${toPdfY(sp2.y).toFixed(2)} m ${sd2.x.toFixed(2)} ${toPdfY(sd2.y).toFixed(2)} l S`
          );
          ops.push('0.70 w');
          ops.push(
            `${sd1.x.toFixed(2)} ${toPdfY(sd1.y).toFixed(2)} m ${sd2.x.toFixed(2)} ${toPdfY(sd2.y).toFixed(2)} l S`
          );
          emitArrow(sd1, ang + Math.PI);
          emitArrow(sd2, ang);
        }

        const baseFontSize = ent.fontSize || 11;
        const fontPt = Math.max(6.5, baseFontSize * 0.78);
        const tolFontPt = Math.max(5.0, fontPt * 0.72);
        const formatted = formatDimensionLabel(ent, length);

        const mainW = measureTextWidthPt(formatted.mainText, fontPt, 700);
        let symW = 0;
        let devW = 0;
        if (formatted.symmetricText) {
          symW = measureTextWidthPt(
            ` ${formatted.symmetricText}`,
            fontPt * 0.88,
            700
          );
        } else if (formatted.upperText && formatted.lowerText) {
          devW =
            Math.max(
              measureTextWidthPt(formatted.upperText, tolFontPt, 700),
              measureTextWidthPt(formatted.lowerText, tolFontPt, 700)
            ) + 3;
        }

        const totalW = mainW + symW + devW;
        const boxH =
          formatted.upperText && formatted.lowerText
            ? Math.max(fontPt + 4, tolFontPt * 2 + 3)
            : fontPt + 3;

        // Mask dimension line behind text
        ops.push(pdfRgbFill(bgColor));
        const maskX = smid.x - totalW / 2 - 2;
        const maskBottomPdfY = toPdfY(smid.y + boxH / 2);
        ops.push(
          `${maskX.toFixed(2)} ${maskBottomPdfY.toFixed(2)} ${(totalW + 4).toFixed(2)} ${boxH.toFixed(2)} re f`
        );

        const startX = smid.x - totalW / 2;
        ops.push(
          drawPdfText(
            formatted.mainText,
            startX,
            smid.y,
            heightPt,
            fontPt,
            color,
            0,
            true
          )
        );

        if (formatted.symmetricText) {
          ops.push(
            drawPdfText(
              ` ${formatted.symmetricText}`,
              startX + mainW,
              smid.y,
              heightPt,
              fontPt * 0.88,
              color,
              0,
              true
            )
          );
        } else if (formatted.upperText && formatted.lowerText) {
          ops.push(
            drawPdfText(
              formatted.upperText,
              startX + mainW + 2,
              smid.y - tolFontPt * 0.52,
              heightPt,
              tolFontPt,
              color,
              0,
              true
            )
          );
          ops.push(
            drawPdfText(
              formatted.lowerText,
              startX + mainW + 2,
              smid.y + tolFontPt * 0.52,
              heightPt,
              tolFontPt,
              color,
              0,
              true
            )
          );
        }
        break;
      }
      case 'text': {
        const sp = worldToPt(ent.position.x, ent.position.y);
        const fontPt = Math.max(6.5, ent.fontSize * zoomPt);
        ops.push(
          drawPdfText(
            ent.content,
            sp.x,
            sp.y,
            heightPt,
            fontPt,
            color,
            ent.rotation || 0,
            true
          )
        );
        break;
      }
    }

    ops.push('Q');
  }

  ops.push('Q'); // End viewport clip

  // 4. Outer Engineering Border & Title Block (Pure Vector Lines + Crisp Vector Text)
  ops.push('q');
  ops.push('1.20 w');
  ops.push('[] 0 d');
  ops.push(pdfRgbStroke(borderColor));
  ops.push(
    `${outerMarginPt.toFixed(2)} ${outerMarginPt.toFixed(2)} ${(widthPt - outerMarginPt * 2).toFixed(2)} ${(heightPt - outerMarginPt * 2).toFixed(2)} re S`
  );

  if (config.includeTitleBlock) {
    const tbTop = viewTopPt + viewHeightPt;
    const tbTopPdfY = toPdfY(tbTop);
    ops.push(
      `${outerMarginPt.toFixed(2)} ${tbTopPdfY.toFixed(2)} m ${(widthPt - outerMarginPt).toFixed(2)} ${tbTopPdfY.toFixed(2)} l S`
    );

    const col1Width = viewWidthPt * 0.44;
    const col2Width = viewWidthPt * 0.34;
    const x1 = outerMarginPt + col1Width;
    const x2 = x1 + col2Width;

    ops.push('0.75 w');
    ops.push(pdfRgbStroke(subBorderColor));
    const botPdfY = toPdfY(heightPt - outerMarginPt);
    ops.push(
      `${x1.toFixed(2)} ${tbTopPdfY.toFixed(2)} m ${x1.toFixed(2)} ${botPdfY.toFixed(2)} l ${x2.toFixed(2)} ${tbTopPdfY.toFixed(2)} m ${x2.toFixed(2)} ${botPdfY.toFixed(2)} l S`
    );

    const padX = 10;
    const row1Y = tbTop + titleBlockHeightPt * 0.36;
    const row2Y = tbTop + titleBlockHeightPt * 0.73;

    ops.push(
      drawPdfText(
        `VektorCAD 工程圖面 — ${page.title}`,
        outerMarginPt + padX,
        row1Y,
        heightPt,
        10.5,
        primaryTextColor,
        0,
        true
      )
    );

    const scopeDesc = page.windowBounds
      ? `窗選區域匯出: (${worldMinX.toFixed(1)}, ${worldMinY.toFixed(1)}) ~ (${worldMaxX.toFixed(1)}, ${worldMaxY.toFixed(1)}) mm`
      : page.subtitle ||
        `分頁全圖匯出 · 圖元數: ${leafEntities.length} · 範圍: ${worldSpanX.toFixed(1)} × ${worldSpanY.toFixed(1)} mm`;
    ops.push(
      drawPdfText(
        scopeDesc,
        outerMarginPt + padX,
        row2Y,
        heightPt,
        7.8,
        secondaryTextColor,
        0,
        false
      )
    );

    ops.push(
      drawPdfText(
        `圖紙規格: ${paperLabel}`,
        x1 + padX,
        row1Y,
        heightPt,
        8.5,
        primaryTextColor,
        0,
        true
      )
    );
    ops.push(
      drawPdfText(
        `單位: mm (公制) · 視角範圍: ${worldSpanX.toFixed(1)}×${worldSpanY.toFixed(1)} mm`,
        x1 + padX,
        row2Y,
        heightPt,
        7.5,
        secondaryTextColor,
        0,
        false
      )
    );

    const nowStr = new Date().toISOString().slice(0, 10);
    ops.push(
      drawPdfText(
        `頁次: ${pageIndex + 1} / ${totalPages}`,
        x2 + padX,
        row1Y,
        heightPt,
        8.8,
        primaryTextColor,
        0,
        true
      )
    );
    ops.push(
      drawPdfText(
        `匯出日期: ${nowStr}`,
        x2 + padX,
        row2Y,
        heightPt,
        7.5,
        secondaryTextColor,
        0,
        false
      )
    );
  }

  ops.push('Q');

  return {
    contentStream: ops.join('\n') + '\n',
    widthPt,
    heightPt,
  };
}

/**
 * Encode an ASCII/Latin1 string into a Uint8Array.
 */
function asciiToBytes(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/**
 * Build a multi-page 100% Vector PDF 1.4 binary Blob from one or more PdfPageInput definitions.
 * Uses native PDF vector paths for all geometry and native Type1 / high-DPI vector outlines for text,
 * completely eliminating JPEG compression blur on lines and text.
 */
export function generateCadPdfBlob(
  pages: PdfPageInput[],
  config: PdfExportConfig
): Blob {
  const validPages =
    pages.length > 0
      ? pages
      : [{ title: '畫布分頁 1', entities: [], layers: [] }];

  const vectorPages = validPages.map((p, idx) =>
    buildVectorPdfPageStream(p, config, idx, validPages.length)
  );

  const chunks: Uint8Array[] = [];
  let currentOffset = 0;
  const pushBytes = (arr: Uint8Array) => {
    chunks.push(arr);
    currentOffset += arr.length;
  };
  const pushAscii = (str: string) => {
    pushBytes(asciiToBytes(str));
  };

  // PDF 1.4 Header
  pushAscii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  // Objects:
  // 1: Catalog
  // 2: Pages Root
  // 3: Font /F1 (Helvetica-Bold, WinAnsiEncoding)
  // 4: Font /F2 (Helvetica, WinAnsiEncoding)
  // For each page i:
  //   5 + i*2: Page Object
  //   6 + i*2: Content Stream Object
  const totalObjects = 4 + vectorPages.length * 2;
  const offsets: number[] = new Array(totalObjects + 1).fill(0);

  // Object 1: Catalog
  offsets[1] = currentOffset;
  pushAscii('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Object 2: Pages Root
  const kidsRefs = vectorPages.map((_, idx) => `${5 + idx * 2} 0 R`).join(' ');
  offsets[2] = currentOffset;
  pushAscii(
    `2 0 obj\n<< /Type /Pages /Kids [ ${kidsRefs} ] /Count ${vectorPages.length} >>\nendobj\n`
  );

  // Object 3: Font /F1 (Helvetica-Bold)
  offsets[3] = currentOffset;
  pushAscii(
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n'
  );

  // Object 4: Font /F2 (Helvetica)
  offsets[4] = currentOffset;
  pushAscii(
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n'
  );

  // Page Objects (2 per page: Page + Vector Content Stream)
  vectorPages.forEach((vp, idx) => {
    const pageObjId = 5 + idx * 2;
    const contentObjId = 6 + idx * 2;

    const wPt = vp.widthPt.toFixed(2);
    const hPt = vp.heightPt.toFixed(2);

    offsets[pageObjId] = currentOffset;
    pushAscii(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}] /Resources << /ProcSet [/PDF /Text] /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj\n`
    );

    const streamBytes = asciiToBytes(vp.contentStream);
    offsets[contentObjId] = currentOffset;
    pushAscii(
      `${contentObjId} 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n`
    );
    pushBytes(streamBytes);
    pushAscii('endstream\nendobj\n');
  });

  // Cross-reference table (xref)
  const xrefOffset = currentOffset;
  pushAscii(`xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`);
  for (let objId = 1; objId <= totalObjects; objId++) {
    const offStr = String(offsets[objId]).padStart(10, '0');
    pushAscii(`${offStr} 00000 n \n`);
  }

  // Trailer
  pushAscii(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  const finalPdf = new Uint8Array(currentOffset);
  let pos = 0;
  for (const chunk of chunks) {
    finalPdf.set(chunk, pos);
    pos += chunk.length;
  }

  return new Blob([finalPdf], { type: 'application/pdf' });
}
