import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  isSitePaused,
  normalizeSettings,
  togglePausedSite,
} from '../src/shared/settings';
import { createEngineFromSettings } from '../src/shared/engine';

describe('settings normalization', () => {
  it('returns defaults for missing or malformed data', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ enabled: 'yes', mode: 'fast' })).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it('preserves valid values and sanitizes paused sites', () => {
    const settings = normalizeSettings({
      enabled: false,
      mode: 'suggestions',
      chatNumbers: false,
      skipEnglish: false,
      pausedSites: ['Example.com', ' example.com ', '', 4, 'test.org'],
      customRules: 'ch => ش',
      customDictionary: 'salam = سلام',
    });

    expect(settings.enabled).toBe(false);
    expect(settings.mode).toBe('suggestions');
    expect(settings.chatNumbers).toBe(false);
    expect(settings.skipEnglish).toBe(false);
    expect(settings.pausedSites).toEqual(['example.com', 'test.org']);
    expect(settings.customRules).toBe('ch => ش');
  });
});

describe('site exceptions', () => {
  it('matches hostnames case-insensitively', () => {
    const settings = normalizeSettings({
      pausedSites: ['Example.com'],
    });
    expect(isSitePaused(settings, 'EXAMPLE.COM')).toBe(true);
    expect(isSitePaused(settings, 'example.org')).toBe(false);
  });

  it('adds and removes paused sites without duplicates', () => {
    const paused = togglePausedSite(DEFAULT_SETTINGS, 'example.com', true);
    expect(paused.pausedSites).toEqual(['example.com']);

    const repeated = togglePausedSite(paused, 'EXAMPLE.COM', true);
    expect(repeated.pausedSites).toEqual(['example.com']);

    const resumed = togglePausedSite(paused, 'example.com', false);
    expect(resumed.pausedSites).toEqual([]);
  });
});

describe('engine settings integration', () => {
  it('applies custom rules and dictionary entries', () => {
    const engine = createEngineFromSettings(
      normalizeSettings({
        customRules: 'sh => ص',
        customDictionary: 'salam = سَلَام | سلام',
      }),
    );

    expect(engine.transliterateWord('shab')).toBe('صاب');
    const candidates = engine
      .evaluate('salam')
      .candidates.map((candidate) => candidate.arabic);
    expect(candidates[0]).toBe('سَلَام');
    expect(candidates).toContain('سلام');
  });

  it('honors chat number and English passthrough settings', () => {
    const engine = createEngineFromSettings(
      normalizeSettings({ chatNumbers: false, skipEnglish: false }),
    );

    expect(engine.transliterateText('3la')).toBe('3la');
    expect(engine.evaluate('the').convertible).toBe(true);
  });

  it('migrates the legacy numeric setting', () => {
    expect(normalizeSettings({ numeric: false }).chatNumbers).toBe(false);
    expect(normalizeSettings({ numeric: true }).chatNumbers).toBe(true);
  });
});
