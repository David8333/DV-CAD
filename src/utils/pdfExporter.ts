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
  widthPx: number;
  heightPx: number;
  label: string;
} {
  switch (format) {
    case 'a4-portrait':
      return {
        widthPt: 595.28,
        heightPt: 841.89,
        widthPx: 1654,
        heightPx: 2339,
        label: 'A4 直向 (210×297 mm)',
      };
    case 'a3-landscape':
      return {
        widthPt: 1190.55,
        heightPt: 841.89,
        widthPx: 2480,
        heightPx: 1754,
        label: 'A3 橫向 (420×297 mm)',
      };
    case 'a4-landscape':
    default:
      return {
        widthPt: 841.89,
        heightPt: 595.28,
        widthPx: 2339,
        heightPx: 1654,
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

/**
 * Render a single CAD page (either full tab extents or a window-selected region) onto an HTMLCanvasElement.
 */
export function renderCadPageToCanvas(
  page: PdfPageInput,
  config: PdfExportConfig,
  pageIndex = 0,
  totalPages = 1,
  scaleDownForPreview = false
): HTMLCanvasElement {
  const paper = getPaperDimensions(config.paperFormat);
  const scaleFactor = scaleDownForPreview ? 0.45 : 1;
  const widthPx = Math.round(paper.widthPx * scaleFactor);
  const heightPx = Math.round(paper.heightPx * scaleFactor);

  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const isDark = config.colorTheme === 'dark-blueprint';
  const bgColor = isDark ? '#090D14' : '#FFFFFF';
  const borderColor = isDark ? '#334155' : '#1E293B';
  const subBorderColor = isDark ? '#1E293B' : '#CBD5E1';
  const primaryTextColor = isDark ? '#F8FAFC' : '#0F172A';
  const secondaryTextColor = isDark ? '#94A3B8' : '#475569';

  // 1. Fill page background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, widthPx, heightPx);

  // 2. Compute printable viewport margins
  const outerMargin = Math.round(36 * scaleFactor);
  const titleBlockHeight = config.includeTitleBlock
    ? Math.round(88 * scaleFactor)
    : 0;

  const viewLeft = outerMargin;
  const viewTop = outerMargin;
  const viewWidth = Math.max(100, widthPx - outerMargin * 2);
  const viewHeight = Math.max(
    100,
    heightPx - outerMargin * 2 - titleBlockHeight
  );

  // 3. Determine visible entities and world bounding box
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

  const paddingPx = page.windowBounds
    ? Math.round(16 * scaleFactor)
    : Math.round(28 * scaleFactor);
  const usableW = Math.max(50, viewWidth - paddingPx * 2);
  const usableH = Math.max(50, viewHeight - paddingPx * 2);
  const zoom = Math.min(usableW / worldSpanX, usableH / worldSpanY);

  const viewCenterX = viewLeft + viewWidth / 2;
  const viewCenterY = viewTop + viewHeight / 2;

  const worldToScreen = (wx: number, wy: number): Point => ({
    x: viewCenterX + (wx - worldCenterX) * zoom,
    y: viewCenterY - (wy - worldCenterY) * zoom,
  });

  // 4. Clip to drawing viewport rectangle
  ctx.save();
  ctx.beginPath();
  ctx.rect(viewLeft, viewTop, viewWidth, viewHeight);
  ctx.clip();

  // Optional subtle coordinate grid inside viewport
  if (config.includeGrid) {
    let gridStep = 10;
    const rawSpan = Math.max(worldSpanX, worldSpanY);
    if (rawSpan > 2000) gridStep = 200;
    else if (rawSpan > 800) gridStep = 100;
    else if (rawSpan > 300) gridStep = 50;
    else if (rawSpan > 100) gridStep = 20;
    else if (rawSpan < 30) gridStep = 2;

    ctx.save();
    ctx.lineWidth = Math.max(0.6, 0.8 * scaleFactor);
    ctx.strokeStyle = isDark
      ? 'rgba(148, 163, 184, 0.12)'
      : 'rgba(148, 163, 184, 0.24)';
    ctx.beginPath();

    const gxStart = Math.floor(worldMinX / gridStep) * gridStep;
    const gxEnd = Math.ceil(worldMaxX / gridStep) * gridStep;
    for (let gx = gxStart; gx <= gxEnd; gx += gridStep) {
      const sx = worldToScreen(gx, 0).x;
      if (sx >= viewLeft && sx <= viewLeft + viewWidth) {
        ctx.moveTo(sx, viewTop);
        ctx.lineTo(sx, viewTop + viewHeight);
      }
    }

    const gyStart = Math.floor(worldMinY / gridStep) * gridStep;
    const gyEnd = Math.ceil(worldMaxY / gridStep) * gridStep;
    for (let gy = gyStart; gy <= gyEnd; gy += gridStep) {
      const sy = worldToScreen(0, gy).y;
      if (sy >= viewTop && sy <= viewTop + viewHeight) {
        ctx.moveTo(viewLeft, sy);
        ctx.lineTo(viewLeft + viewWidth, sy);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  // If window-selected bounds are active, clip strictly to that exact world rectangle too
  if (page.windowBounds) {
    const pTopLeft = worldToScreen(worldMinX, worldMaxY);
    const pBottomRight = worldToScreen(worldMaxX, worldMinY);
    const clipX = Math.min(pTopLeft.x, pBottomRight.x);
    const clipY = Math.min(pTopLeft.y, pBottomRight.y);
    const clipW = Math.abs(pBottomRight.x - pTopLeft.x);
    const clipH = Math.abs(pBottomRight.y - pTopLeft.y);
    ctx.beginPath();
    ctx.rect(clipX, clipY, clipW, clipH);
    ctx.clip();
  }

  const applyDash = (lt: LineType) => {
    const u = Math.max(0.75, scaleFactor * 1.25);
    switch (lt) {
      case 'dashed':
        ctx.setLineDash([8 * u, 5 * u]);
        break;
      case 'center':
        ctx.setLineDash([16 * u, 4 * u, 3 * u, 4 * u]);
        break;
      case 'dotted':
        ctx.setLineDash([2 * u, 4 * u]);
        break;
      default:
        ctx.setLineDash([]);
    }
  };

  // 5. Render each visible CAD entity
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
    const strokeWidth = Math.max(1.2, rawWeight * 5.2) * scaleFactor;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    applyDash(lineType);

    switch (ent.type) {
      case 'line': {
        const s1 = worldToScreen(ent.p1.x, ent.p1.y);
        const s2 = worldToScreen(ent.p2.x, ent.p2.y);
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
            const s1 = worldToScreen(p1.x, p1.y);
            const s2 = worldToScreen(p2.x, p2.y);
            ctx.moveTo(s1.x, s1.y);
            ctx.lineTo(s2.x, s2.y);
          }
          ctx.stroke();
        }
        break;
      }
      case 'circle': {
        const sc = worldToScreen(ent.center.x, ent.center.y);
        ctx.beginPath();
        ctx.arc(sc.x, sc.y, Math.max(1, ent.radius * zoom), 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'arc': {
        const sc = worldToScreen(ent.center.x, ent.center.y);
        ctx.beginPath();
        ctx.arc(
          sc.x,
          sc.y,
          Math.max(1, ent.radius * zoom),
          -ent.endAngle,
          -ent.startAngle
        );
        ctx.stroke();
        break;
      }
      case 'hatch': {
        ctx.setLineDash([]);
        ctx.lineWidth = Math.max(0.9, strokeWidth * 0.78);
        const hatchSegs = getHatchSegments(ent);
        if (hatchSegs.length > 0) {
          ctx.beginPath();
          for (const [p1, p2] of hatchSegs) {
            const s1 = worldToScreen(p1.x, p1.y);
            const s2 = worldToScreen(p2.x, p2.y);
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

        const sp1 = worldToScreen(ent.p1.x, ent.p1.y);
        const sp2 = worldToScreen(ent.p2.x, ent.p2.y);
        const sd1 = worldToScreen(dimP1.x, dimP1.y);
        const sd2 = worldToScreen(dimP2.x, dimP2.y);
        const smid = worldToScreen(mid.x, mid.y);

        const ang = Math.atan2(sd2.y - sd1.y, sd2.x - sd1.x);
        const arrowLen =
          Math.min(12, Math.max(6, dist(sd1, sd2) * 0.14)) * scaleFactor;
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

        if (isRadius) {
          if (center) {
            const sc = worldToScreen(center.x, center.y);
            ctx.save();
            ctx.lineWidth = Math.max(1, 1.2 * scaleFactor);
            ctx.globalAlpha = 0.65;
            const cSize = 5 * scaleFactor;
            ctx.beginPath();
            ctx.moveTo(sc.x - cSize, sc.y);
            ctx.lineTo(sc.x + cSize, sc.y);
            ctx.moveTo(sc.x, sc.y - cSize);
            ctx.lineTo(sc.x, sc.y + cSize);
            ctx.stroke();
            ctx.restore();
          }
          ctx.lineWidth = Math.max(1.1, 1.5 * scaleFactor);
          ctx.beginPath();
          ctx.moveTo(sd1.x, sd1.y);
          ctx.lineTo(sd2.x, sd2.y);
          if (leaderOutside && leaderElbow && leaderLanding) {
            const sElbow = worldToScreen(leaderElbow.x, leaderElbow.y);
            const sLanding = worldToScreen(leaderLanding.x, leaderLanding.y);
            ctx.moveTo(sd2.x, sd2.y);
            ctx.lineTo(sElbow.x, sElbow.y);
            ctx.lineTo(sLanding.x, sLanding.y);
          }
          ctx.stroke();
          drawArrow(sd2, ang);
        } else if (isDiameter) {
          if (center) {
            const sc = worldToScreen(center.x, center.y);
            ctx.save();
            ctx.lineWidth = Math.max(1, 1.2 * scaleFactor);
            ctx.globalAlpha = 0.65;
            const cSize = 5 * scaleFactor;
            ctx.beginPath();
            ctx.moveTo(sc.x - cSize, sc.y);
            ctx.lineTo(sc.x + cSize, sc.y);
            ctx.moveTo(sc.x, sc.y - cSize);
            ctx.lineTo(sc.x, sc.y + cSize);
            ctx.stroke();
            ctx.restore();
          }
          ctx.lineWidth = Math.max(1.1, 1.5 * scaleFactor);
          ctx.beginPath();
          ctx.moveTo(sd1.x, sd1.y);
          ctx.lineTo(sd2.x, sd2.y);
          if (leaderOutside && leaderElbow && leaderLanding) {
            const sElbow = worldToScreen(leaderElbow.x, leaderElbow.y);
            const sLanding = worldToScreen(leaderLanding.x, leaderLanding.y);
            ctx.moveTo(sd2.x, sd2.y);
            ctx.lineTo(sElbow.x, sElbow.y);
            ctx.lineTo(sLanding.x, sLanding.y);
          }
          ctx.stroke();
          drawArrow(sd1, ang + Math.PI);
          drawArrow(sd2, ang);
        } else {
          ctx.lineWidth = Math.max(0.9, 1.2 * scaleFactor);
          ctx.globalAlpha = 0.75;
          ctx.beginPath();
          ctx.moveTo(sp1.x, sp1.y);
          ctx.lineTo(sd1.x, sd1.y);
          ctx.moveTo(sp2.x, sp2.y);
          ctx.lineTo(sd2.x, sd2.y);
          ctx.stroke();

          ctx.globalAlpha = 1;
          ctx.lineWidth = Math.max(1.1, 1.5 * scaleFactor);
          ctx.beginPath();
          ctx.moveTo(sd1.x, sd1.y);
          ctx.lineTo(sd2.x, sd2.y);
          ctx.stroke();

          drawArrow(sd1, ang + Math.PI);
          drawArrow(sd2, ang);
        }

        const baseFontSize = ent.fontSize || 11;
        const fontPx = Math.max(
          9,
          Math.round(baseFontSize * 1.45 * scaleFactor)
        );
        const tolFontPx = Math.max(7, Math.round(fontPx * 0.72));
        const formatted = formatDimensionLabel(ent, length);

        ctx.font = `600 ${fontPx}px "JetBrains Mono", "Noto Sans TC", monospace`;
        const mainW = ctx.measureText(formatted.mainText).width;

        let symW = 0;
        let devW = 0;
        if (formatted.symmetricText) {
          ctx.font = `600 ${Math.max(8, Math.round(fontPx * 0.88))}px "JetBrains Mono", monospace`;
          symW = ctx.measureText(` ${formatted.symmetricText}`).width;
        } else if (formatted.upperText && formatted.lowerText) {
          ctx.font = `600 ${tolFontPx}px "JetBrains Mono", monospace`;
          devW =
            Math.max(
              ctx.measureText(formatted.upperText).width,
              ctx.measureText(formatted.lowerText).width
            ) +
            6 * scaleFactor;
        }

        const totalW = mainW + symW + devW;
        const boxH =
          formatted.upperText && formatted.lowerText
            ? Math.max(fontPx + 8 * scaleFactor, tolFontPx * 2 + 6 * scaleFactor)
            : fontPx + 6 * scaleFactor;

        ctx.fillStyle = bgColor;
        ctx.fillRect(
          smid.x - totalW / 2 - 4 * scaleFactor,
          smid.y - boxH / 2,
          totalW + 8 * scaleFactor,
          boxH
        );

        ctx.fillStyle = color;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';

        const startX = smid.x - totalW / 2;
        ctx.font = `600 ${fontPx}px "JetBrains Mono", "Noto Sans TC", monospace`;
        ctx.fillText(formatted.mainText, startX, smid.y);

        if (formatted.symmetricText) {
          ctx.font = `600 ${Math.max(8, Math.round(fontPx * 0.88))}px "JetBrains Mono", monospace`;
          ctx.fillText(` ${formatted.symmetricText}`, startX + mainW, smid.y);
        } else if (formatted.upperText && formatted.lowerText) {
          ctx.font = `600 ${tolFontPx}px "JetBrains Mono", monospace`;
          ctx.fillText(
            formatted.upperText,
            startX + mainW + 4 * scaleFactor,
            smid.y - tolFontPx * 0.52
          );
          ctx.fillText(
            formatted.lowerText,
            startX + mainW + 4 * scaleFactor,
            smid.y + tolFontPx * 0.52
          );
        }
        break;
      }
      case 'text': {
        const sp = worldToScreen(ent.position.x, ent.position.y);
        const fontPx = Math.max(10, ent.fontSize * zoom);
        ctx.font = `600 ${fontPx}px "JetBrains Mono", "Plus Jakarta Sans", "Noto Sans TC", sans-serif`;
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

  ctx.restore(); // End viewport clip

  // 6. Draw Engineering Viewport Border & Optional Title Block
  ctx.save();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = Math.max(1.5, 2.2 * scaleFactor);
  ctx.strokeRect(
    outerMargin,
    outerMargin,
    widthPx - outerMargin * 2,
    heightPx - outerMargin * 2
  );

  if (config.includeTitleBlock) {
    const tbTop = viewTop + viewHeight;
    ctx.beginPath();
    ctx.moveTo(outerMargin, tbTop);
    ctx.lineTo(widthPx - outerMargin, tbTop);
    ctx.stroke();

    // Sub-dividers in title block
    const col1Width = Math.round(viewWidth * 0.42);
    const col2Width = Math.round(viewWidth * 0.33);
    const x1 = outerMargin + col1Width;
    const x2 = x1 + col2Width;

    ctx.strokeStyle = subBorderColor;
    ctx.lineWidth = Math.max(1, 1.4 * scaleFactor);
    ctx.beginPath();
    ctx.moveTo(x1, tbTop);
    ctx.lineTo(x1, heightPx - outerMargin);
    ctx.moveTo(x2, tbTop);
    ctx.lineTo(x2, heightPx - outerMargin);
    ctx.stroke();

    const padX = Math.round(18 * scaleFactor);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    // Column 1: System Name + Tab/Page Title
    ctx.fillStyle = primaryTextColor;
    ctx.font = `700 ${Math.round(22 * scaleFactor)}px "Plus Jakarta Sans", "Noto Sans TC", sans-serif`;
    ctx.fillText(
      `VektorCAD 工程圖面 — ${page.title}`,
      outerMargin + padX,
      tbTop + titleBlockHeight * 0.36
    );

    ctx.fillStyle = secondaryTextColor;
    ctx.font = `500 ${Math.round(15 * scaleFactor)}px "JetBrains Mono", "Noto Sans TC", monospace`;
    const scopeDesc = page.windowBounds
      ? `窗選區域匯出: (${worldMinX.toFixed(1)}, ${worldMinY.toFixed(1)}) ~ (${worldMaxX.toFixed(1)}, ${worldMaxY.toFixed(1)}) mm`
      : page.subtitle ||
        `分頁全圖匯出 · 圖元數: ${leafEntities.length} · 範圍: ${worldSpanX.toFixed(1)} × ${worldSpanY.toFixed(1)} mm`;
    ctx.fillText(
      scopeDesc,
      outerMargin + padX,
      tbTop + titleBlockHeight * 0.72
    );

    // Column 2: Paper & Units Info
    ctx.fillStyle = primaryTextColor;
    ctx.font = `600 ${Math.round(16 * scaleFactor)}px "JetBrains Mono", "Noto Sans TC", monospace`;
    ctx.fillText(
      `圖紙規格: ${paper.label}`,
      x1 + padX,
      tbTop + titleBlockHeight * 0.36
    );
    ctx.fillStyle = secondaryTextColor;
    ctx.font = `500 ${Math.round(14 * scaleFactor)}px "JetBrains Mono", "Noto Sans TC", monospace`;
    ctx.fillText(
      `單位: mm (公制) · 視角範圍: ${worldSpanX.toFixed(1)}×${worldSpanY.toFixed(1)} mm`,
      x1 + padX,
      tbTop + titleBlockHeight * 0.72
    );

    // Column 3: Date & Page Number
    const nowStr = new Date().toISOString().slice(0, 10);
    ctx.fillStyle = primaryTextColor;
    ctx.font = `700 ${Math.round(17 * scaleFactor)}px "JetBrains Mono", "Noto Sans TC", monospace`;
    ctx.fillText(
      `頁次: ${pageIndex + 1} / ${totalPages}`,
      x2 + padX,
      tbTop + titleBlockHeight * 0.36
    );
    ctx.fillStyle = secondaryTextColor;
    ctx.font = `500 ${Math.round(14 * scaleFactor)}px "JetBrains Mono", monospace`;
    ctx.fillText(
      `匯出日期: ${nowStr}`,
      x2 + padX,
      tbTop + titleBlockHeight * 0.72
    );
  }
  ctx.restore();

  return canvas;
}

/**
 * Convert a base64 JPEG data URL into a raw Uint8Array of bytes.
 */
function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const binStr = atob(base64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encode an ASCII string into a Uint8Array.
 */
function asciiToBytes(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/**
 * Build a multi-page PDF 1.4 binary Blob from one or more PdfPageInput definitions.
 */
export function generateCadPdfBlob(
  pages: PdfPageInput[],
  config: PdfExportConfig
): Blob {
  const paper = getPaperDimensions(config.paperFormat);
  const validPages =
    pages.length > 0
      ? pages
      : [{ title: '畫布分頁 1', entities: [], layers: [] }];

  const renderedPages = validPages.map((p, idx) => {
    const canvas = renderCadPageToCanvas(
      p,
      config,
      idx,
      validPages.length,
      false
    );
    const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95);
    return {
      jpegBytes: dataUrlToUint8Array(jpegDataUrl),
      widthPx: canvas.width,
      heightPx: canvas.height,
      widthPt: paper.widthPt,
      heightPt: paper.heightPt,
    };
  });

  const chunks: Uint8Array[] = [];
  let currentOffset = 0;
  const pushBytes = (arr: Uint8Array) => {
    chunks.push(arr);
    currentOffset += arr.length;
  };
  const pushAscii = (str: string) => {
    pushBytes(asciiToBytes(str));
  };

  // PDF 1.4 Header with binary marker comment
  pushAscii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  const totalObjects = 2 + renderedPages.length * 3;
  const offsets: number[] = new Array(totalObjects + 1).fill(0);

  // Object 1: Catalog
  offsets[1] = currentOffset;
  pushAscii('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Object 2: Pages Root
  const kidsRefs = renderedPages
    .map((_, idx) => `${3 + idx * 3} 0 R`)
    .join(' ');
  offsets[2] = currentOffset;
  pushAscii(
    `2 0 obj\n<< /Type /Pages /Kids [ ${kidsRefs} ] /Count ${renderedPages.length} >>\nendobj\n`
  );

  // Page Objects (3 per page: Page, Content Stream, Image XObject)
  renderedPages.forEach((rp, idx) => {
    const pageObjId = 3 + idx * 3;
    const contentObjId = 4 + idx * 3;
    const imageObjId = 5 + idx * 3;

    const wPt = rp.widthPt.toFixed(2);
    const hPt = rp.heightPt.toFixed(2);

    // Page object
    offsets[pageObjId] = currentOffset;
    pushAscii(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}] /Resources << /ProcSet [/PDF /ImageC] /XObject << /Im0 ${imageObjId} 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj\n`
    );

    // Content stream object
    const contentStream = `q\n${wPt} 0 0 ${hPt} 0 0 cm\n/Im0 Do\nQ\n`;
    offsets[contentObjId] = currentOffset;
    pushAscii(
      `${contentObjId} 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`
    );

    // JPEG Image XObject
    offsets[imageObjId] = currentOffset;
    pushAscii(
      `${imageObjId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${rp.widthPx} /Height ${rp.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${rp.jpegBytes.length} >>\nstream\n`
    );
    pushBytes(rp.jpegBytes);
    pushAscii('\nendstream\nendobj\n');
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

  // Merge all chunks into a single Uint8Array
  const finalPdf = new Uint8Array(currentOffset);
  let pos = 0;
  for (const chunk of chunks) {
    finalPdf.set(chunk, pos);
    pos += chunk.length;
  }

  return new Blob([finalPdf], { type: 'application/pdf' });
}
