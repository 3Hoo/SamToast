import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { setImage, stopAnimation } from './image';

const appWindow = getCurrentWindow();

// ---------------------------------------------------------------------------
// Backend event payloads
// ---------------------------------------------------------------------------

interface EventConfig {
  image_path?: string;
  image_area: { width: number; height: number };
  image_bg_color: string;
  image_bg_opacity: number;
  frame_interval_ms: number;
  image_offset_x: number;
  image_offset_y: number;
  image_scale: number;
  bg_visible: boolean;
  label_app_name: string | null;
  label_show_cwd: boolean;
  label_show_event_badge: boolean;
  label_event_name: string | null;
}

interface NotificationShowPayload {
  session_id: string;
  event_name: string;
  cwd?: string;
  event_config: EventConfig;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// ---------------------------------------------------------------------------
// UI update
// ---------------------------------------------------------------------------

const DEFAULT_EVENT_CONFIG: EventConfig = {
  image_area: { width: 64, height: 64 },
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

function updateUI(event_name: string, cwd: string | undefined, cfg: EventConfig): void {
  // --- Image container size ---
  const container = document.getElementById('image-container')!;
  container.style.width = cfg.image_area.width + 'px';
  container.style.height = cfg.image_area.height + 'px';

  // --- Image transform: offset + scale (applied to img and iframe) ---
  const transform = `translate(${cfg.image_offset_x}px, ${cfg.image_offset_y}px) scale(${cfg.image_scale})`;
  const imgEl = document.getElementById('toast-image') as HTMLImageElement;
  const iframeEl = document.getElementById('toast-iframe') as HTMLIFrameElement;
  imgEl.style.transform = transform;
  iframeEl.style.transform = transform;

  setImage(cfg.image_path, cfg.frame_interval_ms);

  // --- Toast card background ---
  const toastCard = document.getElementById('toast')!;
  if (!cfg.bg_visible) {
    // Fully transparent — no glassmorphism, no shadow, no border
    toastCard.style.background = 'transparent';
    toastCard.style.boxShadow = 'none';
    toastCard.style.backdropFilter = 'none';
    (toastCard.style as CSSStyleDeclaration & { webkitBackdropFilter: string }).webkitBackdropFilter = 'none';
    toastCard.style.border = 'none';
  } else if (cfg.image_bg_opacity > 0) {
    // Solid color override
    toastCard.style.background = hexToRgba(cfg.image_bg_color, cfg.image_bg_opacity);
    toastCard.style.boxShadow = '';
    toastCard.style.backdropFilter = '';
    (toastCard.style as CSSStyleDeclaration & { webkitBackdropFilter: string }).webkitBackdropFilter = '';
    toastCard.style.border = '';
  } else {
    // Default glassmorphism (restore CSS)
    toastCard.style.background = '';
    toastCard.style.boxShadow = '';
    toastCard.style.backdropFilter = '';
    (toastCard.style as CSSStyleDeclaration & { webkitBackdropFilter: string }).webkitBackdropFilter = '';
    toastCard.style.border = '';
  }

  // --- App name: empty/null = hidden ---
  const appNameEl = document.getElementById('app-name')!;
  const name = cfg.label_app_name ?? '';
  appNameEl.textContent = name;
  appNameEl.style.display = name ? '' : 'none';

  // --- CWD ---
  const cwdEl = document.getElementById('session-cwd')!;
  cwdEl.textContent = cwd ?? '';
  cwdEl.style.display = cfg.label_show_cwd ? '' : 'none';

  // --- Event badge ---
  const badgeEl = document.getElementById('event-badge')!;
  badgeEl.textContent = cfg.label_event_name ?? event_name;
  badgeEl.style.display = cfg.label_show_event_badge ? '' : 'none';
}

// ---------------------------------------------------------------------------
// Drag + click
// ---------------------------------------------------------------------------

const toastEl = document.getElementById('toast')!;
const DRAG_THRESHOLD = 4;
let mouseDownPos = { x: 0, y: 0 };
let isDragging = false;

toastEl.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    mouseDownPos = { x: e.clientX, y: e.clientY };
    isDragging = false;
  }
});

toastEl.addEventListener('mousemove', (e) => {
  if (e.buttons !== 1 || isDragging) return;
  const dx = e.clientX - mouseDownPos.x;
  const dy = e.clientY - mouseDownPos.y;
  if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
    isDragging = true;
    void appWindow.startDragging();
  }
});

toastEl.addEventListener('click', async () => {
  if (isDragging) { isDragging = false; return; }
  await invoke('on_notification_click');
});

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

(async () => {
  const unlistenShow = await listen<NotificationShowPayload>('notification-show', (event) => {
    const { event_name, cwd, event_config } = event.payload;
    updateUI(event_name, cwd, event_config ?? DEFAULT_EVENT_CONFIG);
  });

  const unlistenClosing = await listen('notification-closing', async () => {
    stopAnimation();
    unlistenShow();
    unlistenClosing();
    await invoke('on_notification_closing');
  });

  await appWindow.emit('notification-ready');
})();
