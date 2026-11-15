import { getExtensionApi } from '../shared/api';
import {
  KEYBOARD_INSERT_MESSAGE,
  KEYBOARD_MODE_MESSAGE,
  type KeyboardMode,
  saveKeyboardMode,
} from '../shared/keyboard';
import {
  ARABIC_KEYBOARD_DIGITS,
  ARABIC_KEYBOARD_ROWS,
} from '../shared/keyboard-layout';
import { findActiveTab, hostFromUrl } from './tab';

type TextCommand = 'backspace' | 'newline';

function applyTextCommand(
  textarea: HTMLTextAreaElement,
  command: TextCommand,
): void {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  const value = textarea.value;

  if (command === 'backspace') {
    if (start !== end) {
      textarea.value = value.slice(0, start) + value.slice(end);
      textarea.selectionStart = textarea.selectionEnd = start;
    } else if (start > 0) {
      textarea.value = value.slice(0, start - 1) + value.slice(start);
      textarea.selectionStart = textarea.selectionEnd = start - 1;
    }
  } else {
    textarea.value = `${value.slice(0, start)}\n${value.slice(end)}`;
    textarea.selectionStart = textarea.selectionEnd = start + 1;
  }

  textarea.focus();
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function createUtilityButton(
  label: string,
  ariaLabel: string,
  className: string,
  action: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `kbd-key kbd-utility ${className}`;
  button.textContent = label;
  button.setAttribute('aria-label', ariaLabel);
  button.title = ariaLabel;
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', action);
  return button;
}

/**
 * Builds the inline Arabic keyboard in the popup. Kept small and dependency
 * free so it can also serve as the reference for the floating page keyboard.
 */
export function initArabicKeyboard(
  container: HTMLElement,
  textarea: HTMLTextAreaElement,
): void {
  container.replaceChildren();

  const digitRow = document.createElement('div');
  digitRow.className = 'kbd-row';
  for (const digit of ARABIC_KEYBOARD_DIGITS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kbd-key kbd-digit';
    button.dataset.key = digit;
    button.textContent = digit;
    button.setAttribute('aria-label', digit);
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? start;
      textarea.value =
        textarea.value.slice(0, start) + digit + textarea.value.slice(end);
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + digit.length;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    digitRow.append(button);
  }
  container.append(digitRow);

  for (const [rowIndex, row] of ARABIC_KEYBOARD_ROWS.entries()) {
    const rowEl = document.createElement('div');
    rowEl.className = 'kbd-row';

    if (rowIndex === 0) {
      rowEl.append(
        createUtilityButton(
          '⌫',
          'مسح الحرف السابق',
          'kbd-backspace',
          () => applyTextCommand(textarea, 'backspace'),
        ),
      );
    } else if (rowIndex === 1) {
      rowEl.append(
        createUtilityButton('↵', 'إدخال سطر جديد', 'kbd-enter', () =>
          applyTextCommand(textarea, 'newline'),
        ),
      );
    }

    for (const key of row) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'kbd-key';
      button.dataset.key = key;

      if (key === ' ') {
        button.classList.add('kbd-space');
        button.textContent = 'مسافة';
        button.setAttribute('aria-label', 'مسافة');
      } else {
        button.textContent = key;
        button.setAttribute('aria-label', key);
      }

      button.addEventListener('mousedown', (event) => {
        // Keep the textarea selection while the button is pressed.
        event.preventDefault();
      });

      button.addEventListener('click', () => {
        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? start;
        const value = textarea.value;
        textarea.value = value.slice(0, start) + key + value.slice(end);
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + key.length;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      });

      rowEl.append(button);
    }

    container.append(rowEl);
  }
}

async function sendTabMessage<T>(
  tabId: number,
  message: unknown,
): Promise<{ delivered: boolean; response: T | null }> {
  const api = getExtensionApi();
  if (!api?.tabs || typeof api.tabs.sendMessage !== 'function') {
    return { delivered: false, response: null };
  }

  try {
    // Popup actions target the top frame. Broadcasting would let an ad iframe
    // answer first with "not supported" even when the page itself can handle
    // the message.
    const response = (await api.tabs.sendMessage(tabId, message, {
      frameId: 0,
    })) as T;
    return { delivered: true, response: response ?? null };
  } catch {
    return { delivered: false, response: null };
  }
}

export async function insertIntoActiveTab(text: string): Promise<boolean> {
  if (!text) return false;

  const tab = await findActiveTab();
  if (!tab?.id || !hostFromUrl(tab.url)) return false;

  const { response } = await sendTabMessage<{ ok?: boolean }>(tab.id, {
    type: KEYBOARD_INSERT_MESSAGE,
    text,
  });
  return response?.ok === true;
}

export async function setKeyboardModeOnActiveTab(
  mode: KeyboardMode,
): Promise<boolean> {
  const tab = await findActiveTab();
  if (!tab?.id || !hostFromUrl(tab.url)) return false;

  const { delivered } = await sendTabMessage(tab.id, {
    type: KEYBOARD_MODE_MESSAGE,
    mode,
  });
  return delivered;
}

/** Persists the popup preference and asks the current page to update. */
export async function applyKeyboardMode(mode: KeyboardMode): Promise<boolean> {
  await saveKeyboardMode(mode);
  return setKeyboardModeOnActiveTab(mode);
}
