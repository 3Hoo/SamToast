// Image/animation rendering for the notification window.
//
// - imagePath is a file path  → single static image
// - imagePath is a folder     → cycles through 0.png, 1.png, 2.png… as an animation
// - null/undefined             → shows the bundled default Claude icon

import { convertFileSrc } from '@tauri-apps/api/core';
import { readDir, readTextFile } from '@tauri-apps/plugin-fs';

let animationTimer: ReturnType<typeof setInterval> | null = null;

export async function setImage(
  imagePath: string | undefined,
  frameIntervalMs: number,
): Promise<void> {
  stopAnimation();
  const img = document.getElementById('toast-image') as HTMLImageElement;
  const iframe = document.getElementById('toast-iframe') as HTMLIFrameElement;

  if (!imagePath) {
    iframe.style.display = 'none';
    img.style.display = 'block';
    img.src = '/assets/default-icon.png';
    return;
  }

  // Display HTML
  if (imagePath.toLowerCase().endsWith('.html') || imagePath.toLowerCase().endsWith('.htm')) {
    img.style.display = 'none';
    iframe.style.display = 'block';
    try {
      const htmlText = await readTextFile(imagePath);
      iframe.srcdoc = htmlText;
    } catch {
      iframe.src = '';
    }
    return;
  }

  // Handle images or an animation sequence
  iframe.style.display = 'none';
  img.style.display = 'block';

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
      const interval = Math.max(frameIntervalMs, 16); // minimum ~60fps
      animationTimer = setInterval(() => {
        frameIdx = (frameIdx + 1) % frames.length;
        img.src = frames[frameIdx];
      }, interval);
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
