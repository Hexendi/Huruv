const LATIN_WORD_SOURCE = String.raw`[\p{Script=Latin}0-9'’‘]+`;
const LATIN_WORD_RE = new RegExp(LATIN_WORD_SOURCE, 'gu');
const LATIN_WORD_AT_END_RE = new RegExp(`${LATIN_WORD_SOURCE}$`, 'u');
const WORD_CHAR_RE = /[\p{Script=Latin}0-9'’‘]/u;
const ARABIC_RE = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u;
const LATIN_LETTER_RE = /\p{Script=Latin}/u;

export interface TextToken {
  type: 'word' | 'other';
  value: string;
  start: number;
  end: number;
}

export interface WordAtCaret {
  start: number;
  end: number;
  value: string;
}

export interface PhraseWindow {
  /** Index in the original string where the phrase starts. */
  start: number;
  /** End index (the caret). */
  end: number;
  /** Full trailing sequence, e.g. "sabah el khir". */
  text: string;
  lastWord: string;
  lastWordStart: number;
}

/**
 * Normalizes Latin-script input for dictionary and rule matching.
 * Accents are removed, ligatures expanded, apostrophes unified and
 * whitespace collapsed. Arabic characters are preserved.
 */
export function normalizeLatin(input: string): string {
  return input
    .replace(/œ/giu, 'oe')
    .replace(/æ/giu, 'ae')
    .replace(/ß/gu, 'ss')
    .replace(/ø/giu, 'o')
    .replace(/đ/giu, 'd')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[’‘`´]/gu, "'")
    // Hyphens and underscores are word-internal in Latin transliteration
    // ("5a-dija" is one word), so remove them instead of emitting them into
    // the Arabic output. Spaces remain word boundaries.
    .replace(/[‐‑‒–—―−_-]+/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Normalization used by the search index. It is intentionally separate from
 * normalizeLatin():
 * - Arabic diacritics and tatweel are removed,
 * - alef/ya/ta-marbuta variants are unified so "أحمد" and "احمد" match,
 * - numbers are preserved because 2/3/4/5/6/7/9 are meaningful letters in
 *   this transliteration system,
 * - punctuation becomes a word boundary instead of being deleted.
 */
export function normalizeArabic(input: string): string {
  return input
    .replace(/\u0640+/gu, '')
    .replace(
      /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06dc\u06df-\u06e8\u06ea-\u06ed]/gu,
      '',
    )
    .replace(/[أإآٱ]/gu, 'ا')
    .replace(/ى/gu, 'ي')
    .replace(/ؤ/gu, 'و')
    .replace(/ئ/gu, 'ي')
    .replace(/ء/gu, '')
    .replace(/ة/gu, 'ه')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Latin normalization for search queries. Hyphens/underscores and other
 * punctuation become spaces, repeated whitespace is collapsed, and
 * apostrophes are kept because they may stand for ع. Callers that need the
 * apostrophe-free reading can remove it themselves.
 */
export function normalizeLatinSearch(input: string): string {
  return normalizeLatin(
    input.replace(/[‐‑‒–—―−_-]+/gu, ' '),
  )
    .replace(/[^\p{Script=Latin}0-9'\s]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export interface SearchQueryToken {
  kind: 'arabic' | 'latin';
  value: string;
}

const QUERY_TOKEN_RE =
  /([\p{Script=Latin}0-9'’‘‐‑‒–—―−_-]+)|([\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]+)/gu;

/**
 * Splits a mixed Arabic/Latin query into normalized tokens. Word boundaries
 * are punctuation, spaces and hyphens; multi-word Arabic phrases are kept
 * together as one token so phrase matching still works.
 */
export function tokenizeSearchQuery(input: string): SearchQueryToken[] {
  const tokens: SearchQueryToken[] = [];

  for (const match of input.matchAll(QUERY_TOKEN_RE)) {
    const latin = match[1];
    const arabic = match[2];

    if (latin) {
      // The regex captures a contiguous run, so a hyphen inside it is
      // word-internal ("5A-DIJA" → "5adija"). Real spaces are matched as
      // separate runs and stay word boundaries.
      const joined = latin.replace(/[‐‑‒–—―−_-]+/gu, '');
      const normalized = normalizeLatinSearch(joined);
      for (const piece of normalized.split(' ')) {
        if (piece) tokens.push({ kind: 'latin', value: piece });
      }
    }

    if (arabic) {
      const normalized = normalizeArabic(arabic);
      if (normalized) tokens.push({ kind: 'arabic', value: normalized });
    }
  }

  return tokens;
}

export function isWordChar(char: string): boolean {
  return WORD_CHAR_RE.test(char);
}

export function containsArabic(input: string): boolean {
  return ARABIC_RE.test(input);
}

export function containsLatinLetter(input: string): boolean {
  return LATIN_LETTER_RE.test(input);
}

export function tokenize(input: string): TextToken[] {
  const tokens: TextToken[] = [];
  let cursor = 0;

  for (const match of input.matchAll(LATIN_WORD_RE)) {
    const start = match.index;
    if (start === undefined) continue;
    if (start > cursor) {
      tokens.push({
        type: 'other',
        value: input.slice(cursor, start),
        start: cursor,
        end: start,
      });
    }
    const value = match[0];
    tokens.push({
      type: 'word',
      value,
      start,
      end: start + value.length,
    });
    cursor = start + value.length;
  }

  if (cursor < input.length) {
    tokens.push({
      type: 'other',
      value: input.slice(cursor),
      start: cursor,
      end: input.length,
    });
  }

  return tokens;
}

/** Returns the Latin word immediately before a caret position. */
export function getWordBeforeCaret(
  text: string,
  caret = text.length,
): WordAtCaret | null {
  const end = Math.max(0, Math.min(caret, text.length));
  const before = text.slice(0, end);
  const match = before.match(LATIN_WORD_AT_END_RE);
  if (!match) return null;

  const value = match[0];
  return { start: end - value.length, end, value };
}

/**
 * Returns the up-to-N-word Latin sequence ending at the caret, along with
 * its final word. Only plain spaces and tabs may separate words; punctuation
 * intentionally breaks the window.
 */
export function getPhraseWindowBeforeCaret(
  text: string,
  caret = text.length,
  maxWords = 4,
): PhraseWindow | null {
  if (maxWords < 1) return null;
  const end = Math.max(0, Math.min(caret, text.length));
  const before = text.slice(0, end);
  const phraseRe = new RegExp(
    `(${LATIN_WORD_SOURCE}(?:[ \\t]+${LATIN_WORD_SOURCE}){0,${maxWords - 1}})$`,
    'u',
  );
  const match = before.match(phraseRe);
  if (!match || match.index === undefined) return null;

  const phrase = match[1];
  if (!phrase) return null;

  const lastMatch = phrase.match(LATIN_WORD_AT_END_RE);
  if (!lastMatch) return null;
  const lastWord = lastMatch[0];

  return {
    start: match.index,
    end,
    text: phrase,
    lastWord,
    lastWordStart: end - lastWord.length,
  };
}

/** A conservative check used before attempting a conversion. */
export function looksTransliterable(input: string): boolean {
  const normalized = normalizeLatin(input);
  if (!normalized || !containsLatinLetter(normalized)) return false;
  if (normalized.length < 2) return false;
  return true;
}
