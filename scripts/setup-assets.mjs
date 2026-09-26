// Copies the MediaPipe WASM runtime into public/ and downloads the landmarker
// models once, so the built site never loads anything from a third-party CDN.
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDst = join(root, 'public/mediapipe-wasm');
const modelDst = join(root, 'public/models');

const MODELS = {
  'face_landmarker.task':
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  'pose_landmarker_lite.task':
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
};

async function exists(path) {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

await mkdir(wasmDst, { recursive: true });
for (const file of await readdir(wasmSrc)) {
  await copyFile(join(wasmSrc, file), join(wasmDst, file));
}

await mkdir(modelDst, { recursive: true });
for (const [name, url] of Object.entries(MODELS)) {
  const target = join(modelDst, name);
  if (await exists(target)) continue;
  console.log(`Downloading ${name} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  await writeFile(target, Buffer.from(await res.arrayBuffer()));
}

console.log('MediaPipe assets ready.');
