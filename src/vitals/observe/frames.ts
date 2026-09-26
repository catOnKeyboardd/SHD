/** Per-frame facial observation extracted from MediaPipe landmarks and blendshapes. */
export interface FaceObservation {
  t: number;
  /** Blendshape scores by category name (e.g. "eyeBlinkLeft"). */
  blend: Record<string, number>;
  /**
   * Mouth-corner heights in a head-roll-corrected frame, normalised by
   * inter-ocular distance. Positive is downward (image coordinates).
   */
  cornerA: number;
  cornerB: number;
}

export function avg(obs: FaceObservation, a: string, b: string): number {
  return ((obs.blend[a] ?? 0) + (obs.blend[b] ?? 0)) / 2;
}

export function inRange(obs: FaceObservation, [start, end]: readonly [number, number]): boolean {
  return obs.t >= start && obs.t < end;
}
