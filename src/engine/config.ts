import { containsArabic, normalizeLatin } from './text';
import type { DictionaryMap, TransliterationRule } from './types';

export interface ParseRulesResult {
  rules: TransliterationRule[];
  errors: string[];
}

export interface ParseDictionaryResult {
  entries: DictionaryMap;
  errors: string[];
}

const RULE_SEPARATOR_RE = /=>|=|:|→/;
const DICTIONARY_SEPARATOR_RE = /=|:|→/;

function firstSeparator(line: string, re: RegExp): number {
  const match = line.match(re);
  return match?.index ?? -1;
}

/**
 * Parses the settings-page rules format:
 *
 *   ch => ش
 *   sh => ش
 *   3  => ع
 *
 * Blank lines and lines starting with # are ignored. Invalid lines are
 * reported, while valid lines still apply.
 */
export function parseRules(text: string): ParseRulesResult {
  const rules: TransliterationRule[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  text.split(/\r?\n/u).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;

    const separator = firstSeparator(line, RULE_SEPARATOR_RE);
    if (separator < 1) {
      errors.push(`Line ${index + 1}: expected "latin => arabic".`);
      return;
    }

    const from = normalizeLatin(line.slice(0, separator).trim());
    const to = line
      .slice(separator + line.match(RULE_SEPARATOR_RE)?.[0].length!)
      .trim();

    if (!from) {
      errors.push(`Line ${index + 1}: the Latin source is empty.`);
      return;
    }
    if (from.includes(' ')) {
      errors.push(`Line ${index + 1}: rules must target a single sequence, not a phrase.`);
      return;
    }
    if (!to) {
      errors.push(`Line ${index + 1}: the Arabic replacement is empty.`);
      return;
    }
    if (containsArabic(from)) {
      errors.push(`Line ${index + 1}: the source must be Latin or digits.`);
      return;
    }

    if (seen.has(from)) {
      const existing = rules.findIndex((rule) => rule.from === from);
      if (existing >= 0) rules.splice(existing, 1);
    }
    seen.add(from);
    rules.push({ from, to });
  });

  return { rules, errors };
}

/**
 * Parses the settings-page dictionary format:
 *
 *   marhba = مرحبا | مرحباً
 *   sabah el khir = صباح الخير
 *
 * The first spelling is preferred. Additional spellings are shown as
 * suggestions.
 */
export function parseDictionary(text: string): ParseDictionaryResult {
  const entries: DictionaryMap = {};
  const errors: string[] = [];

  text.split(/\r?\n/u).forEach((rawLine, lineIndex) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;

    const separator = firstSeparator(line, DICTIONARY_SEPARATOR_RE);
    if (separator < 1) {
      errors.push(`Line ${lineIndex + 1}: expected "latin = arabic".`);
      return;
    }

    const separatorText = line.match(DICTIONARY_SEPARATOR_RE)?.[0] ?? '=';
    const key = normalizeLatin(line.slice(0, separator).trim());
    const rawSpellings = line
      .slice(separator + separatorText.length)
      .trim()
      .split('|');

    if (!key) {
      errors.push(`Line ${lineIndex + 1}: the Latin key is empty.`);
      return;
    }
    if (!/^[\p{Script=Latin}0-9'’‘ ]+$/u.test(key)) {
      errors.push(
        `Line ${lineIndex + 1}: keys may contain Latin letters, digits and single spaces only.`,
      );
      return;
    }

    const spellings: string[] = [];
    let hadInvalidSpelling = false;
    for (const rawSpelling of rawSpellings) {
      const spelling = rawSpelling.trim();
      if (!spelling) continue;
      if (!containsArabic(spelling)) {
        hadInvalidSpelling = true;
        errors.push(
          `Line ${lineIndex + 1}: "${spelling}" does not contain Arabic letters.`,
        );
        continue;
      }
      spellings.push(spelling);
    }

    if (!spellings.length) {
      if (!hadInvalidSpelling) {
        errors.push(`Line ${lineIndex + 1}: no Arabic spelling was provided.`);
      }
      return;
    }

    const existing = entries[key] ?? [];
    entries[key] = [...new Set([...spellings, ...existing])];
  });

  return { entries, errors };
}

/** Formats a dictionary entry for the settings textarea. */
export function formatDictionaryExample(): string {
  return [
    '# Add your own words and preferred spellings.',
    '# The first spelling is used; others become suggestions.',
    'marhba = مرحبا | مرحباً',
    'sabah el khir = صباح الخير',
  ].join('\n');
}

/** Formats a rules example for the settings textarea. */
export function formatRulesExample(): string {
  return [
    '# One rule per line. Longer matches win.',
    'ch => ش',
    'kh => خ',
    '7 => ح',
  ].join('\n');
}
