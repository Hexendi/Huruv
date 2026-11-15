/**
 * Cross-browser extension API access.
 *
 * Firefox exposes both `browser` (Promise-based) and `chrome` (callback-based
 * in older versions). Chrome exposes only `chrome`. Always prefer `browser`
 * when present so one code path works across the supported browser range.
 */
type ExtensionApi = typeof chrome;

interface ExtensionGlobals {
  browser?: ExtensionApi;
  chrome?: ExtensionApi;
}

export function getExtensionApi(): ExtensionApi | null {
  if (typeof globalThis === 'undefined') return null;
  const globals = globalThis as unknown as ExtensionGlobals;
  return globals.browser ?? globals.chrome ?? null;
}

export function hasExtensionApi(): boolean {
  return getExtensionApi() !== null;
}

export function extensionUrl(path: string): string {
  try {
    return getExtensionApi()?.runtime?.getURL(path) ?? '';
  } catch {
    return '';
  }
}
