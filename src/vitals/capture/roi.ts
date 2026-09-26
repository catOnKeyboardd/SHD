import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { Rgb, RoiName } from '../types';

/** Face-mesh landmark rings outlining skin regions with strong pulsatile signal. */
const ROI_POLYGONS: Record<RoiName, number[]> = {
  forehead: [103, 67, 109, 10, 338, 297, 332, 333, 299, 337, 151, 108, 69, 104],
  leftCheek: [117, 118, 101, 36, 205, 187, 123],
  rightCheek: [346, 347, 330, 266, 425, 411, 352],
};

interface RoiSample {
  rgb: Rgb;
  /** Share of polygon pixels that passed the skin-colour test. */
  skinRatio: number;
  luminance: number;
}

type Point = [number, number];

function toPixels(lm: NormalizedLandmark[], idx: number[], w: number, h: number): Point[] {
  return idx.map((i) => [lm[i].x * w, lm[i].y * h]);
}

function insidePolygon(x: number, y: number, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Classic YCrCb skin gate; rejects hair, eyebrows, mask fabric and specular highlights. */
function isSkin(r: number, g: number, b: number): boolean {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cr = 128 + 0.5 * r - 0.4187 * g - 0.0813 * b;
  const cb = 128 - 0.1687 * r - 0.3313 * g + 0.5 * b;
  return y > 35 && y < 245 && cr >= 133 && cr <= 180 && cb >= 75 && cb <= 130;
}

/**
 * Mean skin colour inside each ROI. Reads only the bounding box of the face
 * regions from the canvas to keep per-frame cost low on phones.
 */
export function sampleRois(
  ctx: CanvasRenderingContext2D,
  lm: NormalizedLandmark[],
  w: number,
  h: number,
): Partial<Record<RoiName, RoiSample>> {
  const polys = Object.fromEntries(
    (Object.keys(ROI_POLYGONS) as RoiName[]).map((n) => [n, toPixels(lm, ROI_POLYGONS[n], w, h)]),
  ) as Record<RoiName, Point[]>;

  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  for (const poly of Object.values(polys)) {
    for (const [x, y] of poly) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(w, Math.ceil(x1));
  y1 = Math.min(h, Math.ceil(y1));
  const bw = x1 - x0;
  const bh = y1 - y0;
  if (bw < 4 || bh < 4) return {};
  const data = ctx.getImageData(x0, y0, bw, bh).data;

  const out: Partial<Record<RoiName, RoiSample>> = {};
  for (const name of Object.keys(polys) as RoiName[]) {
    const poly = polys[name];
    let px0 = w;
    let py0 = h;
    let px1 = 0;
    let py1 = 0;
    for (const [x, y] of poly) {
      px0 = Math.min(px0, x);
      py0 = Math.min(py0, y);
      px1 = Math.max(px1, x);
      py1 = Math.max(py1, y);
    }
    let total = 0;
    let skin = 0;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    for (let y = Math.max(y0, Math.floor(py0)); y < Math.min(y1, Math.ceil(py1)); y++) {
      for (let x = Math.max(x0, Math.floor(px0)); x < Math.min(x1, Math.ceil(px1)); x++) {
        if (!insidePolygon(x + 0.5, y + 0.5, poly)) continue;
        total++;
        const k = ((y - y0) * bw + (x - x0)) * 4;
        const r = data[k];
        const g = data[k + 1];
        const b = data[k + 2];
        if (!isSkin(r, g, b)) continue;
        skin++;
        sr += r;
        sg += g;
        sb += b;
      }
    }
    if (total < 20 || skin < 10) continue;
    const rgb: Rgb = [sr / skin, sg / skin, sb / skin];
    out[name] = {
      rgb,
      skinRatio: skin / total,
      luminance: 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2],
    };
  }
  return out;
}

export function roiPixelPolygons(lm: NormalizedLandmark[], w: number, h: number): Point[][] {
  return (Object.keys(ROI_POLYGONS) as RoiName[]).map((n) => toPixels(lm, ROI_POLYGONS[n], w, h));
}
