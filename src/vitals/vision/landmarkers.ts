import { FaceLandmarker, FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

export interface Landmarkers {
  face: FaceLandmarker;
  pose: PoseLandmarker;
}

/** Loading progress: `download` is 0..1 over all files; `init` once everything is downloaded. */
export type LoadProgress = { stage: 'download'; fraction: number } | { stage: 'init' };

const FILES = {
  face: 'models/face_landmarker.task',
  pose: 'models/pose_landmarker_lite.task',
};
/** A GPU delegate that neither resolves nor rejects in this time is treated as broken. */
const GPU_TIMEOUT_MS = 15_000;
const CPU_TIMEOUT_MS = 60_000;
/** Give up when no bytes arrive for this long. */
const STALL_TIMEOUT_MS = 30_000;

function assetUrl(path: string): string {
  return new URL(path, document.baseURI).href;
}

async function download(path: string, onBytes: (loaded: number, total: number) => void): Promise<Uint8Array<ArrayBuffer>> {
  const ctrl = new AbortController();
  let stall = setTimeout(() => ctrl.abort(), STALL_TIMEOUT_MS);
  try {
    const res = await fetch(assetUrl(path), { signal: ctrl.signal });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${path}`);
    const total = Number(res.headers.get('content-length')) || 0;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      clearTimeout(stall);
      stall = setTimeout(() => ctrl.abort(), STALL_TIMEOUT_MS);
      chunks.push(value);
      loaded += value.length;
      onBytes(loaded, total);
    }
    const out = new Uint8Array(loaded);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  } catch (err) {
    if (ctrl.signal.aborted) throw new Error('The network is too slow to download the AI models. Check the connection and reload.');
    throw err;
  } finally {
    clearTimeout(stall);
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

/** Tries the GPU delegate first; falls back to CPU when it fails or hangs (common on mobile). */
async function preferGpu<T>(name: string, make: (delegate: 'GPU' | 'CPU') => Promise<T>): Promise<T> {
  try {
    return await withTimeout(make('GPU'), GPU_TIMEOUT_MS);
  } catch (err) {
    console.warn(`${name}: GPU delegate unavailable, falling back to CPU`, err);
    return withTimeout(make('CPU'), CPU_TIMEOUT_MS).catch((e) => {
      throw new Error(`${name} could not start on this device (${(e as Error).message}).`);
    });
  }
}

async function create(onProgress: (p: LoadProgress) => void): Promise<Landmarkers> {
  const loaded: Record<string, number> = {};
  const totals: Record<string, number> = {};
  const report = (key: string) => (l: number, t: number) => {
    loaded[key] = l;
    totals[key] = t;
    const total = Object.values(totals).reduce((a, b) => a + b, 0);
    if (Object.keys(totals).length === 3 && total > 0) {
      const sum = Object.values(loaded).reduce((a, b) => a + b, 0);
      onProgress({ stage: 'download', fraction: Math.min(1, sum / total) });
    }
  };
  onProgress({ stage: 'download', fraction: 0 });
  const runtime = `mediapipe-wasm/vision_wasm${(await FilesetResolver.isSimdSupported()) ? '' : '_nosimd'}_internal`;
  const [wasm, faceModel, poseModel] = await Promise.all([
    download(`${runtime}.wasm`, report('wasm')),
    download(FILES.face, report('face')),
    download(FILES.pose, report('pose')),
  ]);
  onProgress({ stage: 'init' });

  // Each task otherwise fetches the 12 MB wasm again on its own.
  const fileset = {
    wasmLoaderPath: assetUrl(`${runtime}.js`),
    wasmBinaryPath: URL.createObjectURL(new Blob([wasm], { type: 'application/wasm' })),
  };
  // Sequential creation keeps peak memory low; iOS Safari reloads the tab when it runs out.
  const face = await preferGpu('FaceLandmarker', (delegate) =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: faceModel, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
    }),
  );
  const pose = await preferGpu('PoseLandmarker', (delegate) =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: poseModel, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
    }),
  );
  return { face, pose };
}

let cached: Promise<Landmarkers> | null = null;
const listeners = new Set<(p: LoadProgress) => void>();

/** Loads both landmarkers once; a failed load is retried on the next call. */
export function loadLandmarkers(onProgress?: (p: LoadProgress) => void): Promise<Landmarkers> {
  if (onProgress) listeners.add(onProgress);
  cached ??= create((p) => listeners.forEach((l) => l(p))).catch((err) => {
    cached = null;
    throw err;
  });
  const done = () => onProgress && listeners.delete(onProgress);
  cached.then(done, done);
  return cached;
}
