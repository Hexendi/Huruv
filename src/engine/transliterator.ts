import builtInDictionary from './data/dictionary.json';
import darijaDataset from './data/darija-dataset.json';
import {
  BUILTIN_RULES,
  ENGLISH_SKIP_WORDS,
  NUMERIC_RULES,
  VOWELS,
} from './rules';
import {
  containsArabic,
  containsLatinLetter,
  getWordBeforeCaret,
  looksTransliterable,
  normalizeLatin,
  tokenize,
} from './text';
import type {
  Candidate,
  EngineOptions,
  Evaluation,
  SkipReason,
  TransliterationRule,
} from './types';

interface RuleEntry {
  source: string;
  arabic: string;
}

interface LiteralUnit {
  kind: 'literal';
  arabic: string;
  source: string;
}

interface VowelUnit {
  kind: 'vowel';
  source: string;
}

type Unit = LiteralUnit | VowelUnit;

const LONG_VOWEL: Record<string, string> = {
  a: 'ا',
  i: 'ي',
  u: 'و',
  o: 'و',
  e: '',
};

const INITIAL_VOWEL: Record<string, string> = {
  a: 'أ',
  i: 'إ',
  u: 'أ',
  o: 'أ',
  e: '',
};

const ARABIC_LETTER_RE = /[\u0621-\u064a\u0671-\u06d3]/u;
const NON_ARABIC_OUTPUT_RE = /[\p{Script=Latin}0-9]/u;
const DIGIT_CONVENTION_RE = /[2-9]/;
const STRONG_TRANSLITERATION_RE = /[2-9'’‘]/u;
const ARTICLE_WORDS = new Set(['al', 'el', '2l']);
const PHRASE_HOLD_STARTERS = new Set([
  'sabah',
  'masa',
  'insha',
  'incha',
  'el',
  'al',
  '2l',
  'kifach',
  'labas',
]);

/**
 * Alternates used only to generate ranked candidates. The first spelling in
 * BUILTIN_RULES stays the preferred one; these never change the default
 * conversion, they just give the search layer more plausible readings.
 */
const AMBIGUOUS_LETTERS: Record<string, string[]> = {
  g: ['غ', 'گ', 'ج'],
  '2': ['أ', 'ا', 'ء'],
  "'": ['ع', 'ء'],
  h: ['ه', 'ح'],
  s: ['س', 'ص'],
  t: ['ت', 'ط'],
  d: ['د', 'ض'],
  z: ['ز', 'ظ'],
};

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/**
 * The standalone transliteration engine. It has no browser dependencies and
 * can be reused by the extension or any other UI.
 */
export class Transliterator {
  private readonly dictionary = new Map<string, string[]>();
  private readonly rules: RuleEntry[];
  private readonly skipWords = new Set<string>();
  private readonly numeric: boolean;
  private readonly skipEnglish: boolean;
  private readonly maxAlternatives: number;
  private readonly maxPhraseWords: number;

  constructor(options: EngineOptions = {}) {
    this.numeric = options.numeric ?? true;
    this.skipEnglish = options.skipEnglish ?? true;
    this.maxAlternatives = Math.max(1, options.maxAlternatives ?? 6);

    for (const [key, spellings] of Object.entries(builtInDictionary)) {
      const normalized = normalizeLatin(key);
      if (!normalized || !Array.isArray(spellings)) continue;
      this.dictionary.set(normalized, dedupe(spellings));
    }

    // The Darija regression corpus teaches the engine the project's spelling
    // conventions. These entries take precedence over generic fallback rules.
    for (const entry of darijaDataset.phrases) {
      this.prependDictionary(entry.latin, [entry.arabic]);
    }
    for (const [key, spellings] of Object.entries(darijaDataset.words)) {
      this.prependDictionary(key, spellings);
    }

    if (options.dictionary) {
      for (const [key, spellings] of Object.entries(options.dictionary)) {
        const normalized = normalizeLatin(key);
        if (!normalized || !Array.isArray(spellings)) continue;
        const existing = this.dictionary.get(normalized) ?? [];
        this.dictionary.set(normalized, dedupe([...spellings, ...existing]));
      }
    }

    const mergedRules = new Map<string, string>();
    const addRule = (rule: TransliterationRule): void => {
      const source = normalizeLatin(rule.from);
      if (!source || source.includes(' ')) return;
      mergedRules.set(source, rule.to);
    };

    for (const rule of BUILTIN_RULES) addRule(rule);
    if (this.numeric) {
      for (const rule of NUMERIC_RULES) addRule(rule);
    }
    for (const rule of options.rules ?? []) addRule(rule);

    this.rules = [...mergedRules.entries()]
      .map(([source, arabic]) => ({ source, arabic }))
      .sort((a, b) => b.source.length - a.source.length);

    this.maxPhraseWords = Math.max(
      1,
      ...[...this.dictionary.keys()].map((key) => key.split(' ').length),
    );

    for (const word of ENGLISH_SKIP_WORDS) {
      this.skipWords.add(normalizeLatin(word));
    }
    for (const word of options.skipWords ?? []) {
      this.skipWords.add(normalizeLatin(word));
    }
  }

  /** Number of dictionary entries, including multi-word phrases. */
  get dictionarySize(): number {
    return this.dictionary.size;
  }

  private prependDictionary(key: string, spellings: string[]): void {
    const normalized = normalizeLatin(key);
    if (!normalized || !Array.isArray(spellings)) return;
    const existing = this.dictionary.get(normalized) ?? [];
    this.dictionary.set(normalized, dedupe([...spellings, ...existing]));
  }

  /** Number of active rules, including digit rules when enabled. */
  get ruleCount(): number {
    return this.rules.length;
  }

  /**
   * True when the text is the beginning of a longer dictionary phrase.
   * The content script uses this to wait briefly for phrases such as
   * "sabah el khir" before committing "sabah" on its own.
   */
  hasPhrasePrefix(text: string): boolean {
    const normalized = normalizeLatin(text);
    if (!normalized) return false;
    if (!this.numeric && DIGIT_CONVENTION_RE.test(normalized)) return false;

    for (const key of this.dictionary.keys()) {
      if (
        key.length > normalized.length &&
        key.startsWith(`${normalized} `) &&
        this.isDictionaryEntryUsable(key)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Whether a complete word should briefly wait for a longer dictionary
   * phrase. We only defer common phrase starters ("sabah", "masa", "el", …).
   * Deferring every phrase prefix would make very common standalone words
   * such as "salam" feel laggy.
   */
  shouldWaitForPhrase(text: string): boolean {
    const normalized = normalizeLatin(text);
    if (!normalized || !this.hasPhrasePrefix(normalized)) return false;
    const words = normalized.split(' ');
    if (words.length > 1) return true;
    return PHRASE_HOLD_STARTERS.has(normalized);
  }

  /**
   * Returns true when a Latin run reads like ordinary English prose. Used by
   * the live editor to avoid converting an unknown final word when the words
   * before it are clearly English ("hello world").
   */
  isLikelyEnglishContext(text: string, lastWord: string): boolean {
    const normalizedLast = normalizeLatin(lastWord);
    if (!normalizedLast) return false;
    if (this.dictionary.get(normalizedLast)?.length) return false;
    if (DIGIT_CONVENTION_RE.test(normalizedLast)) return false;
    if (/['’‘]/u.test(normalizedLast)) return false;

    const words = normalizeLatin(text).split(' ').filter(Boolean);
    if (words.length < 2) return false;
    return words
      .slice(0, -1)
      .some((word) => this.skipWords.has(normalizeLatin(word)));
  }

  /**
   * Dictionary-only phrase lookup. Useful for a completion UI that should not
   * fall back to phonetic output for a partial multi-word phrase.
   */
  lookupPhrase(phrase: string): Candidate[] {
    const normalized = normalizeLatin(phrase);
    if (!normalized.includes(' ')) return [];
    if (!this.isDictionaryEntryUsable(normalized)) return [];
    const spellings = this.dictionary.get(normalized);
    if (!spellings?.length) return [];
    return spellings.map((arabic) => ({ arabic, source: 'dictionary' }));
  }

  /**
   * Evaluates a word or a known phrase. The first candidate is the preferred
   * spelling. It never throws on odd input; unsupported input is reported with
   * a skip reason instead.
   */
  evaluate(input: string): Evaluation {
    const source = input.trim();
    const normalized = normalizeLatin(input);

    if (!normalized) {
      return this.skipped(source, normalized, 'empty');
    }

    if (!this.numeric && DIGIT_CONVENTION_RE.test(normalized)) {
      return this.skipped(source, normalized, 'numeric-disabled');
    }

    const dictionarySpellings = this.dictionary.get(normalized);
    if (dictionarySpellings?.length) {
      const candidates: Candidate[] = dictionarySpellings.map((arabic) => ({
        arabic,
        source: 'dictionary',
      }));
      const phonetic = normalized.includes(' ')
        ? this.fallbackPhrase(normalized)
        : this.fallbackWord(normalized);
      if (phonetic && !candidates.some((candidate) => candidate.arabic === phonetic)) {
        candidates.push({ arabic: phonetic, source: 'rules' });
      }
      const limited = candidates.slice(0, this.maxAlternatives);
      const first = limited[0];
      if (first) {
        return {
          source,
          normalized,
          candidates: limited,
          arabic: first.arabic,
          known: true,
          convertible: true,
        };
      }
    }

    if (
      this.skipEnglish &&
      !DIGIT_CONVENTION_RE.test(normalized) &&
      this.isEnglish(normalized)
    ) {
      return this.skipped(source, normalized, 'english');
    }

    if (!this.isConvertibleSource(normalized)) {
      return this.skipped(source, normalized, 'untransliterable');
    }

    const variants = this.transliterationCandidates(normalized);
    const fallback = variants[0];

    if (!fallback) {
      return this.skipped(source, normalized, 'untransliterable');
    }

    return {
      source,
      normalized,
      candidates: variants.map((arabic) => ({
        arabic,
        source: 'rules' as const,
      })),
      arabic: fallback,
      known: false,
      convertible: true,
    };
  }

  /**
   * Returns every plausible Arabic spelling for a Latin word, ordered with
   * the preferred (most conventional) spelling first.
   *
   * This is the API search integrations should use. A single input can be
   * ambiguous (`g` may be غ or ج, `2` may be أ/ا/ء, `h` may be ه/ح), so the
   * search layer ranks these candidates against the actual indexed text
   * instead of blindly accepting the first one.
   */
  transliterationCandidates(input: string): string[] {
    const normalized = normalizeLatin(input);
    const candidates = new Set<string>();
    if (!normalized) return [];

    for (const spelling of this.dictionary.get(normalized) ?? []) {
      candidates.add(spelling);
    }

    if (normalized.includes(' ')) {
      const phrase = this.fallbackPhrase(normalized);
      if (phrase) candidates.add(phrase);
      return [...candidates].slice(0, this.maxAlternatives);
    }

    if (!this.isConvertibleSource(normalized)) {
      return [...candidates].slice(0, this.maxAlternatives);
    }

    const article = this.splitArticle(normalized);
    const stem = article ? article.rest : normalized;
    const units = this.segment(stem);
    if (!units) return [...candidates].slice(0, this.maxAlternatives);

    const addVariant = (
      variantUnits: Unit[],
      skippedAlif: ReadonlySet<number> = new Set<number>(),
    ): void => {
      if (candidates.size >= this.maxAlternatives) return;
      const rendered = this.renderUnits(variantUnits, skippedAlif);
      if (!rendered) return;
      const assembled = (article ? 'ال' : '') + rendered;
      const validated = this.validateAssembled(assembled, normalized);
      if (validated) candidates.add(validated);
    };

    // Primary reading: a is long alif.
    addVariant(units);

    // Alternative reading: one or more a vowels are short and unwritten.
    const alifPositions: number[] = [];
    for (let index = 0; index < units.length; index += 1) {
      const unit = units[index];
      if (unit?.kind === 'vowel' && unit.source === 'a') {
        alifPositions.push(index);
        if (alifPositions.length >= 4) break;
      }
    }
    for (const position of alifPositions) {
      addVariant(units, new Set([position]));
    }
    if (alifPositions.length > 1) {
      addVariant(units, new Set(alifPositions));
    }

    // Alternative readings for ambiguous consonants (g/gh, h, s, t, d, z…).
    let substitutions = 0;
    for (let index = 0; index < units.length && substitutions < 4; index += 1) {
      const unit = units[index];
      if (!unit || unit.kind !== 'literal') continue;
      for (const alternative of AMBIGUOUS_LETTERS[unit.source] ?? []) {
        if (alternative === unit.arabic) continue;
        const copy = units.slice();
        copy[index] = { ...unit, arabic: alternative };
        addVariant(copy);
        substitutions += 1;
        if (substitutions >= 4) break;
      }
    }

    return [...candidates].slice(0, this.maxAlternatives);
  }

  /**
   * Returns the configured replacement for a single rule source (a digit,
   * "g", "ch", …). Useful for search layers that must not convert a lone
   * digit in normal text but still need the configured mapping.
   */
  literalFor(input: string): string | null {
    const normalized = normalizeLatin(input);
    if (!normalized) return null;
    const rule = this.rules.find((candidate) => candidate.source === normalized);
    return rule?.arabic ?? null;
  }

  /** Convenience wrapper returning the preferred Arabic spelling or null. */
  transliterateWord(input: string): string | null {
    const result = this.evaluate(input);
    return result.convertible ? result.arabic : null;
  }

  /**
   * Converts every Latin word in a larger text while preserving spaces,
   * punctuation and mixed Arabic/Latin content. Multi-word dictionary phrases
   * are recognized in context.
   */
  transliterateText(input: string): string {
    return this.transliterateTokens(input, false);
  }

  /**
   * A safer variant for mixed prose. Dictionary words, chat-digital spellings
   * and explicit article + noun pairs are converted, while unknown alphabetic
   * words are left untouched. This prevents ordinary English sentences from
   * being rewritten when one word happens to look transliterable.
   */
  transliterateTextConservative(input: string): string {
    return this.transliterateTokens(input, true);
  }

  private transliterateTokens(input: string, conservative: boolean): string {
    const tokens = tokenize(input);
    const output: string[] = [];

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (!token) continue;

      if (token.type !== 'word') {
        output.push(token.value);
        continue;
      }

      const phrase = this.matchPhraseAt(tokens, i);
      if (phrase) {
        output.push(phrase.arabic);
        i = phrase.lastTokenIndex;
        continue;
      }

      const normalized = normalizeLatin(token.value);
      if (ARTICLE_WORDS.has(normalized)) {
        const separator = tokens[i + 1];
        const next = tokens[i + 2];
        if (
          separator?.type === 'other' &&
          /^[ \t]+$/u.test(separator.value) &&
          next?.type === 'word'
        ) {
          const nextEvaluation = this.evaluate(next.value);
          if (nextEvaluation.convertible) {
            output.push(`ال${nextEvaluation.arabic.replace(/^ال/u, '')}`);
            i += 2;
            continue;
          }
        }
        if (conservative) {
          output.push(token.value);
          continue;
        }
      }

      const evaluation = this.evaluate(token.value);
      if (!evaluation.convertible) {
        output.push(token.value);
        continue;
      }
      if (
        conservative &&
        this.skipEnglish &&
        !evaluation.known &&
        !STRONG_TRANSLITERATION_RE.test(token.value)
      ) {
        output.push(token.value);
        continue;
      }
      output.push(evaluation.arabic);
    }

    return output.join('');
  }

  /** Transliterates the last word before a caret, a helper for live UIs. */
  transliterateWordBeforeCaret(text: string, caret = text.length): {
    evaluation: Evaluation;
    word: string;
    start: number;
    end: number;
  } | null {
    const word = getWordBeforeCaret(text, caret);
    if (!word) return null;
    return {
      evaluation: this.evaluate(word.value),
      word: word.value,
      start: word.start,
      end: word.end,
    };
  }

  private matchPhraseAt(
    tokens: ReturnType<typeof tokenize>,
    startIndex: number,
  ): { arabic: string; lastTokenIndex: number } | null {
    if (this.maxPhraseWords < 2) return null;
    const first = tokens[startIndex];
    if (!first || first.type !== 'word') return null;

    const words = [first.value];
    const tokenIndices = [startIndex];
    let cursor = startIndex;

    while (words.length < this.maxPhraseWords) {
      const separator = tokens[cursor + 1];
      const nextToken = tokens[cursor + 2];
      if (
        !separator ||
        separator.type !== 'other' ||
        !/^[ \t]+$/u.test(separator.value) ||
        !nextToken ||
        nextToken.type !== 'word'
      ) {
        break;
      }
      words.push(nextToken.value);
      tokenIndices.push(cursor + 2);
      cursor += 2;
    }

    for (let count = words.length; count >= 2; count -= 1) {
      const phrase = normalizeLatin(words.slice(0, count).join(' '));
      if (!this.isDictionaryEntryUsable(phrase)) continue;
      const spellings = this.dictionary.get(phrase);
      const firstSpelling = spellings?.[0];
      const lastTokenIndex = tokenIndices[count - 1];
      if (firstSpelling && lastTokenIndex !== undefined) {
        return { arabic: firstSpelling, lastTokenIndex };
      }
    }

    return null;
  }

  private isDictionaryEntryUsable(normalized: string): boolean {
    return this.numeric || !DIGIT_CONVENTION_RE.test(normalized);
  }

  private isEnglish(normalized: string): boolean {
    return normalized
      .split(' ')
      .every((word) => this.skipWords.has(normalizeLatin(word)));
  }

  private skipped(
    source: string,
    normalized: string,
    reason: SkipReason,
  ): Evaluation {
    return {
      source,
      normalized,
      candidates: [],
      arabic: '',
      known: false,
      convertible: false,
      reason,
    };
  }

  private segment(normalized: string): Unit[] | null {
    const units: Unit[] = [];
    let index = 0;

    while (index < normalized.length) {
      const rule = this.rules.find((candidate) =>
        normalized.startsWith(candidate.source, index),
      );
      if (rule) {
        units.push({
          kind: 'literal',
          arabic: rule.arabic,
          source: rule.source,
        });
        index += rule.source.length;
        continue;
      }

      const char = normalized[index];
      if (char === undefined) break;

      if (VOWELS.has(char)) {
        units.push({ kind: 'vowel', source: char });
      } else {
        // Unknown characters are kept and rejected after assembly. This makes
        // sure the engine never emits half-Latin output.
        units.push({ kind: 'literal', arabic: char, source: char });
      }
      index += 1;
    }

    return units.length ? units : null;
  }

  private isConvertibleSource(normalized: string): boolean {
    if (!normalized) return false;
    if (normalized.length >= 2) return looksTransliterable(normalized);
    // A few conventions are meaningful on their own, e.g. g → غ.
    return /^[a-z]$/u.test(normalized) && this.rules.some((rule) => rule.source === normalized);
  }

  /**
   * Splits an optional definite article. In this transliteration system the
   * article may be written as al-, el- or 2l- (2 = hamza/alif).
   */
  private splitArticle(normalized: string): { rest: string } | null {
    if (normalized.length < 4) return null;
    const hasArticle =
      normalized.startsWith('2l') ||
      normalized.startsWith('al') ||
      normalized.startsWith('el');
    if (!hasArticle) return null;

    const rest = normalized.slice(2);
    // "ali", "ela" and similar words are not article + stem.
    if (!rest || VOWELS.has(rest[0] ?? '')) return null;
    return { rest };
  }

  private renderUnits(
    units: Unit[],
    skippedAlif: ReadonlySet<number> = new Set<number>(),
  ): string | null {
    let output = '';

    for (let index = 0; index < units.length; index += 1) {
      const unit = units[index];
      if (!unit) continue;

      if (unit.kind === 'literal') {
        // A doubled input letter is simply written twice. This project does
        // not use shadda for doubling.
        output += unit.arabic;
        continue;
      }

      const next = units[index + 1];
      const afterNext = units[index + 2];
      const isInitial = index === 0;
      const isLast = index === units.length - 1;
      const vowel = unit.source;

      // "a" is alif by default, but it is ambiguous in Latin-script
      // Arabic. The dictionary and the generated candidates decide whether
      // this particular a is long (ا) or a short vowel that is not written.
      if (vowel === 'a') {
        if (!skippedAlif.has(index)) output += 'ا';
        continue;
      }

      if (vowel === 'e') continue;

      if (isInitial && next?.kind === 'literal') {
        output += INITIAL_VOWEL[vowel] ?? '';
        continue;
      }

      const belongsToFinalSyllable =
        next?.kind === 'literal' && index + 1 === units.length - 1;

      // "5adija": the i before the final j is long (ي).
      const beforeFinalVowelA =
        next?.kind === 'literal' &&
        afterNext?.kind === 'vowel' &&
        afterNext.source === 'a' &&
        index + 2 === units.length - 1;

      if (isLast || belongsToFinalSyllable || beforeFinalVowelA) {
        output += LONG_VOWEL[vowel] ?? '';
      }
      // Other short vowels remain unwritten (unvocalized Arabic).
    }

    return output;
  }

  private validateAssembled(
    assembled: string,
    normalized: string,
  ): string | null {
    const trimmed = assembled.trim();
    if (!trimmed) return null;
    if (NON_ARABIC_OUTPUT_RE.test(trimmed)) return null;
    if (!containsArabic(trimmed)) return null;
    if (!ARABIC_LETTER_RE.test(trimmed)) return null;
    if (!containsLatinLetter(normalized)) return null;
    return trimmed;
  }

  private fallbackWord(normalized: string): string | null {
    if (!this.isConvertibleSource(normalized)) return null;
    if (normalized.includes(' ')) return this.fallbackPhrase(normalized);

    const article = this.splitArticle(normalized);
    const stem = article ? article.rest : normalized;
    const units = this.segment(stem);
    if (!units) return null;

    const rendered = this.renderUnits(units);
    if (!rendered) return null;
    const assembled = (article ? 'ال' : '') + rendered;
    return this.validateAssembled(assembled, normalized);
  }

  private fallbackPhrase(normalized: string): string | null {
    const words = normalized.split(' ').filter(Boolean);
    if (!words.length) return null;
    const converted: string[] = [];

    for (const word of words) {
      const result = this.fallbackWord(word);
      if (!result) return null;
      converted.push(result);
    }

    return converted.join(' ');
  }
}
