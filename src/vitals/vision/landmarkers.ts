import { FaceLandmarker, FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

export interface Landmarkers {
  face: FaceLandmarker;
  pose: PoseLandmarker;
}

function assetUrl(path: string): string {
  return new URL(path, document.baseURI).href;
}

async function create(delegate: 'GPU' | 'CPU'): Promise<Landmarkers> {
  const fileset = await FilesetResolver.forVisionTasks(assetUrl('mediapipe-wasm'));
  const [face, pose] = await Promise.all([
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: assetUrl('models/face_landmarker.task'), delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
    }),
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: assetUrl('models/pose_landmarker_lite.task'), delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
    }),
  ]);
  return { face, pose };
}

let cached: Promise<Landmarkers> | null = null;

/** Loads both landmarkers once, preferring the GPU delegate and falling back to CPU. */
export function loadLandmarkers(): Promise<Landmarkers> {
  cached ??= create('GPU').catch((err) => {
    console.warn('GPU delegate unavailable, falling back to CPU', err);
    return create('CPU');
  });
  return cached;
}
