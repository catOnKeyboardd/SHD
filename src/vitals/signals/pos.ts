import { mean, std } from './dsp';

/**
 * Plane-Orthogonal-to-Skin rPPG (Wang et al., IEEE TBME 2017).
 * Inputs are uniformly sampled mean R/G/B traces of a skin region.
 */
export function posBvp(
  r: ArrayLike<number>,
  g: ArrayLike<number>,
  b: ArrayLike<number>,
  fs: number,
  windowSec = 1.6,
): Float64Array {
  const n = r.length;
  const l = Math.max(2, Math.round(windowSec * fs));
  const h = new Float64Array(n);
  if (n < l) return h;
  const s1 = new Float64Array(l);
  const s2 = new Float64Array(l);
  for (let start = 0; start + l <= n; start++) {
    let mr = 0;
    let mg = 0;
    let mb = 0;
    for (let i = 0; i < l; i++) {
      mr += r[start + i];
      mg += g[start + i];
      mb += b[start + i];
    }
    mr /= l;
    mg /= l;
    mb /= l;
    if (mr <= 0 || mg <= 0 || mb <= 0) continue;
    for (let i = 0; i < l; i++) {
      const rn = r[start + i] / mr;
      const gn = g[start + i] / mg;
      const bn = b[start + i] / mb;
      s1[i] = gn - bn;
      s2[i] = gn + bn - 2 * rn;
    }
    const sd2 = std(s2);
    const alpha = sd2 > 0 ? std(s1) / sd2 : 0;
    const seg = new Float64Array(l);
    for (let i = 0; i < l; i++) seg[i] = s1[i] + alpha * s2[i];
    const m = mean(seg);
    for (let i = 0; i < l; i++) h[start + i] += seg[i] - m;
  }
  return h;
}
