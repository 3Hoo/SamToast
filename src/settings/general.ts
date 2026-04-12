// General section — port, auto-start, Claude Code hook setup.

import { invoke } from '@tauri-apps/api/core';
import type { AppConfig } from './main';
import { buildToggle, buildHint, showFeedback } from './ui';
import { saveConfig } from './store';

let workingPort: number;
let workingAutoStart: boolean;

export function renderGeneral(config: AppConfig): void {
  workingPort = config.port;
  workingAutoStart = config.auto_start;

  const container = document.getElementById('general-form')!;
  container.innerHTML = '';

  // ---- Port ----
  const portGroup = document.createElement('div');
  portGroup.className = 'form-group';

  const portLabel = document.createElement('label');
  portLabel.className = 'form-label';
  portLabel.textContent = 'HTTP Port';
  portGroup.appendChild(portLabel);

  const portInput = document.createElement('input');
  portInput.type = 'number';
  portInput.className = 'form-input';
  portInput.min = '1';
  portInput.max = '65535';
  portInput.value = String(workingPort);
  portInput.addEventListener('change', () => {
    const v = parseInt(portInput.value, 10);
    if (!isNaN(v) && v >= 1 && v <= 65535) {
      workingPort = v;
    } else {
      portInput.value = String(workingPort);
    }
  });
  portGroup.appendChild(portInput);
  portGroup.appendChild(buildHint('Port the local HTTP server listens on for hook events (1–65535).'));
  container.appendChild(portGroup);

  // ---- Auto-start ----
  const autoRow = document.createElement('div');
  autoRow.className = 'toggle-row';

  const autoText = document.createElement('div');
  const autoTitleEl = document.createElement('div');
  autoTitleEl.className = 'toggle-label';
  autoTitleEl.textContent = 'Launch on Windows startup';
  const autoDescEl = document.createElement('div');
  autoDescEl.className = 'toggle-desc';
  autoDescEl.textContent = 'Registers FunnyToastAlarm in the Windows registry to start with Windows.';
  autoText.appendChild(autoTitleEl);
  autoText.appendChild(autoDescEl);

  const autoToggle = buildToggle(workingAutoStart, (v) => {
    workingAutoStart = v;
  });

  autoRow.appendChild(autoText);
  autoRow.appendChild(autoToggle);
  container.appendChild(autoRow);

  // ---- Save port + auto-start ----
  const saveBar = document.createElement('div');
  saveBar.className = 'save-bar';
  saveBar.style.marginTop = '28px';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = 'Save General Settings';

  const saveFeedback = document.createElement('span');

  saveBtn.addEventListener('click', async () => {
    try {
      // Persist auto-start via dedicated command (writes registry)
      await invoke('set_auto_start', { enabled: workingAutoStart });

      // Persist port + auto_start flag in config file via shared store
      await saveConfig({ port: workingPort, auto_start: workingAutoStart });
      showFeedback(saveFeedback, 'Saved!', 'success');
    } catch (e) {
      showFeedback(saveFeedback, String(e), 'error');
    }
  });

  saveBar.appendChild(saveBtn);
  saveBar.appendChild(saveFeedback);
  container.appendChild(saveBar);

  // ---- Divider ----
  const hr = document.createElement('hr');
  hr.style.cssText = 'border:none;border-top:1px solid var(--border);margin:32px 0;';
  container.appendChild(hr);

  // ---- Claude Code hook setup ----
  const hookSection = document.createElement('div');
  hookSection.className = 'sub-section';

  const hookTitle = document.createElement('div');
  hookTitle.className = 'sub-section-title';
  hookTitle.textContent = 'Claude Code Integration';
  hookSection.appendChild(hookTitle);

  const hookDesc = document.createElement('p');
  hookDesc.style.cssText = 'font-size:13px;color:var(--text-secondary);margin-bottom:16px;line-height:1.6;';
  hookDesc.textContent =
    'Automatically write the required hook entries into your Claude Code settings.json so hook events are forwarded to FunnyToastAlarm.';
  hookSection.appendChild(hookDesc);

  const hookBar = document.createElement('div');
  hookBar.style.display = 'flex';
  hookBar.style.alignItems = 'center';
  hookBar.style.gap = '12px';

  const hookBtn = document.createElement('button');
  hookBtn.className = 'btn btn-secondary';
  hookBtn.textContent = 'Configure Claude Code Hooks';

  const hookFeedback = document.createElement('span');

  hookBtn.addEventListener('click', async () => {
    hookBtn.disabled = true;
    hookFeedback.textContent = '';
    hookFeedback.className = '';
    try {
      await invoke('configure_claude_hooks');
      showFeedback(hookFeedback, 'Hooks configured successfully!', 'success');
    } catch (e) {
      showFeedback(hookFeedback, String(e), 'error');
    } finally {
      hookBtn.disabled = false;
    }
  });

  hookBar.appendChild(hookBtn);
  hookBar.appendChild(hookFeedback);
  hookSection.appendChild(hookBar);
  container.appendChild(hookSection);
}
