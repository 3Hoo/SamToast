// Image/animation rendering for the notification window.
//
// - imagePath is a file path  → single static image
// - imagePath is a folder     → cycles through 0.png, 1.png, 2.png… as an animation
// - null/undefined             → shows the bundled default Claude icon

import { convertFileSrc } from '@tauri-apps/api/core';
import { readDir } from '@tauri-apps/plugin-fs';

let animationTimer: ReturnType<typeof setInterval> | null = null;

export async function setImage(
  imagePath: string | undefined,
  frameIntervalMs: number,
): Promise<void> {
  stopAnimation();
  const img = document.getElementById('toast-image') as HTMLImageElement;

  if (!imagePath) {
    img.src = '/assets/default-icon.png';
    return;
  }

  // Try reading as a directory first; fall back to treating it as a file.
  try {
    const entries = await readDir(imagePath);
    const frames = entries
      .filter((e) => e.name && /^\d+\.(png|gif|jpg|webp)$/i.test(e.name))
      .sort((a, b) => parseInt(a.name!, 10) - parseInt(b.name!, 10))
      .map((e) => convertFileSrc(imagePath + '/' + e.name));

    if (frames.length === 0) {
      // Directory exists but contains no numbered images — try the path directly.
      img.src = convertFileSrc(imagePath);
      return;
    }

    let frameIdx = 0;
    img.src = frames[0];

    if (frames.length > 1) {
      animationTimer = setInterval(() => {
        frameIdx = (frameIdx + 1) % frames.length;
        img.src = frames[frameIdx];
      }, frameIntervalMs);
    }
  } catch {
    // readDir failed → treat as a plain file path.
    img.src = convertFileSrc(imagePath);
  }
}

export function stopAnimation(): void {
  if (animationTimer !== null) {
    clearInterval(animationTimer);
    animationTimer = null;
  }
}

// Reserved for external callers that may want to resume a paused animation.
export function startAnimation(): void {}
