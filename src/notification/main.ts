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
  container_offset_x: number;
  container_offset_y: number;
  bg_visible: boolean;
  
  label_app_name: string | null;
  app_name_offset_x: number;
  app_name_offset_y: number;
  app_name_scale: number;

  label_show_cwd: boolean;
  cwd_offset_x: number;
  cwd_offset_y: number;
  cwd_scale: number;

  label_show_event_badge: boolean;
  label_event_name: string | null;
  badge_offset_x: number;
  badge_offset_y: number;
  badge_scale: number;
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
  container_offset_x: 0,
  container_offset_y: 0,
  bg_visible: true,
  
  label_app_name: null,
  app_name_offset_x: 0,
  app_name_offset_y: 0,
  app_name_scale: 1,

  label_show_cwd: true,
  cwd_offset_x: 0,
  cwd_offset_y: 0,
  cwd_scale: 1,

  label_show_event_badge: true,
  label_event_name: null,
  badge_offset_x: 0,
  badge_offset_y: 0,
  badge_scale: 1,
};

function updateUI(event_name: string, cwd: string | undefined, cfg: EventConfig): void {
  // --- Image container size + offset ---
  const container = document.getElementById('image-container')!;
  container.style.width = cfg.image_area.width + 'px';
  container.style.height = cfg.image_area.height + 'px';
  container.style.transform = `translate(${cfg.container_offset_x}px, ${cfg.container_offset_y}px)`;

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
  appNameEl.style.transformOrigin = 'left center';
  appNameEl.style.transform = `translate(${cfg.app_name_offset_x}px, ${cfg.app_name_offset_y}px) scale(${cfg.app_name_scale})`;

  // --- CWD ---
  const cwdEl = document.getElementById('session-cwd')!;
  cwdEl.textContent = cwd ?? '';
  cwdEl.style.display = cfg.label_show_cwd ? '' : 'none';
  cwdEl.style.transformOrigin = 'left center';
  cwdEl.style.transform = `translate(${cfg.cwd_offset_x}px, ${cfg.cwd_offset_y}px) scale(${cfg.cwd_scale})`;

  // --- Event badge ---
  const badgeEl = document.getElementById('event-badge')!;
  badgeEl.textContent = cfg.label_event_name ?? event_name;
  badgeEl.style.display = cfg.label_show_event_badge ? '' : 'none';
  badgeEl.style.transformOrigin = 'left center';
  badgeEl.style.transform = `translate(${cfg.badge_offset_x}px, ${cfg.badge_offset_y}px) scale(${cfg.badge_scale})`;
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
