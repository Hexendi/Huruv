import { getExtensionApi } from '../shared/api';

export async function findActiveTab(): Promise<chrome.tabs.Tab | null> {
  const api = getExtensionApi();
  if (!api?.tabs || typeof api.tabs.query !== 'function') return null;

  try {
    const tabs = await api.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tabs[0] ?? null;
  } catch {
    return null;
  }
}

export function hostFromUrl(url: string | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}
