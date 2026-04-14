// Settings window entry point.
// Loads config from backend, routes navigation, initialises each section.

import { invoke } from '@tauri-apps/api/core';
import { renderEvents } from './events';
import { renderNotification } from './notification';
import { renderGeneral } from './general';
import { initStore } from './store';

// ---- TypeScript interfaces (mirror Rust AppConfig) ----

export interface ImageArea {
  width: number;
  height: number;
}

export interface EventConfig {
  enabled: boolean;
  sound_path: string | null;
  image_path: string | null;
  image_area: ImageArea;
  image_bg_color: string;
  image_bg_opacity: number;
  frame_interval_ms: number;
  animation_loop: boolean;
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

export type OnClickClose = 'instant' | 'animate';

export interface NotificationConfig {
  timeout_secs: number;
  on_click_focus_session: boolean;
  on_click_close: OnClickClose;
  close_image_path: string | null;
  window_width: number;
  window_height: number;
}

export interface SessionPos {
  window_x: number;
  window_y: number;
}

export interface AppConfig {
  port: number;
  auto_start: boolean;
  notification: NotificationConfig;
  events: Record<string, EventConfig>;
  sessions: Record<string, SessionPos>;
}

// ---- Navigation ----

function initNav(): void {
  const items = document.querySelectorAll<HTMLElement>('.nav-item');
  const sections = document.querySelectorAll<HTMLElement>('.section');

  items.forEach((item) => {
    item.addEventListener('click', () => {
      const target = item.dataset['section'];
      items.forEach((i) => i.classList.remove('active'));
      sections.forEach((s) => s.classList.remove('active'));
      item.classList.add('active');
      const sec = document.getElementById(`section-${target}`);
      if (sec) sec.classList.add('active');
    });
  });
}

// ---- Boot ----

async function main(): Promise<void> {
  const config = await invoke<AppConfig>('get_config');

  // Initialise shared store before rendering any section
  initStore(config);

  // Render each section
  renderEvents(config);
  renderNotification(config);
  renderGeneral(config);

  initNav();
}

main().catch((err: unknown) => {
  console.error('Settings init failed:', err);
});
