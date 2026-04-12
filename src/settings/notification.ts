// Notification section — timeout, click behaviour, close behaviour.

import { open } from '@tauri-apps/plugin-dialog';
import type { AppConfig, NotificationConfig, OnClickClose } from './main';
import { buildToggle, buildHint, showFeedback } from './ui';
import { saveConfig } from './store';

let working: NotificationConfig;

export function renderNotification(config: AppConfig): void {
  working = JSON.parse(JSON.stringify(config.notification)) as NotificationConfig;

  const container = document.getElementById('notification-form')!;
  container.innerHTML = '';

  // ---- Timeout ----
  const timeoutGroup = document.createElement('div');
  timeoutGroup.className = 'form-group';

  const timeoutLabel = document.createElement('label');
  timeoutLabel.className = 'form-label';
  timeoutLabel.textContent = 'Timeout (seconds)';
  timeoutGroup.appendChild(timeoutLabel);

  const timeoutInput = document.createElement('input');
  timeoutInput.type = 'number';
  timeoutInput.className = 'form-input';
  timeoutInput.min = '0';
  timeoutInput.max = '3600';
  timeoutInput.value = String(working.timeout_secs);
  timeoutInput.addEventListener('change', () => {
    const v = parseInt(timeoutInput.value, 10);
    working.timeout_secs = isNaN(v) ? 0 : Math.max(0, v);
    timeoutInput.value = String(working.timeout_secs);
  });
  timeoutGroup.appendChild(timeoutInput);
  timeoutGroup.appendChild(buildHint('0 = never hide automatically.'));
  container.appendChild(timeoutGroup);

  // ---- Click: focus session ----
  const focusRow = document.createElement('div');
  focusRow.className = 'toggle-row';

  const focusText = document.createElement('div');
  const focusTitleEl = document.createElement('div');
  focusTitleEl.className = 'toggle-label';
  focusTitleEl.textContent = 'Focus session on click';
  const focusDescEl = document.createElement('div');
  focusDescEl.className = 'toggle-desc';
  focusDescEl.textContent = 'Bring the Claude Code terminal window to front when the notification is clicked.';
  focusText.appendChild(focusTitleEl);
  focusText.appendChild(focusDescEl);

  const focusToggle = buildToggle(working.on_click_focus_session, (v) => {
    working.on_click_focus_session = v;
  });

  focusRow.appendChild(focusText);
  focusRow.appendChild(focusToggle);
  container.appendChild(focusRow);

  // ---- Click: close behaviour ----
  const closeGroup = document.createElement('div');
  closeGroup.className = 'form-group';
  closeGroup.style.marginTop = '20px';

  const closeLabel = document.createElement('label');
  closeLabel.className = 'form-label';
  closeLabel.textContent = 'Close behaviour on click';
  closeGroup.appendChild(closeLabel);

  const closeSelect = document.createElement('select');
  closeSelect.className = 'form-select';

  const opts: { value: OnClickClose; label: string }[] = [
    { value: 'instant', label: 'Close immediately' },
    { value: 'animate', label: 'Play close animation then close' },
  ];
  opts.forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    opt.selected = working.on_click_close === value;
    closeSelect.appendChild(opt);
  });

  closeSelect.addEventListener('change', () => {
    working.on_click_close = closeSelect.value as OnClickClose;
    closeImageGroup.style.display = working.on_click_close === 'animate' ? 'block' : 'none';
  });
  closeGroup.appendChild(closeSelect);
  container.appendChild(closeGroup);

  // ---- Close animation image path (only shown when animate is selected) ----
  const closeImageGroup = document.createElement('div');
  closeImageGroup.className = 'form-group';
  closeImageGroup.style.display = working.on_click_close === 'animate' ? 'block' : 'none';

  const closeImageLabel = document.createElement('label');
  closeImageLabel.className = 'form-label';
  closeImageLabel.textContent = 'Close Animation Asset Path';
  closeImageGroup.appendChild(closeImageLabel);

  const closeImageRow = document.createElement('div');
  closeImageRow.className = 'path-row';

  const closeImageInput = document.createElement('input');
  closeImageInput.type = 'text';
  closeImageInput.className = 'form-input';
  closeImageInput.placeholder = 'Path to image, HTML, or animation folder';
  closeImageInput.value = working.close_image_path ?? '';
  closeImageInput.addEventListener('input', () => {
    working.close_image_path = closeImageInput.value.trim() || null;
  });

  const browseFileBtn = document.createElement('button');
  browseFileBtn.className = 'btn btn-secondary btn-sm';
  browseFileBtn.textContent = 'File';
  browseFileBtn.addEventListener('click', async () => {
    const result = await open({
      directory: false,
      multiple: false,
      filters: [{ name: 'Asset', extensions: ['png', 'jpg', 'gif', 'webp', 'html', 'htm'] }],
    });
    const path = typeof result === 'string' ? result : Array.isArray(result) ? result[0] ?? null : null;
    if (path) {
      closeImageInput.value = path;
      working.close_image_path = path;
    }
  });

  const browseDirBtn = document.createElement('button');
  browseDirBtn.className = 'btn btn-secondary btn-sm';
  browseDirBtn.textContent = 'Folder';
  browseDirBtn.addEventListener('click', async () => {
    const result = await open({ directory: true, multiple: false });
    const path = typeof result === 'string' ? result : Array.isArray(result) ? result[0] ?? null : null;
    if (path) {
      closeImageInput.value = path;
      working.close_image_path = path;
    }
  });

  closeImageRow.appendChild(closeImageInput);
  closeImageRow.appendChild(browseFileBtn);
  closeImageRow.appendChild(browseDirBtn);
  closeImageGroup.appendChild(closeImageRow);
  closeImageGroup.appendChild(buildHint('Image, HTML file, or folder with 0.png, 1.png… that plays before closing.'));
  container.appendChild(closeImageGroup);

  // ---- Save ----
  const saveBar = document.createElement('div');
  saveBar.className = 'save-bar';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = 'Save Notification Settings';

  const feedback = document.createElement('span');

  saveBtn.addEventListener('click', async () => {
    try {
      await saveConfig({ notification: { ...working } });
      showFeedback(feedback, 'Saved!', 'success');
    } catch (e) {
      showFeedback(feedback, String(e), 'error');
    }
  });

  saveBar.appendChild(saveBtn);
  saveBar.appendChild(feedback);
  container.appendChild(saveBar);
}
