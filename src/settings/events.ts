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

function buildPreviewPanel(key: EventKey): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'preview-panel';

  const labelRow = document.createElement('div');
  labelRow.style.display = 'flex';
  labelRow.style.alignItems = 'center';
  labelRow.style.justifyContent = 'space-between';
  labelRow.style.marginBottom = '8px';

  const label = document.createElement('div');
  label.className = 'preview-label';
  label.textContent = 'Preview';
  labelRow.appendChild(label);

  const sizeHint = document.createElement('span');
  sizeHint.className = 'form-hint';
  sizeHint.id = `preview-size-hint-${key}`;
  const cfg0 = workingEvents[key];
  sizeHint.textContent = cfg0 ? `${cfg0.image_area.width} × ${cfg0.image_area.height} px` : '';
  labelRow.appendChild(sizeHint);

  panel.appendChild(labelRow);

  // Wrapper adds padding so the resize handle is always accessible
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.style.display = 'inline-block';

  const container = document.createElement('div');
  container.className = 'preview-image-container';
  container.id = `preview-container-${key}`;
  const initCfg = workingEvents[key];
  if (initCfg) {
    container.style.width = initCfg.image_area.width + 'px';
    container.style.height = initCfg.image_area.height + 'px';
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

  container.appendChild(img);
  container.appendChild(iframe);

  // Resize handle — bottom-right corner drag to resize image area
  const handle = document.createElement('div');
  handle.className = 'preview-resize-handle';
  handle.title = 'Drag to resize';

  let resizing = false;
  let startX = 0, startY = 0, startW = 0, startH = 0;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    resizing = true;
    startX = e.clientX;
    startY = e.clientY;
    const cfg = workingEvents[key];
    startW = cfg ? cfg.image_area.width : parseInt(container.style.width) || 80;
    startH = cfg ? cfg.image_area.height : parseInt(container.style.height) || 80;
  });

  window.addEventListener('mousemove', (e) => {
    if (!resizing) return;
    const newW = Math.max(24, Math.round(startW + (e.clientX - startX)));
    const newH = Math.max(24, Math.round(startH + (e.clientY - startY)));
    container.style.width = newW + 'px';
    container.style.height = newH + 'px';
    const hint = document.getElementById(`preview-size-hint-${key}`);
    if (hint) hint.textContent = `${newW} × ${newH} px`;
    // Sync numeric inputs if open
    const wInput = document.getElementById(`area-w-${key}`) as HTMLInputElement | null;
    const hInput = document.getElementById(`area-h-${key}`) as HTMLInputElement | null;
    if (wInput) wInput.value = String(newW);
    if (hInput) hInput.value = String(newH);
    if (workingEvents[key]) {
      workingEvents[key]!.image_area = { width: newW, height: newH };
    }
  });

  window.addEventListener('mouseup', () => {
    if (resizing) {
      resizing = false;
      void refreshPreview(key);
    }
  });

  wrapper.appendChild(container);
  wrapper.appendChild(handle);
  panel.appendChild(wrapper);
  panel.appendChild(buildHint('Drag the corner handle to resize. This sets the image container size in the notification.'));
  return panel;
}

async function refreshPreview(key: EventKey): Promise<void> {
  const container = document.getElementById(`preview-container-${key}`);
  if (!container) return;
  const cfg = workingEvents[key];
  if (!cfg) return;
  await setPreviewImage(key, cfg.image_path, cfg.frame_interval_ms);
}

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
  imageLabel.textContent = 'Asset Path (Image/Folder/HTML)';
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
  imageGroup.appendChild(buildHint('Select an image, an HTML file, or a folder with numbered images (0.png, 1.png…) for animation.'));
  inner.appendChild(imageGroup);

  // --- Background color ---
  const bgColorGroup = document.createElement('div');
  bgColorGroup.className = 'form-group';

  const bgColorLabel = document.createElement('label');
  bgColorLabel.className = 'form-label';
  bgColorLabel.textContent = 'Image Background Color';
  bgColorGroup.appendChild(bgColorLabel);

  const bgColorRow = document.createElement('div');
  bgColorRow.className = 'path-row';
  bgColorRow.style.alignItems = 'center';
  bgColorRow.style.gap = '10px';

  const bgColorInput = document.createElement('input');
  bgColorInput.type = 'color';
  bgColorInput.className = 'form-color';
  bgColorInput.value = cfg.image_bg_color;
  bgColorInput.addEventListener('input', () => {
    workingEvents[key]!.image_bg_color = bgColorInput.value;
    void refreshPreview(key);
  });

  const bgColorText = document.createElement('input');
  bgColorText.type = 'text';
  bgColorText.className = 'form-input';
  bgColorText.style.width = '100px';
  bgColorText.value = cfg.image_bg_color;
  bgColorText.placeholder = '#000000';
  bgColorText.addEventListener('input', () => {
    const hex = bgColorText.value;
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      bgColorInput.value = hex;
      workingEvents[key]!.image_bg_color = hex;
      void refreshPreview(key);
    }
  });
  bgColorInput.addEventListener('input', () => {
    bgColorText.value = bgColorInput.value;
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
  bgOpacityLabel.textContent = `Image Background Opacity`;
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
    void refreshPreview(key);
  });

  bgOpacityRow.appendChild(bgOpacityRange);
  bgOpacityRow.appendChild(bgOpacityValue);
  bgOpacityGroup.appendChild(bgOpacityRow);
  inner.appendChild(bgOpacityGroup);

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
  fpsGroup.appendChild(buildHint('Minimum 16 ms (~60fps). Used for animated image folders.'));
  inner.appendChild(fpsGroup);

  // --- Image area (numeric inputs — preview also has drag handle) ---
  const areaGroup = document.createElement('div');
  areaGroup.className = 'form-group';

  const areaLabel = document.createElement('label');
  areaLabel.className = 'form-label';
  areaLabel.textContent = 'Image Area Size (px)';
  areaGroup.appendChild(areaLabel);

  const areaRow = document.createElement('div');
  areaRow.className = 'path-row';
  areaRow.style.gap = '8px';
  areaRow.style.alignItems = 'center';

  const makeAreaInput = (id: string, value: number, dim: 'width' | 'height') => {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '6px';
    const lbl = document.createElement('span');
    lbl.className = 'form-hint';
    lbl.textContent = dim === 'width' ? 'W' : 'H';
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.id = id;
    inp.className = 'form-input';
    inp.style.width = '72px';
    inp.min = '24';
    inp.max = '600';
    inp.value = String(value);
    inp.addEventListener('change', () => {
      const v = Math.max(24, Math.min(600, parseInt(inp.value, 10) || 80));
      inp.value = String(v);
      workingEvents[key]!.image_area[dim] = v;
      // Sync preview container size
      const container = document.getElementById(`preview-container-${key}`);
      if (container) container.style[dim === 'width' ? 'width' : 'height'] = v + 'px';
      const hint = document.getElementById(`preview-size-hint-${key}`);
      const other = dim === 'width'
        ? workingEvents[key]!.image_area.height
        : workingEvents[key]!.image_area.width;
      if (hint) hint.textContent = dim === 'width' ? `${v} × ${other} px` : `${other} × ${v} px`;
      void refreshPreview(key);
    });
    wrap.appendChild(lbl);
    wrap.appendChild(inp);
    return wrap;
  };

  areaRow.appendChild(makeAreaInput(`area-w-${key}`, cfg.image_area.width, 'width'));
  areaRow.appendChild(makeAreaInput(`area-h-${key}`, cfg.image_area.height, 'height'));
  areaGroup.appendChild(areaRow);
  areaGroup.appendChild(buildHint('Or drag the corner of the preview below.'));
  inner.appendChild(areaGroup);

  // --- Preview ---
  inner.appendChild(buildPreviewPanel(key));

  // --- Text customization ---
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
  appNameInput.placeholder = 'Claude Code';
  appNameInput.value = cfg.label_app_name ?? '';
  appNameInput.addEventListener('input', () => {
    workingEvents[key]!.label_app_name = appNameInput.value.trim() || null;
  });
  appNameGroup.appendChild(appNameInput);
  textSection.appendChild(appNameGroup);

  // Event display name
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
  evNameInput.placeholder = key; // default = event key e.g. "Stop"
  evNameInput.value = cfg.label_event_name ?? '';
  evNameInput.addEventListener('input', () => {
    workingEvents[key]!.label_event_name = evNameInput.value.trim() || null;
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
  });
  const badgeToggleLabel = document.createElement('span');
  badgeToggleLabel.className = 'form-hint';
  badgeToggleLabel.style.color = 'var(--text-secondary)';
  badgeToggleLabel.textContent = 'Show event badge';
  badgeToggleRow.appendChild(badgeToggle);
  badgeToggleRow.appendChild(badgeToggleLabel);
  textSection.appendChild(badgeToggleRow);

  inner.appendChild(textSection);

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

function buildEventCard(key: EventKey, cfg: EventConfig): HTMLElement {
  const card = document.createElement('div');
  card.className = 'event-card';

  const header = document.createElement('div');
  header.className = 'event-header';

  // Toggle
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
    // Don't expand/collapse when clicking the toggle itself
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

export function renderEvents(config: AppConfig): void {
  // Deep-copy events so we have a mutable working copy
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
    };
    workingEvents[key] = cfg;
    container.appendChild(buildEventCard(key, cfg));
  }
}
