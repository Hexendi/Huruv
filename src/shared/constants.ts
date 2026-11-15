import { getExtensionApi } from './api';

export const APP_NAME = 'Huruv';
export const VERSION = '0.1.0';
export const REPO_URL = 'https://github.com/Hexendi/Huruv';
export const LICENSE = 'MIT';

export function isExtensionContext(): boolean {
  const api = getExtensionApi();
  return Boolean(api?.runtime?.id);
}

export function openExternal(url: string): void {
  const api = getExtensionApi();
  if (isExtensionContext() && api?.tabs?.create) {
    try {
      const result = api.tabs.create({ url });
      if (result && typeof result.catch === 'function') {
        void result.catch(() => {
          window.open(url, '_blank', 'noopener');
        });
      }
      return;
    } catch {
      // Fall through to window.open below.
    }
  }
  window.open(url, '_blank', 'noopener');
}
