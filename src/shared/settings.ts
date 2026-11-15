import type { ConversionMode } from '../engine/types';

export interface Settings {
  enabled: boolean;
  mode: ConversionMode;
  /** Enables Arabizi/chat digits such as 3 → ع and 7 → ح. */
  chatNumbers: boolean;
  skipEnglish: boolean;
  pausedSites: string[];
  customRules: string;
  customDictionary: string;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  mode: 'automatic',
  chatNumbers: true,
  skipEnglish: true,
  pausedSites: [],
  customRules: '',
  customDictionary: '',
};

const MODES: ReadonlySet<ConversionMode> = new Set([
  'automatic',
  'preview',
  'suggestions',
]);

export function isConversionMode(value: unknown): value is ConversionMode {
  return typeof value === 'string' && MODES.has(value as ConversionMode);
}

/** Sanitizes data read from storage. Unknown fields are ignored. */
export function normalizeSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SETTINGS };
  const input = value as Partial<Record<keyof Settings, unknown>> & {
    /** Legacy field kept so existing installs migrate cleanly. */
    numeric?: unknown;
  };

  const pausedSites = Array.isArray(input.pausedSites)
    ? [
        ...new Set(
          input.pausedSites
            .filter((site): site is string => typeof site === 'string')
            .map((site) => site.trim().toLowerCase())
            .filter(Boolean),
        ),
      ]
    : [];

  return {
    enabled:
      typeof input.enabled === 'boolean'
        ? input.enabled
        : DEFAULT_SETTINGS.enabled,
    mode: isConversionMode(input.mode) ? input.mode : DEFAULT_SETTINGS.mode,
    chatNumbers:
      typeof input.chatNumbers === 'boolean'
        ? input.chatNumbers
        : typeof input.numeric === 'boolean'
          ? input.numeric
          : DEFAULT_SETTINGS.chatNumbers,
    skipEnglish:
      typeof input.skipEnglish === 'boolean'
        ? input.skipEnglish
        : DEFAULT_SETTINGS.skipEnglish,
    pausedSites,
    customRules:
      typeof input.customRules === 'string'
        ? input.customRules
        : DEFAULT_SETTINGS.customRules,
    customDictionary:
      typeof input.customDictionary === 'string'
        ? input.customDictionary
        : DEFAULT_SETTINGS.customDictionary,
  };
}

export function isSitePaused(settings: Settings, hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return Boolean(host) && settings.pausedSites.includes(host);
}

export function togglePausedSite(
  settings: Settings,
  hostname: string,
  paused: boolean,
): Settings {
  const host = hostname.trim().toLowerCase();
  if (!host) return settings;
  const withoutHost = settings.pausedSites.filter((site) => site !== host);
  return {
    ...settings,
    pausedSites: paused ? [...withoutHost, host] : withoutHost,
  };
}

export const MODE_COPY: Record<
  ConversionMode,
  { label: string; short: string; description: string }
> = {
  automatic: {
    label: 'Automatic',
    short: 'Insert on word boundary',
    description:
      'Convert each word as soon as you press space or punctuation.',
  },
  preview: {
    label: 'Preview',
    short: 'See it before inserting',
    description:
      'Show a live Arabic preview while typing, then insert on space or punctuation.',
  },
  suggestions: {
    label: 'Suggestions',
    short: 'Choose a spelling',
    description:
      'Offer dictionary spellings while typing. Pick one with Alt+1–6, then continue.',
  },
};
