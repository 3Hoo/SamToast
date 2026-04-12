// Hook Events section — renders event cards with toggle + detail panel.

import { open } from '@tauri-apps/plugin-dialog';
import type { AppConfig, EventConfig } from './main';
import { setPreviewImage, stopPreview } from './preview';
import { buildToggle, buildHint, showFeedback } from './ui';
import { getConfig, saveConfig } from './store';

const EVENT_KEYS = [
  'Stop',
  'Notification',
  'PreToolUse',
  'PostToolUse',
  'SubagentStop',
] as const;

type EventKey = (typeof EVENT_KEYS)[number];

// Keep a working copy of each event's config so we can save later.
let workingEvents: Record<string, EventConfig> = {};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function applyCardBackground(el: HTMLElement, cfg: EventConfig): void {
  if (!cfg.bg_visible) {
    // Checkerboard to indicate full transparency
    el.style.background =
      'repeating-conic-gradient(rgba(255,255,255,0.05) 0% 25%, transparent 0% 50%) 0 0 / 14px 14px';
    el.style.boxShadow = 'none';
    el.style.border = '1px dashed rgba(255,255,255,0.18)';
  } else if (cfg.image_bg_opacity > 0) {
    el.style.background = hexToRgba(cfg.image_bg_color, cfg.image_bg_opacity);
    el.style.boxShadow = '';
    el.style.border = '1px solid rgba(255,255,255,0.08)';
  } else {
    el.style.background = '';
    el.style.boxShadow = '';
    el.style.border = '';
  }
}

/** Sync all preview card elements from workingEvents[key]. */
function updatePreviewCard(key: EventKey): void {
  const cfg = workingEvents[key];
  if (!cfg) return;

  const card = document.getElementById(`preview-card-${key}`) as HTMLElement | null;
  if (card) applyCardBackground(card, cfg);

  const container = document.getElementById(`preview-container-${key}`) as HTMLElement | null;
  if (container) {
    container.style.width = cfg.image_area.width + 'px';
    container.style.height = cfg.image_area.height + 'px';
  }

  const wrapper = document.getElementById(`preview-wrapper-${key}`) as HTMLElement | null;
  if (wrapper) {
    wrapper.style.transform = `translate(${cfg.container_offset_x}px, ${cfg.container_offset_y}px)`;
  }

  const imgEl = document.getElementById(`preview-image-${key}`) as HTMLImageElement | null;
  const iframeEl = document.getElementById(`preview-iframe-${key}`) as HTMLIFrameElement | null;
  const t = `translate(${cfg.image_offset_x}px, ${cfg.image_offset_y}px) scale(${cfg.image_scale})`;
  if (imgEl) imgEl.style.transform = t;
  if (iframeEl) iframeEl.style.transform = t;

  const appNameEl = document.getElementById(`preview-app-name-${key}`) as HTMLElement | null;
  if (appNameEl) {
    const name = cfg.label_app_name ?? '';
    appNameEl.textContent = name || 'App Name';
    appNameEl.style.display = name ? '' : 'none';
    appNameEl.style.transform = `translate(${cfg.app_name_offset_x}px, ${cfg.app_name_offset_y}px) scale(${cfg.app_name_scale})`;
  }

  const cwdEl = document.getElementById(`preview-cwd-${key}`) as HTMLElement | null;
  if (cwdEl) {
    cwdEl.style.display = cfg.label_show_cwd ? '' : 'none';
    cwdEl.style.transform = `translate(${cfg.cwd_offset_x}px, ${cfg.cwd_offset_y}px) scale(${cfg.cwd_scale})`;
  }

  const badgeEl = document.getElementById(`preview-badge-${key}`) as HTMLElement | null;
  if (badgeEl) {
    badgeEl.textContent = cfg.label_event_name ?? key;
    badgeEl.style.display = cfg.label_show_event_badge ? '' : 'none';
    badgeEl.style.transform = `translate(${cfg.badge_offset_x}px, ${cfg.badge_offset_y}px) scale(${cfg.badge_scale})`;
  }

  updateSizeHint(key);
}

function updateSizeHint(key: EventKey): void {
  const hint = document.getElementById(`preview-size-hint-${key}`);
  if (!hint) return;
  const cfg = workingEvents[key];
  if (!cfg) return;
  const nc = getConfig().notification;
  hint.textContent =
    `Window: ${nc.window_width ?? 360}×${nc.window_height ?? 130}px  ·  ` +
    `Image area: ${cfg.image_area.width}×${cfg.image_area.height}px  ·  ` +
    `Scale: ${cfg.image_scale.toFixed(2)}×`;
}

// ---------------------------------------------------------------------------
// Full notification preview panel
// ---------------------------------------------------------------------------

function buildPreviewPanel(key: EventKey): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'preview-panel';

  // Header row
  const labelRow = document.createElement('div');
  labelRow.style.display = 'flex';
  labelRow.style.alignItems = 'center';
  labelRow.style.justifyContent = 'space-between';
  labelRow.style.marginBottom = '2px';

  const label = document.createElement('div');
  label.className = 'preview-label';
  label.textContent = 'Preview';
  labelRow.appendChild(label);
  panel.appendChild(labelRow);

  const sizeHint = document.createElement('div');
  sizeHint.id = `preview-size-hint-${key}`;
  sizeHint.className = 'form-hint';
  sizeHint.style.marginBottom = '8px';
  panel.appendChild(sizeHint);

  // ---- Stage ----
  const stage = document.createElement('div');
  stage.className = 'preview-stage';

  // ---- Card wrapper (for card resize handle) ----
  const cardWrapper = document.createElement('div');
  cardWrapper.style.position = 'relative';
  cardWrapper.style.display = 'inline-block';

  // ---- Notification card ----
  const card = document.createElement('div');
  card.id = `preview-card-${key}`;
  card.className = 'preview-toast-card';

  const nc = getConfig().notification;
  const initCardW = nc.window_width ?? 360;
  const initCardH = nc.window_height ?? 130;
  // Card size ≈ window size minus body padding (10px * 2)
  card.style.width = Math.max(120, initCardW - 20) + 'px';
  card.style.height = Math.max(40, initCardH - 20) + 'px';

  const initCfg = workingEvents[key];
  if (initCfg) applyCardBackground(card, initCfg);

  // ---- Image wrapper (holds container + area-resize handle) ----
  const imgWrapper = document.createElement('div');
  imgWrapper.id = `preview-wrapper-${key}`;
  imgWrapper.className = 'preview-image-wrapper';

  // ---- Image container ----
  const imgContainer = document.createElement('div');
  imgContainer.id = `preview-container-${key}`;
  imgContainer.className = 'preview-image-container';
  if (initCfg) {
    imgContainer.style.width = initCfg.image_area.width + 'px';
    imgContainer.style.height = initCfg.image_area.height + 'px';
  }

  const img = document.createElement('img');
  img.id = `preview-image-${key}`;
  img.src = '/assets/default-icon.png';
  img.alt = 'preview';

  const iframe = document.createElement('iframe');
  iframe.id = `preview-iframe-${key}`;
  iframe.style.display = 'none';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = 'none';

  // Apply initial transform
  const applyImgTransform = (ox: number, oy: number, sc: number) => {
    const t = `translate(${ox}px, ${oy}px) scale(${sc})`;
    img.style.transform = t;
    iframe.style.transform = t;
  };
  if (initCfg) {
    applyImgTransform(initCfg.image_offset_x, initCfg.image_offset_y, initCfg.image_scale);
  }

  img.style.cursor = 'move';

  // ---- Scale handle (inside container, bottom-right) ----
  const scaleHandle = document.createElement('div');
  scaleHandle.className = 'preview-scale-handle';
  scaleHandle.title = 'Drag to scale inner image';
  scaleHandle.innerHTML = '⊙';

  imgContainer.appendChild(img);
  imgContainer.appendChild(iframe);
  imgContainer.appendChild(scaleHandle);

  // ---- Area resize handle (outside container, bottom-right) ----
  const areaHandle = document.createElement('div');
  areaHandle.className = 'preview-resize-handle';
  areaHandle.title = 'Drag to resize image area';

  // ---- Container move handle (top-left) ----
  const containerMove = document.createElement('div');
  containerMove.className = 'preview-container-move-handle';
  containerMove.title = 'Drag to move container';
  containerMove.innerHTML = '☩';

  imgWrapper.appendChild(imgContainer);
  imgWrapper.appendChild(areaHandle);
  imgWrapper.appendChild(containerMove);

  // ---- Info panel ----
  const infoPanel = document.createElement('div');
  infoPanel.className = 'preview-info';

  const appNameEl = document.createElement('div');
  appNameEl.id = `preview-app-name-${key}`;
  appNameEl.className = 'preview-app-name-el';
  appNameEl.textContent = initCfg?.label_app_name || 'App Name';
  appNameEl.style.display = initCfg?.label_app_name ? '' : 'none';

  const cwdEl = document.createElement('div');
  cwdEl.id = `preview-cwd-${key}`;
  cwdEl.className = 'preview-cwd-el';
  cwdEl.textContent = '~/projects/example';
  cwdEl.style.display = initCfg?.label_show_cwd !== false ? '' : 'none';

  const badgeEl = document.createElement('div');
  badgeEl.id = `preview-badge-${key}`;
  badgeEl.className = 'preview-badge-el';
  badgeEl.textContent = initCfg?.label_event_name ?? key;
  badgeEl.style.display = initCfg?.label_show_event_badge !== false ? '' : 'none';

  infoPanel.appendChild(appNameEl);
  infoPanel.appendChild(cwdEl);
  infoPanel.appendChild(badgeEl);

  card.appendChild(imgWrapper);
  card.appendChild(infoPanel);

  // ---- Card resize handle (outside card, bottom-right) ----
  const cardHandle = document.createElement('div');
  cardHandle.className = 'preview-card-resize-handle';
  cardHandle.title = 'Drag to resize notification window';

  cardWrapper.appendChild(card);
  cardWrapper.appendChild(cardHandle);
  stage.appendChild(cardWrapper);
  panel.appendChild(stage);
  panel.appendChild(buildHint(
    'Drag image → position offset  ·  Drag ⊙ (bottom-right inside image) → scale  ·  ' +
    'Drag ▪ (bottom-right outside image) → image area  ·  Drag ▫ (bottom-right outside card) → window size'
  ));

  // ---- Generic Customization (Drag & Scroll) ----
  const makeCustomizable = (
    el: HTMLElement,
    offsetXField: keyof EventConfig,
    offsetYField: keyof EventConfig,
    scaleField?: keyof EventConfig,
    dragHandle?: HTMLElement   // if set, only start drag when clicking this element
  ) => {
    const trigger = dragHandle || el;
    trigger.style.cursor = 'move';
    el.style.transformOrigin = 'left center';
    el.style.display = window.getComputedStyle(el).display === 'none' ? 'none' : 'inline-block';

    trigger.addEventListener('mousedown', (e) => {
      // If no dedicated dragHandle, avoid starting drag if we click a scale/move handle
      if (!dragHandle && (e.target as HTMLElement).className.includes('handle')) return;
      
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      
      const startX = e.clientX;
      const startY = e.clientY;
      const cfg = workingEvents[key] as any;
      if (!cfg) return;
      const startOX = cfg[offsetXField] ?? 0;
      const startOY = cfg[offsetYField] ?? 0;

      const onMouseMove = (me: MouseEvent) => {
        const newOX = Math.round(startOX + (me.clientX - startX));
        const newOY = Math.round(startOY + (me.clientY - startY));
        if (workingEvents[key]) {
          (workingEvents[key] as any)[offsetXField] = newOX;
          (workingEvents[key] as any)[offsetYField] = newOY;
          updatePreviewCard(key);
        }
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    if (scaleField) {
      el.addEventListener('wheel', (e) => {
        if (!e.shiftKey) return;
        e.preventDefault();
        const cfg = workingEvents[key] as any;
        if (!cfg) return;
        const currentScale = cfg[scaleField] ?? 1.0;
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newScale = Math.max(0.1, Math.min(5.0, currentScale + delta));
        (workingEvents[key] as any)[scaleField] = Math.round(newScale * 10) / 10;
        updatePreviewCard(key);
      });
    }
  };

  makeCustomizable(appNameEl, 'app_name_offset_x', 'app_name_offset_y', 'app_name_scale');
  makeCustomizable(cwdEl, 'cwd_offset_x', 'cwd_offset_y', 'cwd_scale');
  makeCustomizable(badgeEl, 'badge_offset_x', 'badge_offset_y', 'badge_scale');
  // Use the dedicated handle to drag the container, leaving the inner image dragging alone
  makeCustomizable(imgWrapper, 'container_offset_x', 'container_offset_y', undefined, containerMove);
  
  // Disable default drag for text selections inside customizable elements
  [appNameEl, cwdEl, badgeEl].forEach(el => {
    el.style.userSelect = 'none';
  });

  // ---- Drag state (for Resize & Image inside) ----
  let imageDragging = false;
  let imgStartX = 0, imgStartY = 0, imgStartOX = 0, imgStartOY = 0;

  let scaleDragging = false;
  let scaleStartX = 0, scaleStartY = 0, scaleStartVal = 1;

  let areaResizing = false;
  let areaStartX = 0, areaStartY = 0, areaStartW = 0, areaStartH = 0;

  let cardResizing = false;
  let cardStartX = 0, cardStartY = 0, cardStartW = initCardW, cardStartH = initCardH;
  let currentWindowW = initCardW, currentWindowH = initCardH;

  // ---- Mousedown handlers ----
  imgContainer.addEventListener('mousedown', (e) => {
    // If clicking on scaleHandle or areaHandle, don't drag the content
    if ((e.target as HTMLElement).className.includes('handle')) return;
    
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    imageDragging = true;
    imgStartX = e.clientX;
    imgStartY = e.clientY;
    const c = workingEvents[key];
    imgStartOX = c?.image_offset_x ?? 0;
    imgStartOY = c?.image_offset_y ?? 0;
  });

  scaleHandle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    scaleDragging = true;
    scaleStartX = e.clientX;
    scaleStartY = e.clientY;
    scaleStartVal = workingEvents[key]?.image_scale ?? 1;
  });

  areaHandle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    areaResizing = true;
    areaStartX = e.clientX;
    areaStartY = e.clientY;
    const c = workingEvents[key];
    areaStartW = c?.image_area.width ?? 80;
    areaStartH = c?.image_area.height ?? 80;
  });

  cardHandle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    cardResizing = true;
    cardStartX = e.clientX;
    cardStartY = e.clientY;
    const n = getConfig().notification;
    cardStartW = n.window_width ?? 360;
    cardStartH = n.window_height ?? 130;
    currentWindowW = cardStartW;
    currentWindowH = cardStartH;
  });

  // ---- Global mousemove ----
  window.addEventListener('mousemove', (e) => {
    if (imageDragging) {
      const newOX = Math.round(imgStartOX + (e.clientX - imgStartX));
      const newOY = Math.round(imgStartOY + (e.clientY - imgStartY));
      if (workingEvents[key]) {
        workingEvents[key]!.image_offset_x = newOX;
        workingEvents[key]!.image_offset_y = newOY;
      }
      applyImgTransform(newOX, newOY, workingEvents[key]?.image_scale ?? 1);
      updateSizeHint(key);
    }

    if (scaleDragging) {
      // Diagonal drag: right+down = bigger, left+up = smaller
      const delta = ((e.clientX - scaleStartX) + (e.clientY - scaleStartY)) / 120;
      const raw = Math.max(0.05, Math.min(10, scaleStartVal + delta));
      const sc = Math.round(raw * 20) / 20; // snap to 0.05 steps
      if (workingEvents[key]) workingEvents[key]!.image_scale = sc;
      const c = workingEvents[key];
      applyImgTransform(c?.image_offset_x ?? 0, c?.image_offset_y ?? 0, sc);
      updateSizeHint(key);
    }

    if (areaResizing) {
      const newW = Math.max(24, Math.round(areaStartW + (e.clientX - areaStartX)));
      const newH = Math.max(24, Math.round(areaStartH + (e.clientY - areaStartY)));
      imgContainer.style.width = newW + 'px';
      imgContainer.style.height = newH + 'px';
      if (workingEvents[key]) {
        workingEvents[key]!.image_area = { width: newW, height: newH };
      }
      updateSizeHint(key);
    }

    if (cardResizing) {
      const newW = Math.max(160, Math.round(cardStartW + (e.clientX - cardStartX)));
      const newH = Math.max(60, Math.round(cardStartH + (e.clientY - cardStartY)));
      currentWindowW = newW;
      currentWindowH = newH;
      card.style.width = Math.max(120, newW - 20) + 'px';
      card.style.height = Math.max(40, newH - 20) + 'px';
      updateSizeHint(key);
    }
  });

  // ---- Global mouseup ----
  window.addEventListener('mouseup', async () => {
    if (areaResizing) {
      areaResizing = false;
      void refreshPreview(key);
    }
    imageDragging = false;
    scaleDragging = false;

    if (cardResizing) {
      cardResizing = false;
      // Auto-save new window size to NotificationConfig
      void saveConfig({
        notification: {
          ...getConfig().notification,
          window_width: currentWindowW,
          window_height: currentWindowH,
        },
      });
      updateSizeHint(key);
    }
  });

  // Initial hint
  updateSizeHint(key);

  return panel;
}

// ---------------------------------------------------------------------------
// Refresh preview (image + card state)
// ---------------------------------------------------------------------------

async function refreshPreview(key: EventKey): Promise<void> {
  const cfg = workingEvents[key];
  if (!cfg) return;
  await setPreviewImage(key, cfg.image_path, cfg.frame_interval_ms);
  updatePreviewCard(key);
}

// ---------------------------------------------------------------------------
// Detail panel (per-event settings)
// ---------------------------------------------------------------------------

function buildDetailPanel(key: EventKey, cfg: EventConfig): HTMLElement {
  const detail = document.createElement('div');
  detail.className = 'event-detail';

  const inner = document.createElement('div');
  inner.className = 'event-detail-inner';

  // --- Sound path ---
  const soundGroup = document.createElement('div');
  soundGroup.className = 'form-group';

  const soundLabel = document.createElement('label');
  soundLabel.className = 'form-label';
  soundLabel.textContent = 'Sound Path';
  soundGroup.appendChild(soundLabel);

  const soundRow = document.createElement('div');
  soundRow.className = 'path-row';

  const soundInput = document.createElement('input');
  soundInput.type = 'text';
  soundInput.className = 'form-input';
  soundInput.placeholder = 'Default Windows sound';
  soundInput.value = cfg.sound_path ?? '';
  soundInput.addEventListener('input', () => {
    workingEvents[key]!.sound_path = soundInput.value.trim() || null;
  });

  const soundBrowse = document.createElement('button');
  soundBrowse.className = 'btn btn-secondary btn-sm';
  soundBrowse.textContent = 'Browse';
  soundBrowse.addEventListener('click', async () => {
    const result = await open({
      directory: false,
      multiple: false,
      filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'flac'] }],
    });
    const path = typeof result === 'string' ? result : Array.isArray(result) ? result[0] ?? null : null;
    if (path) {
      soundInput.value = path;
      workingEvents[key]!.sound_path = path;
    }
  });

  soundRow.appendChild(soundInput);
  soundRow.appendChild(soundBrowse);
  soundGroup.appendChild(soundRow);
  inner.appendChild(soundGroup);

  // --- Image path ---
  const imageGroup = document.createElement('div');
  imageGroup.className = 'form-group';

  const imageLabel = document.createElement('label');
  imageLabel.className = 'form-label';
  imageLabel.textContent = 'Asset Path (Image / Folder / HTML)';
  imageGroup.appendChild(imageLabel);

  const imageRow = document.createElement('div');
  imageRow.className = 'path-row';

  const imageInput = document.createElement('input');
  imageInput.type = 'text';
  imageInput.className = 'form-input';
  imageInput.placeholder = 'Default Claude icon';
  imageInput.value = cfg.image_path ?? '';
  imageInput.addEventListener('input', () => {
    workingEvents[key]!.image_path = imageInput.value.trim() || null;
    void refreshPreview(key);
  });

  const imageBrowseFile = document.createElement('button');
  imageBrowseFile.className = 'btn btn-secondary btn-sm';
  imageBrowseFile.textContent = 'File';
  imageBrowseFile.addEventListener('click', async () => {
    const result = await open({
      directory: false,
      multiple: false,
      filters: [{ name: 'Asset', extensions: ['png', 'jpg', 'gif', 'webp', 'html', 'htm'] }],
    });
    const path = typeof result === 'string' ? result : Array.isArray(result) ? result[0] ?? null : null;
    if (path) {
      imageInput.value = path;
      workingEvents[key]!.image_path = path;
      void refreshPreview(key);
    }
  });

  const imageBrowseDir = document.createElement('button');
  imageBrowseDir.className = 'btn btn-secondary btn-sm';
  imageBrowseDir.textContent = 'Folder';
  imageBrowseDir.addEventListener('click', async () => {
    const result = await open({ directory: true, multiple: false });
    const path = typeof result === 'string' ? result : Array.isArray(result) ? result[0] ?? null : null;
    if (path) {
      imageInput.value = path;
      workingEvents[key]!.image_path = path;
      void refreshPreview(key);
    }
  });

  imageRow.appendChild(imageInput);
  imageRow.appendChild(imageBrowseFile);
  imageRow.appendChild(imageBrowseDir);
  imageGroup.appendChild(imageRow);
  imageGroup.appendChild(buildHint('Image, HTML file, or folder with numbered frames (0.png, 1.png…) for animation.'));
  inner.appendChild(imageGroup);

  // --- Background color ---
  const bgColorGroup = document.createElement('div');
  bgColorGroup.className = 'form-group';

  const bgColorLabel = document.createElement('label');
  bgColorLabel.className = 'form-label';
  bgColorLabel.textContent = 'Card Background Color';
  bgColorGroup.appendChild(bgColorLabel);

  const bgColorRow = document.createElement('div');
  bgColorRow.className = 'path-row';
  bgColorRow.style.alignItems = 'center';
  bgColorRow.style.gap = '10px';

  const bgColorInput = document.createElement('input');
  bgColorInput.type = 'color';
  bgColorInput.className = 'form-color';
  bgColorInput.value = cfg.image_bg_color;

  const bgColorText = document.createElement('input');
  bgColorText.type = 'text';
  bgColorText.className = 'form-input';
  bgColorText.style.width = '100px';
  bgColorText.value = cfg.image_bg_color;
  bgColorText.placeholder = '#000000';

  bgColorInput.addEventListener('input', () => {
    bgColorText.value = bgColorInput.value;
    workingEvents[key]!.image_bg_color = bgColorInput.value;
    updatePreviewCard(key);
  });
  bgColorText.addEventListener('input', () => {
    const hex = bgColorText.value;
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      bgColorInput.value = hex;
      workingEvents[key]!.image_bg_color = hex;
      updatePreviewCard(key);
    }
  });

  bgColorRow.appendChild(bgColorInput);
  bgColorRow.appendChild(bgColorText);
  bgColorGroup.appendChild(bgColorRow);
  inner.appendChild(bgColorGroup);

  // --- Background opacity ---
  const bgOpacityGroup = document.createElement('div');
  bgOpacityGroup.className = 'form-group';

  const bgOpacityLabel = document.createElement('label');
  bgOpacityLabel.className = 'form-label';
  bgOpacityLabel.textContent = 'Card Background Opacity';
  bgOpacityGroup.appendChild(bgOpacityLabel);

  const bgOpacityRow = document.createElement('div');
  bgOpacityRow.className = 'path-row';
  bgOpacityRow.style.alignItems = 'center';
  bgOpacityRow.style.gap = '10px';

  const bgOpacityRange = document.createElement('input');
  bgOpacityRange.type = 'range';
  bgOpacityRange.min = '0';
  bgOpacityRange.max = '1';
  bgOpacityRange.step = '0.05';
  bgOpacityRange.value = String(cfg.image_bg_opacity);
  bgOpacityRange.style.flex = '1';

  const bgOpacityValue = document.createElement('span');
  bgOpacityValue.className = 'form-hint';
  bgOpacityValue.style.minWidth = '36px';
  bgOpacityValue.style.textAlign = 'right';
  bgOpacityValue.textContent = Math.round(cfg.image_bg_opacity * 100) + '%';

  bgOpacityRange.addEventListener('input', () => {
    const v = parseFloat(bgOpacityRange.value);
    workingEvents[key]!.image_bg_opacity = v;
    bgOpacityValue.textContent = Math.round(v * 100) + '%';
    updatePreviewCard(key);
  });

  bgOpacityRow.appendChild(bgOpacityRange);
  bgOpacityRow.appendChild(bgOpacityValue);
  bgOpacityGroup.appendChild(bgOpacityRow);
  inner.appendChild(bgOpacityGroup);

  // --- Background visible toggle ---
  const bgVisibleRow = document.createElement('div');
  bgVisibleRow.style.display = 'flex';
  bgVisibleRow.style.alignItems = 'center';
  bgVisibleRow.style.gap = '10px';
  bgVisibleRow.style.marginBottom = '8px';

  const bgVisibleToggle = buildToggle(cfg.bg_visible, (checked) => {
    workingEvents[key]!.bg_visible = checked;
    updatePreviewCard(key);
  });
  const bgVisibleLabel = document.createElement('span');
  bgVisibleLabel.className = 'form-hint';
  bgVisibleLabel.style.color = 'var(--text-secondary)';
  bgVisibleLabel.textContent = 'Show notification card background (glassmorphism)';
  bgVisibleRow.appendChild(bgVisibleToggle);
  bgVisibleRow.appendChild(bgVisibleLabel);
  inner.appendChild(bgVisibleRow);

  // --- Frame interval ---
  const fpsGroup = document.createElement('div');
  fpsGroup.className = 'form-group';

  const fpsLabel = document.createElement('label');
  fpsLabel.className = 'form-label';
  fpsLabel.textContent = 'Animation Frame Interval (ms)';
  fpsGroup.appendChild(fpsLabel);

  const fpsInput = document.createElement('input');
  fpsInput.type = 'number';
  fpsInput.className = 'form-input';
  fpsInput.min = '16';
  fpsInput.max = '5000';
  fpsInput.value = String(cfg.frame_interval_ms);
  fpsInput.addEventListener('change', () => {
    const v = parseInt(fpsInput.value, 10);
    if (!isNaN(v) && v >= 16) {
      workingEvents[key]!.frame_interval_ms = v;
      void refreshPreview(key);
    }
  });
  fpsGroup.appendChild(fpsInput);
  fpsGroup.appendChild(buildHint('Minimum 16 ms (~60 fps). Used for animated image folders.'));
  inner.appendChild(fpsGroup);

  // --- Label customization ---
  const textSection = document.createElement('div');
  textSection.className = 'form-group';
  textSection.style.borderTop = '1px solid var(--border)';
  textSection.style.paddingTop = '14px';
  textSection.style.marginTop = '4px';

  const textSectionLabel = document.createElement('div');
  textSectionLabel.className = 'form-label';
  textSectionLabel.textContent = 'Label Customization';
  textSectionLabel.style.marginBottom = '12px';
  textSection.appendChild(textSectionLabel);

  // App name
  const appNameGroup = document.createElement('div');
  appNameGroup.className = 'form-group';
  appNameGroup.style.marginBottom = '10px';
  const appNameLabel = document.createElement('label');
  appNameLabel.className = 'form-label';
  appNameLabel.textContent = 'App Name';
  appNameGroup.appendChild(appNameLabel);
  const appNameInput = document.createElement('input');
  appNameInput.type = 'text';
  appNameInput.className = 'form-input';
  appNameInput.placeholder = 'Leave empty to hide';
  appNameInput.value = cfg.label_app_name ?? '';
  appNameInput.addEventListener('input', () => {
    workingEvents[key]!.label_app_name = appNameInput.value.trim() || null;
    updatePreviewCard(key);
  });
  appNameGroup.appendChild(appNameInput);
  textSection.appendChild(appNameGroup);

  // Event badge text
  const evNameGroup = document.createElement('div');
  evNameGroup.className = 'form-group';
  evNameGroup.style.marginBottom = '10px';
  const evNameLabel = document.createElement('label');
  evNameLabel.className = 'form-label';
  evNameLabel.textContent = 'Event Badge Text';
  evNameGroup.appendChild(evNameLabel);
  const evNameInput = document.createElement('input');
  evNameInput.type = 'text';
  evNameInput.className = 'form-input';
  evNameInput.placeholder = key;
  evNameInput.value = cfg.label_event_name ?? '';
  evNameInput.addEventListener('input', () => {
    workingEvents[key]!.label_event_name = evNameInput.value.trim() || null;
    updatePreviewCard(key);
  });
  evNameGroup.appendChild(evNameInput);
  textSection.appendChild(evNameGroup);

  // Show CWD toggle
  const cwdToggleRow = document.createElement('div');
  cwdToggleRow.style.display = 'flex';
  cwdToggleRow.style.alignItems = 'center';
  cwdToggleRow.style.gap = '10px';
  cwdToggleRow.style.marginBottom = '8px';
  const cwdToggle = buildToggle(cfg.label_show_cwd, (checked) => {
    workingEvents[key]!.label_show_cwd = checked;
    updatePreviewCard(key);
  });
  const cwdToggleLabel = document.createElement('span');
  cwdToggleLabel.className = 'form-hint';
  cwdToggleLabel.style.color = 'var(--text-secondary)';
  cwdToggleLabel.textContent = 'Show working directory path';
  cwdToggleRow.appendChild(cwdToggle);
  cwdToggleRow.appendChild(cwdToggleLabel);
  textSection.appendChild(cwdToggleRow);

  // Show event badge toggle
  const badgeToggleRow = document.createElement('div');
  badgeToggleRow.style.display = 'flex';
  badgeToggleRow.style.alignItems = 'center';
  badgeToggleRow.style.gap = '10px';
  const badgeToggle = buildToggle(cfg.label_show_event_badge, (checked) => {
    workingEvents[key]!.label_show_event_badge = checked;
    updatePreviewCard(key);
  });
  const badgeToggleLabel = document.createElement('span');
  badgeToggleLabel.className = 'form-hint';
  badgeToggleLabel.style.color = 'var(--text-secondary)';
  badgeToggleLabel.textContent = 'Show event badge';
  badgeToggleRow.appendChild(badgeToggle);
  badgeToggleRow.appendChild(badgeToggleLabel);
  textSection.appendChild(badgeToggleRow);

  inner.appendChild(textSection);

  // --- Full notification preview ---
  inner.appendChild(buildPreviewPanel(key));

  // --- Save button ---
  const saveBar = document.createElement('div');
  saveBar.className = 'save-bar';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = 'Save Event Settings';

  const feedback = document.createElement('span');

  saveBtn.addEventListener('click', async () => {
    try {
      await saveConfig({ events: { ...getConfig().events, ...workingEvents } });
      showFeedback(feedback, 'Saved!', 'success');
    } catch (e) {
      showFeedback(feedback, String(e), 'error');
    }
  });

  saveBar.appendChild(saveBtn);
  saveBar.appendChild(feedback);
  inner.appendChild(saveBar);

  detail.appendChild(inner);
  return detail;
}

// ---------------------------------------------------------------------------
// Event card
// ---------------------------------------------------------------------------

function buildEventCard(key: EventKey, cfg: EventConfig): HTMLElement {
  const card = document.createElement('div');
  card.className = 'event-card';

  const header = document.createElement('div');
  header.className = 'event-header';

  const toggle = buildToggle(cfg.enabled, (checked) => {
    workingEvents[key]!.enabled = checked;
  });

  const name = document.createElement('div');
  name.className = 'event-name';
  name.textContent = key;

  const chevron = document.createElement('span');
  chevron.className = 'event-chevron';
  chevron.textContent = '▶';

  header.appendChild(toggle);
  header.appendChild(name);
  header.appendChild(chevron);

  const detail = buildDetailPanel(key, cfg);

  header.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.toggle')) return;
    const isExpanded = card.classList.toggle('expanded');
    if (isExpanded) {
      void refreshPreview(key);
    } else {
      stopPreview(key);
    }
  });

  card.appendChild(header);
  card.appendChild(detail);
  return card;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function renderEvents(config: AppConfig): void {
  workingEvents = JSON.parse(JSON.stringify(config.events)) as Record<string, EventConfig>;

  const container = document.getElementById('events-list')!;

  for (const key of EVENT_KEYS) {
    const cfg: EventConfig = workingEvents[key] ?? {
      enabled: false,
      sound_path: null,
      image_path: null,
      image_area: { width: 80, height: 80 },
      image_bg_color: '#000000',
      image_bg_opacity: 0,
      frame_interval_ms: 100,
      image_offset_x: 0,
      image_offset_y: 0,
      image_scale: 1,
      bg_visible: true,
      label_app_name: null,
      label_show_cwd: true,
      label_show_event_badge: true,
      label_event_name: null,
    };
    workingEvents[key] = cfg;
    container.appendChild(buildEventCard(key, cfg));
  }
}
