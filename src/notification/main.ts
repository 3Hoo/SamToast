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

// Default config used until Phase 5 populates event_config from the backend.
const DEFAULT_EVENT_CONFIG: EventConfig = {
  image_area: { width: 80, height: 80 },
  image_bg_color: '#000000',
  image_bg_opacity: 0,
  frame_interval_ms: 100,
};

function updateUI(
  event_name: string,
  cwd: string | undefined,
  cfg: EventConfig,
): void {
  document.getElementById('session-cwd')!.textContent = cwd ?? '';
  document.getElementById('event-badge')!.textContent = event_name;

  const container = document.getElementById('image-container')!;
  container.style.width = cfg.image_area.width + 'px';
  container.style.height = cfg.image_area.height + 'px';
  container.style.backgroundColor = hexToRgba(cfg.image_bg_color, cfg.image_bg_opacity);
  container.style.opacity = '';

  setImage(cfg.image_path, cfg.frame_interval_ms);
}

// ---------------------------------------------------------------------------
// Drag + click
//
// startDragging() is called only after the pointer has moved DRAG_THRESHOLD px
// from the mousedown position. This ensures a plain click doesn't get absorbed
// by the drag guard and still invokes on_notification_click.
// ---------------------------------------------------------------------------

const toastEl = document.getElementById('toast')!;
const DRAG_THRESHOLD = 4; // pixels before we consider it a drag
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
// Event listeners (async IIFE for proper unlisten handle management)
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
})();
