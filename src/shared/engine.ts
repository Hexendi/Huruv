import { Transliterator, parseDictionary, parseRules } from '../engine';
import type { Settings } from './settings';

/** Builds an engine from persisted settings, including custom rules. */
export function createEngineFromSettings(settings: Settings): Transliterator {
  const { rules } = parseRules(settings.customRules);
  const { entries } = parseDictionary(settings.customDictionary);

  return new Transliterator({
    rules,
    dictionary: entries,
    numeric: settings.chatNumbers,
    skipEnglish: settings.skipEnglish,
  });
}
