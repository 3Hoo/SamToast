// Shared config store — single source of truth for the loaded AppConfig.
// All section files should read/write through here to prevent stale-copy divergence.

import { invoke } from '@tauri-apps/api/core';
import type { AppConfig } from './main';

let _config: AppConfig;

export function initStore(config: AppConfig): void {
  _config = config;
}

export function getConfig(): AppConfig {
  return _config;
}

export function updateConfig(partial: Partial<AppConfig>): void {
  _config = { ..._config, ...partial };
}

export async function saveConfig(partial: Partial<AppConfig>): Promise<void> {
  const next = { ..._config, ...partial };
  await invoke('save_config', { config: next });
  _config = next;
}
