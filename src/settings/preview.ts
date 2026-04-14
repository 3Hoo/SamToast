// Preview panel animation logic for the settings window.
// Intentionally independent from src/notification/image.ts to avoid coupling
// (targets #preview-image-<eventKey> instead of #toast-image).

import { convertFileSrc } from '@tauri-apps/api/core';
import { readDir, readTextFile } from '@tauri-apps/plugin-fs';

const timers: Map<string, ReturnType<typeof setInterval>> = new Map();

export function stopPreview(id: string): void {
  const t = timers.get(id);
  if (t !== undefined) {
    clearInterval(t);
    timers.delete(id);
  }
}

export async function setPreviewImage(
  id: string,
  imagePath: string | null | undefined,
  frameIntervalMs: number,
  loop = true,
): Promise<void> {
  stopPreview(id);

  const imgEl = document.getElementById(`preview-image-${id}`) as HTMLImageElement;
  const iframeEl = document.getElementById(`preview-iframe-${id}`) as HTMLIFrameElement;
  
  if (!imgEl || !iframeEl) return;

  if (!imagePath) {
    iframeEl.style.display = 'none';
    imgEl.style.display = 'block';
    imgEl.src = '/assets/default-icon.png';
    return;
  }

  if (imagePath.toLowerCase().endsWith('.html') || imagePath.toLowerCase().endsWith('.htm')) {
    imgEl.style.display = 'none';
    iframeEl.style.display = 'block';
    try {
      iframeEl.srcdoc = await loadHtmlWithInlinedCss(imagePath);
    } catch {
      iframeEl.srcdoc = '';
    }
    return;
  }

  iframeEl.style.display = 'none';
  imgEl.style.display = 'block';

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
        const next = frameIdx + 1;
        if (!loop && next >= frames.length) {
          stopPreview(id);
          return;
        }
        frameIdx = next % frames.length;
        imgEl.src = frames[frameIdx];
      }, interval);
      timers.set(id, t);
    }
  } catch {
    imgEl.src = convertFileSrc(imagePath);
  }
}

// ---------------------------------------------------------------------------
// HTML helper — inline relative <link rel="stylesheet"> as <style> blocks
// so srcdoc iframes can render external CSS files.
// ---------------------------------------------------------------------------

async function loadHtmlWithInlinedCss(htmlPath: string): Promise<string> {
  const html = await readTextFile(htmlPath);
  const dir = htmlPath.replace(/\\/g, '/').replace(/\/[^/]+$/, '');

  const re = /<link([^>]*)>/gi;
  const replacements: [string, string][] = [];
  let match: RegExpExecArray | null;

  while ((match = re.exec(html)) !== null) {
    const tag = match[0];
    if (!/rel=["']stylesheet["']/i.test(tag)) continue;
    const hrefMatch = /href=["']([^"']+)["']/i.exec(tag);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    if (/^https?:\/\/|^\/\/|^\//.test(href)) continue;
    const cssPath = `${dir}/${href.replace(/^\.\//, '')}`;
    try {
      const css = await readTextFile(cssPath);
      replacements.push([tag, `<style>\n${css}\n</style>`]);
    } catch { /* skip unreadable css */ }
  }

  let result = html;
  for (const [original, replacement] of replacements) {
    result = result.replace(original, replacement);
  }
  return result;
}
