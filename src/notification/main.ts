import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { setImage, stopAnimation } from './image';

const appWindow = getCurrentWindow();

// Drag the frameless window by clicking anywhere on the toast.
document.getElementById('toast')!.addEventListener('mousedown', (e) => {
  if (e.button === 0) appWindow.startDragging();
});

// Click — focus the associated Claude Code session then close/hide.
document.getElementById('toast')!.addEventListener('click', async () => {
  await invoke('on_notification_click');
});

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
// Event listeners
// ---------------------------------------------------------------------------

// Default config used until Phase 5 populates event_config from the backend.
const DEFAULT_EVENT_CONFIG: EventConfig = {
  image_area: { width: 80, height: 80 },
  image_bg_color: 'transparent',
  image_bg_opacity: 1,
  frame_interval_ms: 100,
};

listen<NotificationShowPayload>('notification-show', (event) => {
  const { event_name, cwd, event_config } = event.payload;
  updateUI(event_name, cwd, event_config ?? DEFAULT_EVENT_CONFIG);
});

listen('notification-closing', () => {
  stopAnimation();
  invoke('on_notification_closing');
});

// ---------------------------------------------------------------------------
// UI update
// ---------------------------------------------------------------------------

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
  container.style.backgroundColor = cfg.image_bg_color;
  container.style.opacity = String(cfg.image_bg_opacity);

  setImage(cfg.image_path, cfg.frame_interval_ms);
}
