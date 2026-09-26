export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser cannot access the camera. Open the page over HTTPS in a current Chrome or Safari.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: 'user',
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30 },
    },
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return stream;
}

/**
 * Freezes auto-exposure and white balance where the browser allows it
 * (Chrome on Android); abrupt exposure changes corrupt the colour signal.
 */
export async function lockExposure(stream: MediaStream): Promise<void> {
  const track = stream.getVideoTracks()[0];
  const caps = (track?.getCapabilities?.() ?? {}) as Record<string, unknown>;
  const advanced: Record<string, string>[] = [];
  if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('manual')) {
    advanced.push({ exposureMode: 'manual' });
  }
  if (Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('manual')) {
    advanced.push({ whiteBalanceMode: 'manual' });
  }
  if (!advanced.length) return;
  await track.applyConstraints({ advanced } as MediaTrackConstraints).catch(() => {});
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}
