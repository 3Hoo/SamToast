// Shared UI helpers used across settings sections.

export function buildToggle(checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const label = document.createElement('label');
  label.className = 'toggle';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));

  const slider = document.createElement('span');
  slider.className = 'toggle-slider';

  label.appendChild(input);
  label.appendChild(slider);
  return label;
}

export function buildHint(text: string): HTMLElement {
  const hint = document.createElement('div');
  hint.className = 'form-hint';
  hint.textContent = text;
  return hint;
}

export function showFeedback(el: HTMLElement, msg: string, type: 'success' | 'error'): void {
  el.textContent = msg;
  el.className = `feedback ${type}`;
  setTimeout(() => { el.textContent = ''; el.className = ''; }, 3000);
}
