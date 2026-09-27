/** Per-frame facial observation extracted from MediaPipe blendshapes. */
export interface FaceObservation {
  t: number;
  /** Blendshape scores by category name (e.g. "eyeBlinkLeft"). */
  blend: Record<string, number>;
}

export function avg(obs: FaceObservation, a: string, b: string): number {
  return ((obs.blend[a] ?? 0) + (obs.blend[b] ?? 0)) / 2;
}
