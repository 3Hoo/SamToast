// Preview panel animation logic for the settings window.
// Intentionally independent from src/notification/image.ts to avoid coupling
// (targets #preview-image-<eventKey> instead of #toast-image).

import { convertFileSrc } from '@tauri-apps/api/core';
import { readDir } from '@tauri-apps/plugin-fs';

const timers: Map<string, ReturnType<typeof setInterval>> = new Map();

export function stopPreview(id: string): void {
  const t = timers.get(id);
  if (t !== undefined) {
    clearInterval(t);
    timers.delete(id);
  }
}

export async function setPreviewImage(
  imgEl: HTMLImageElement,
  id: string,
  imagePath: string | null | undefined,
  frameIntervalMs: number,
): Promise<void> {
  stopPreview(id);

  if (!imagePath) {
    imgEl.src = '/assets/default-icon.png';
    return;
  }

  try {
    const entries = await readDir(imagePath);
    const frames = entries
      .filter((e) => e.name && /^\d+\.(png|gif|jpg|webp)$/i.test(e.name))
      .sort((a, b) => parseInt(a.name!, 10) - parseInt(b.name!, 10))
      .map((e) => convertFileSrc(imagePath + '/' + e.name));

    if (frames.length === 0) {
      imgEl.src = convertFileSrc(imagePath);
      return;
    }

    let frameIdx = 0;
    imgEl.src = frames[0];

    if (frames.length > 1) {
      const interval = Math.max(frameIntervalMs, 16);
      const t = setInterval(() => {
        frameIdx = (frameIdx + 1) % frames.length;
        imgEl.src = frames[frameIdx];
      }, interval);
      timers.set(id, t);
    }
  } catch {
    imgEl.src = convertFileSrc(imagePath);
  }
}
