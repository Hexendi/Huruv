import type { Settings } from './settings';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings';
import { getExtensionApi } from './api';

const STORAGE_KEY = 'arabictype.settings.v1';

export function hasExtensionStorage(): boolean {
  const api = getExtensionApi();
  return Boolean(api?.storage?.local);
}

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export async function loadSettings(): Promise<Settings> {
  const api = getExtensionApi();
  if (api?.storage?.local) {
    try {
      const result = await api.storage.local.get(STORAGE_KEY);
      return normalizeSettings(result[STORAGE_KEY]);
    } catch {
      // Fall through to the browser-storage fallback below.
    }
  }

  if (hasLocalStorage()) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return normalizeSettings(raw ? JSON.parse(raw) : undefined);
    } catch {
      // Ignore malformed or inaccessible storage.
    }
  }

  return { ...DEFAULT_SETTINGS };
}

export async function saveSettings(settings: Settings): Promise<void> {
  const normalized = normalizeSettings(settings);
  const api = getExtensionApi();
  if (api?.storage?.local) {
    try {
      await api.storage.local.set({ [STORAGE_KEY]: normalized });
      return;
    } catch {
      // Fall through to localStorage so the popup still works in a browser tab.
    }
  }

  if (hasLocalStorage()) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Storage may be unavailable in private/opaque contexts.
    }
  }
}

/**
 * Subscribes to settings changes from other extension contexts. Returns an
 * unsubscribe function. The callback is never called for malformed values.
 */
export function subscribeSettings(
  callback: (settings: Settings) => void,
): () => void {
  const api = getExtensionApi();
  if (api?.storage?.onChanged) {
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ): void => {
      if (areaName !== 'local') return;
      const change = changes[STORAGE_KEY];
      if (!change) return;
      callback(normalizeSettings(change.newValue));
    };
    api.storage.onChanged.addListener(listener);
    return () => api.storage.onChanged.removeListener(listener);
  }

  if (typeof window !== 'undefined') {
    const listener = (event: StorageEvent): void => {
      if (event.key !== STORAGE_KEY) return;
      if (!event.newValue) return;
      try {
        callback(normalizeSettings(JSON.parse(event.newValue)));
      } catch {
        // Ignore malformed cross-tab values.
      }
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }

  return () => undefined;
}
