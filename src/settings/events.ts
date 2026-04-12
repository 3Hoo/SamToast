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

  const label = document.createElement('div');
  label.className = 'preview-label';
  label.textContent = 'Image Preview';
  panel.appendChild(label);

  const container = document.createElement('div');
  container.className = 'preview-image-container';
  container.id = `preview-container-${key}`;

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
  panel.appendChild(container);
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

  // --- Preview ---
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
