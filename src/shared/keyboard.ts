import { getExtensionApi } from './api';
import { hasExtensionStorage } from './storage';

export type KeyboardMode = 'inline' | 'floating';

export const KEYBOARD_MODE_KEY = 'huruv:keyboard:mode' as const;
export const KEYBOARD_MODE_MESSAGE = 'huruv:keyboard:mode' as const;
export const KEYBOARD_OPACITY_KEY = 'huruv:keyboard:opacity' as const;
export const KEYBOARD_OPACITY_MESSAGE = 'huruv:keyboard:opacity' as const;
export const KEYBOARD_INSERT_MESSAGE = 'huruv:insert' as const;
export const DEFAULT_KEYBOARD_MODE: KeyboardMode = 'inline';
export const DEFAULT_KEYBOARD_OPACITY = 0.86;

export function normalizeKeyboardMode(value: unknown): KeyboardMode {
  return value === 'floating' ? 'floating' : DEFAULT_KEYBOARD_MODE;
}

export function normalizeKeyboardOpacity(value: unknown): number {
  const raw =
    typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(raw)) return DEFAULT_KEYBOARD_OPACITY;

  // Accept both 0.86 and 86 so stored values from either format work.
  const normalized = raw > 1 ? raw / 100 : raw;
  return Math.min(1, Math.max(0.35, Math.round(normalized * 100) / 100));
}

export async function loadKeyboardMode(): Promise<KeyboardMode> {
  const api = getExtensionApi();
  if (hasExtensionStorage() && api?.storage?.local) {
    try {
      const result = await api.storage.local.get(KEYBOARD_MODE_KEY);
      return normalizeKeyboardMode(result[KEYBOARD_MODE_KEY]);
    } catch {
      // Fall through to the local-storage fallback.
    }
  }

  try {
    return normalizeKeyboardMode(localStorage.getItem(KEYBOARD_MODE_KEY));
  } catch {
    return DEFAULT_KEYBOARD_MODE;
  }
}

export async function saveKeyboardMode(mode: KeyboardMode): Promise<void> {
  const normalized = normalizeKeyboardMode(mode);
  const api = getExtensionApi();
  if (hasExtensionStorage() && api?.storage?.local) {
    try {
      await api.storage.local.set({ [KEYBOARD_MODE_KEY]: normalized });
      return;
    } catch {
      // Fall through to the local-storage fallback.
    }
  }

  try {
    localStorage.setItem(KEYBOARD_MODE_KEY, normalized);
  } catch {
    // Storage may be unavailable in private contexts.
  }
}

export async function loadKeyboardOpacity(): Promise<number> {
  const api = getExtensionApi();
  if (hasExtensionStorage() && api?.storage?.local) {
    try {
      const result = await api.storage.local.get(KEYBOARD_OPACITY_KEY);
      return normalizeKeyboardOpacity(result[KEYBOARD_OPACITY_KEY]);
    } catch {
      // Fall through to the local-storage fallback.
    }
  }

  try {
    return normalizeKeyboardOpacity(localStorage.getItem(KEYBOARD_OPACITY_KEY));
  } catch {
    return DEFAULT_KEYBOARD_OPACITY;
  }
}

export async function saveKeyboardOpacity(value: number): Promise<void> {
  const normalized = normalizeKeyboardOpacity(value);
  const api = getExtensionApi();
  if (hasExtensionStorage() && api?.storage?.local) {
    try {
      await api.storage.local.set({ [KEYBOARD_OPACITY_KEY]: normalized });
      return;
    } catch {
      // Fall through to the local-storage fallback.
    }
  }

  try {
    localStorage.setItem(KEYBOARD_OPACITY_KEY, String(normalized));
  } catch {
    // Storage may be unavailable in private contexts.
  }
}

/** Listens for keyboard-mode changes from another extension context. */
export function subscribeKeyboardMode(
  callback: (mode: KeyboardMode) => void,
): () => void {
  const api = getExtensionApi();
  if (api?.storage?.onChanged) {
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ): void => {
      if (areaName !== 'local') return;
      const change = changes[KEYBOARD_MODE_KEY];
      if (!change) return;
      callback(normalizeKeyboardMode(change.newValue));
    };
    api.storage.onChanged.addListener(listener);
    return () => api.storage.onChanged.removeListener(listener);
  }

  if (typeof window !== 'undefined') {
    const listener = (event: StorageEvent): void => {
      if (event.key !== KEYBOARD_MODE_KEY) return;
      callback(normalizeKeyboardMode(event.newValue));
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }

  return () => undefined;
}

/** Listens for keyboard-opacity changes from another extension context. */
export function subscribeKeyboardOpacity(
  callback: (opacity: number) => void,
): () => void {
  const api = getExtensionApi();
  if (api?.storage?.onChanged) {
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ): void => {
      if (areaName !== 'local') return;
      const change = changes[KEYBOARD_OPACITY_KEY];
      if (!change) return;
      callback(normalizeKeyboardOpacity(change.newValue));
    };
    api.storage.onChanged.addListener(listener);
    return () => api.storage.onChanged.removeListener(listener);
  }

  if (typeof window !== 'undefined') {
    const listener = (event: StorageEvent): void => {
      if (event.key !== KEYBOARD_OPACITY_KEY) return;
      callback(normalizeKeyboardOpacity(event.newValue));
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }

  return () => undefined;
}
